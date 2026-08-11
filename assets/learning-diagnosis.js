(function (global) {
  "use strict";

  const MAX_OUTBOX_ENTRIES = 5;
  const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  let currentConfig = null;
  let currentResult = null;
  let flushPromise = null;
  let retryTimer = null;
  let initialized = false;

  function identity() {
    const session = global.BrainPlatform?.identity?.readStudentSession?.();
    if (!session || session.isGuest || !session.studentId || !session.sessionToken) return null;
    return session;
  }

  function outboxKey() {
    return global.BrainPlatform.config.storageKeys.learningDiagnosisOutbox;
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(global.localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    global.localStorage.setItem(key, JSON.stringify(value));
  }

  function readOutbox() {
    const value = readJson(outboxKey(), { entries: [] });
    return {
      entries: Array.isArray(value.entries)
        ? value.entries.filter((entry) => entry && Number(entry.expiresAt) > Date.now()).slice(-MAX_OUTBOX_ENTRIES)
        : []
    };
  }

  function enqueue() {
    const session = identity();
    if (!session) return false;
    const outbox = readOutbox();
    if (!outbox.entries.some((entry) => entry.owner === session.studentId)) {
      outbox.entries.push({
        owner: session.studentId,
        attempts: 0,
        nextAttemptAt: 0,
        expiresAt: Date.now() + OUTBOX_TTL_MS
      });
      writeJson(outboxKey(), outbox);
    }
    return true;
  }

  async function post(url, body) {
    const session = identity();
    if (!session) throw Object.assign(new Error("UNAUTHORIZED"), { retryable: false });
    const response = await global.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify(body || {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error("HTTP_ERROR"), { retryable: response.status >= 500 });
    return result;
  }

  function updateVirtualAgent() {
    global.VirtualAgent?.setDiagnosisState?.({
      eligible: Boolean(currentResult?.eligibility?.eligible),
      generationReady: Boolean(currentResult?.eligibility?.generationReady),
      available: Boolean(currentResult?.diagnosis),
      retryable: Boolean(currentResult?.canRetry),
      open: openDiagnosis,
      retry: requestGeneration
    });
  }

  async function saveNotice(response) {
    try {
      const result = await post(global.BrainPlatform.config.endpoints.getLearningDiagnosis, {
        action: "notice",
        response
      });
      if (result.ok) currentResult = result;
      return result;
    } catch (error) {
      return { ok: false };
    }
  }

  function maybeShowReadyNotice() {
    if (!currentResult?.diagnosis || !currentResult?.notice?.shouldNotify || !global.VirtualAgent) return false;
    if (global.VirtualAgent.isBusy()) return false;
    const shown = global.VirtualAgent.showDiagnosisReady({
      onView() {
        saveNotice("viewed");
        openDiagnosis();
      },
      onLater() {
        saveNotice("later");
      }
    });
    if (shown) {
      currentResult.notice.shouldNotify = false;
      saveNotice("shown");
    }
    return shown;
  }

  async function refresh() {
    if (!identity()) return null;
    try {
      const result = await post(global.BrainPlatform.config.endpoints.getLearningDiagnosis, { action: "read" });
      if (!result.ok) throw new Error(result.code || "DIAGNOSIS_READ_FAILED");
      currentResult = result;
      updateVirtualAgent();
      if (result.eligibility?.eligible && result.eligibility?.generationReady && !result.diagnosis) {
        enqueue();
        flush();
      } else {
        maybeShowReadyNotice();
      }
      return result;
    } catch (error) {
      return null;
    }
  }

  function scheduleRetry(entries) {
    if (!entries.length || typeof global.setTimeout !== "function") return;
    if (retryTimer) global.clearTimeout(retryTimer);
    const nextAt = Math.min(...entries.map((entry) => Number(entry.nextAttemptAt) || Date.now() + 5000));
    retryTimer = global.setTimeout(() => {
      retryTimer = null;
      flush();
    }, Math.max(1000, Math.min(5 * 60 * 1000, nextAt - Date.now())));
  }

  async function runFlush() {
    const session = identity();
    if (!session) return { ok: false, code: "UNAUTHORIZED" };
    const outbox = readOutbox();
    const remaining = [];
    for (const entry of outbox.entries) {
      if (entry.owner !== session.studentId || Number(entry.nextAttemptAt) > Date.now()) {
        remaining.push(entry);
        continue;
      }
      try {
        const result = await post(global.BrainPlatform.config.endpoints.generateLearningDiagnosis, {});
        if (result.ok) {
          global.document?.dispatchEvent(new CustomEvent("learning-diagnosis:generated", {
            detail: { diagnosisVersion: result.diagnosisVersion, operation: result.operation }
          }));
          continue;
        }
        if (result.code === "MEMORIES_NOT_READY") {
          const stale = result.readiness?.staleMemoryExperimentIds || [];
          for (const experimentId of stale) {
            await global.StudentMemory?.requestGeneration?.(experimentId);
          }
        }
        if (result.retryable) {
          const attempts = Number(entry.attempts || 0) + 1;
          remaining.push({
            ...entry,
            attempts,
            nextAttemptAt: Date.now() + Math.min(5 * 60 * 1000, 5000 * (2 ** Math.min(attempts, 5)))
          });
        }
      } catch (error) {
        const attempts = Number(entry.attempts || 0) + 1;
        remaining.push({
          ...entry,
          attempts,
          nextAttemptAt: Date.now() + Math.min(5 * 60 * 1000, 5000 * (2 ** Math.min(attempts, 5)))
        });
      }
    }
    writeJson(outboxKey(), { entries: remaining.slice(-MAX_OUTBOX_ENTRIES), updatedAt: new Date().toISOString() });
    scheduleRetry(remaining);
    await refresh();
    return { ok: remaining.length === 0, queued: remaining.length };
  }

  function flush() {
    if (flushPromise) return flushPromise;
    flushPromise = runFlush().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  function requestGeneration() {
    if (!enqueue()) return Promise.resolve({ ok: false, code: "UNAUTHORIZED" });
    return flush();
  }

  function getStudentView() {
    if (currentResult) return Promise.resolve(currentResult);
    return refresh();
  }

  function openDiagnosis() {
    global.open("diagnosis.html", "_blank");
  }

  function init(config) {
    if (!config || !config.experimentId || !identity()) return null;
    currentConfig = config;
    if (!initialized) {
      initialized = true;
      global.document.addEventListener("student-memory:generated", () => requestGeneration());
      global.document.addEventListener("experiment-records:acknowledged", (event) => {
        const detail = event.detail || {};
        if (detail.recordType === "submission" && detail.module === "strategies") {
          global.StudentMemory?.requestGeneration?.("strategies").then(() => requestGeneration());
        } else if (detail.recordType === "submission" && detail.module === "poster") {
          requestGeneration();
        }
      });
      global.addEventListener("online", () => flush());
    }
    refresh();
    flush();
    return api;
  }

  const api = Object.freeze({
    init,
    refresh,
    requestGeneration,
    getStudentView,
    flush,
    open: openDiagnosis
  });
  global.LearningDiagnosis = api;
})(window);
