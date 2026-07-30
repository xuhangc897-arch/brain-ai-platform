(function (global) {
  "use strict";

  const MAX_SUPPORTS_PER_EXPERIMENT = 2;
  let currentConfig = null;
  let currentView = null;
  let activeSupport = null;
  let flushPromise = null;
  let retryTimer = null;

  function identity() {
    const session = global.BrainPlatform?.identity?.readStudentSession?.();
    if (!session || session.isGuest || !session.studentId || !session.sessionToken) return null;
    return session;
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

  function outboxKey() {
    return global.BrainPlatform.config.storageKeys.studentMemoryOutbox;
  }

  function supportStateKey() {
    return global.BrainPlatform.config.storageKeys.studentMemorySupportState;
  }

  function readOutbox() {
    const value = readJson(outboxKey(), { entries: [] });
    return {
      entries: Array.isArray(value.entries)
        ? value.entries.filter((entry) => entry && entry.experimentId && Number(entry.expiresAt) > Date.now()).slice(-20)
        : []
    };
  }

  function enqueueGeneration(experimentId) {
    const session = identity();
    if (!session || !experimentId) return false;
    const outbox = readOutbox();
    const key = `${session.studentId}|${experimentId}`;
    if (!outbox.entries.some((entry) => entry.key === key)) {
      outbox.entries.push({
        key,
        owner: session.studentId,
        experimentId,
        attempts: 0,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      });
      writeJson(outboxKey(), outbox);
    }
    return true;
  }

  async function post(url, body) {
    const session = identity();
    if (!session) throw new Error("UNAUTHORIZED");
    const response = await global.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error("HTTP_ERROR"), { retryable: response.status >= 500 });
    return result;
  }

  async function runFlush() {
    const session = identity();
    if (!session) return { ok: false, code: "UNAUTHORIZED" };
    const outbox = readOutbox();
    const remaining = [];
    for (const entry of outbox.entries) {
      if (entry.owner !== session.studentId) {
        remaining.push(entry);
        continue;
      }
      try {
        const result = await post(global.BrainPlatform.config.endpoints.generateExperimentMemory, {
          experimentId: entry.experimentId
        });
        if (result.ok && global.document && typeof global.CustomEvent === "function") {
          global.document.dispatchEvent(new CustomEvent("student-memory:generated", {
            detail: {
              experimentId: entry.experimentId,
              operation: result.operation || "",
              version: result.version || 0
            }
          }));
        }
        if (!result.ok && result.retryable) {
          remaining.push({ ...entry, attempts: Number(entry.attempts || 0) + 1 });
        }
      } catch (error) {
        remaining.push({ ...entry, attempts: Number(entry.attempts || 0) + 1 });
      }
    }
    writeJson(outboxKey(), { entries: remaining.slice(-20), updatedAt: new Date().toISOString() });
    if (remaining.length && typeof global.setTimeout === "function") {
      if (retryTimer) global.clearTimeout(retryTimer);
      const attempts = Math.max(...remaining.map((entry) => Number(entry.attempts) || 0));
      retryTimer = global.setTimeout(() => {
        retryTimer = null;
        flush();
      }, Math.min(5 * 60 * 1000, 5000 * (2 ** Math.min(attempts, 5))));
    }
    return { ok: remaining.length === 0, queued: remaining.length };
  }

  function flush() {
    if (flushPromise) return flushPromise;
    flushPromise = runFlush().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  function requestGeneration(experimentId) {
    if (!enqueueGeneration(experimentId)) return Promise.resolve({ ok: false, code: "UNAUTHORIZED" });
    return flush();
  }

  async function loadStudentView() {
    if (!identity()) return null;
    const result = await post(global.BrainPlatform.config.endpoints.getStudentMemory, {
      experimentId: currentConfig?.experimentId || ""
    });
    if (!result.ok) throw new Error(result.code || "MEMORY_READ_FAILED");
    currentView = result.view || {};
    return currentView;
  }

  function getStudentView() {
    return currentView ? Promise.resolve(currentView) : loadStudentView();
  }

  function supportKey(item, stageId) {
    return [currentConfig.experimentId, stageId, item.supportType || "support", item.message || ""].join("|").slice(0, 300);
  }

  function readSupportState() {
    const session = identity();
    const value = readJson(supportStateKey(), { entries: {} });
    const entries = value.entries && typeof value.entries === "object" ? value.entries : {};
    const ownerKey = session ? `${session.studentId}|${currentConfig.experimentId}` : "";
    return { value, entries, ownerKey, shown: Array.isArray(entries[ownerKey]) ? entries[ownerKey] : [] };
  }

  function rememberShown(key) {
    const state = readSupportState();
    state.entries[state.ownerKey] = state.shown.concat(key).slice(-MAX_SUPPORTS_PER_EXPERIMENT);
    writeJson(supportStateKey(), { entries: state.entries, updatedAt: new Date().toISOString() });
  }

  function recordSupport(target, item, response) {
    const session = identity();
    if (!session) return;
    const stageId = target.dataset.stageId || "";
    const supportId = supportKey(item, stageId).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100);
    global.fetch(global.BrainPlatform.config.endpoints.saveAgentIntervention, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        intervention: {
          schemaVersion: 1,
          studentId: session.studentId,
          experimentId: currentConfig.experimentId,
          stageId,
          taskId: target.dataset.taskId || `memory_support_${stageId}`,
          pageId: location.pathname,
          interventionType: "memory_support",
          studentResponse: response,
          supportId,
          supportMessage: item.message,
          triggeredAt: new Date().toISOString()
        }
      })
    }).catch(() => {});
  }

  function considerSupport(target) {
    if (!target?.matches?.('[data-agent-track="true"]') || !currentView || !global.VirtualAgent) return;
    const stageId = target.dataset.stageId || "";
    const items = Array.isArray(currentView.contextualSupport) ? currentView.contextualSupport : [];
    const item = items.find((candidate) => candidate.stageId === stageId && candidate.message);
    if (!item) return;
    const state = readSupportState();
    const key = supportKey(item, stageId);
    if (state.shown.length >= MAX_SUPPORTS_PER_EXPERIMENT || state.shown.includes(key) || global.VirtualAgent.isBusy()) return;
    const shown = global.VirtualAgent.showMemorySupport({
      target,
      message: item.message,
      onResponse(response) {
        recordSupport(target, item, response);
        activeSupport = null;
      }
    });
    if (shown) {
      activeSupport = { target, item };
      rememberShown(key);
    }
  }

  function reconcilePreviousExperiments() {
    const registry = global.BrainExperimentRegistry;
    const current = registry?.get(currentConfig.experimentId);
    if (!current || current.order <= 1) return;
    registry.experiments
      .filter((entry) => entry.order < current.order && entry.order <= 4)
      .forEach((entry) => enqueueGeneration(entry.id));
    flush().then(() => loadStudentView().catch(() => null));
  }

  function init(config) {
    if (!config || !config.experimentId || !identity()) return null;
    currentConfig = config;
    loadStudentView().then(reconcilePreviousExperiments).catch(() => reconcilePreviousExperiments());
    document.addEventListener("focusin", (event) => considerSupport(event.target));
    document.addEventListener("experiment-records:acknowledged", (event) => {
      const detail = event.detail || {};
      if (detail.recordType === "submission" && detail.module === currentConfig.experimentId) {
        requestGeneration(detail.module).then(() => loadStudentView().catch(() => null));
      }
    });
    global.addEventListener("online", () => flush());
    global.addEventListener("pagehide", () => {
      if (activeSupport) recordSupport(activeSupport.target, activeSupport.item, "ignored");
    });
    flush();
    return api;
  }

  const api = Object.freeze({ init, requestGeneration, getStudentView, flush });
  global.StudentMemory = api;
})(window);
