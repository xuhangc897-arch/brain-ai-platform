(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const INTERVENTION_TYPE = "suggest_voice_input";
  const MESSAGE = "如果打字有困难的话，可以让语音转文字助手来帮你！";
  const OUTBOX_LIMIT = 100;
  const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const LOCAL_STATE_LIMIT = 500;
  let initialized = false;
  let experimentId = "";
  let activeTarget = null;
  let activeSuggestionKey = "";
  let evaluationTimer = 0;
  let outboxSequence = 0;
  let flushPromise = null;

  function identity() {
    const session = global.BrainPlatform?.identity?.readStudentSession?.();
    const studentId = session && String(session.studentId || "").trim();
    if (!session || session.isGuest || session.role === "guest" || !studentId || studentId === "guest") {
      return null;
    }
    const sessionToken = String(session.sessionToken || "").trim();
    if (!sessionToken) return null;
    return { studentId, sessionToken };
  }

  function eligibleTarget(target) {
    return target instanceof Element &&
      target.matches('textarea[data-agent-track="true"][data-voice-suggestion="true"]') &&
      !target.disabled &&
      !target.readOnly &&
      target.isConnected;
  }

  function taskKey(target, studentId) {
    return [
      studentId,
      target.dataset.experimentId,
      target.dataset.stageId,
      target.dataset.taskId
    ].join("|");
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).normalize("NFC").replace(/\s+/gu, " ").trim();
  }

  function textFingerprint(value) {
    let hash = 2166136261;
    for (const character of Array.from(normalizeText(value))) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function stateSignature(target, triggerReasons) {
    return `${textFingerprint(target.value)}|${triggerReasons.slice().sort().join(",")}`;
  }

  function pageId() {
    return global.location?.pathname?.split("/").pop() || experimentId;
  }

  function stateStorageKey() {
    return global.BrainPlatform.config.storageKeys.typingSupportState;
  }

  function outboxStorageKey() {
    return global.BrainPlatform.config.storageKeys.agentInterventionOutbox;
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(global.localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function readLocalState() {
    const items = readJson(stateStorageKey(), []);
    return Array.isArray(items) ? items.filter((item) => item && item.key) : [];
  }

  function writeLocalState(items) {
    try {
      global.localStorage.setItem(stateStorageKey(), JSON.stringify(items.slice(-LOCAL_STATE_LIMIT)));
    } catch (error) {
      console.warn("[TypingSupport] Unable to update local reminder state.");
    }
  }

  function upsertLocalEntry(entry) {
    const items = readLocalState().filter((item) => item.key !== entry.key);
    items.push(entry);
    writeLocalState(items);
  }

  function findLocalEntry(key) {
    return readLocalState().find((item) => item.key === key) || null;
  }

  function isInCooldown(studentId, now) {
    const prefix = `${studentId}|${experimentId}|`;
    return readLocalState().some((item) =>
      item.key.startsWith(prefix) &&
      now - Number(item.shownAt || 0) < global.TypingSupportRules.values.cooldownMs
    );
  }

  function readOutbox() {
    const now = Date.now();
    const items = readJson(outboxStorageKey(), []);
    return Array.isArray(items)
      ? items.filter((item) => item && item.record && item.expiresAt > now)
      : [];
  }

  function writeOutbox(items) {
    try {
      global.localStorage.setItem(outboxStorageKey(), JSON.stringify(items.slice(-OUTBOX_LIMIT)));
    } catch (error) {
      console.warn("[TypingSupport] Unable to update the intervention outbox.");
    }
  }

  function enqueue(record) {
    const key = [
      record.studentId,
      record.experimentId,
      record.stageId,
      record.taskId,
      record.interventionType
    ].join("|");
    const items = readOutbox().filter((item) => item.key !== key);
    items.push({
      key,
      revision: `${Date.now()}-${outboxSequence += 1}`,
      expiresAt: Date.now() + OUTBOX_TTL_MS,
      record
    });
    writeOutbox(items);
  }

  async function send(record, keepalive) {
    const student = identity();
    if (!student || student.studentId !== record.studentId) {
      const error = new Error("Student session is unavailable.");
      error.retryable = true;
      throw error;
    }
    const response = await global.fetch(global.BrainPlatform.config.endpoints.saveAgentIntervention, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${student.sessionToken}`
      },
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, intervention: record }),
      keepalive: Boolean(keepalive)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok !== true) {
      const error = new Error(result?.message || "Intervention save failed.");
      error.retryable = !result || result.retryable !== false;
      throw error;
    }
  }

  async function drainOutbox() {
    if (!identity()) return;
    for (const item of readOutbox()) {
      try {
        await send(item.record, false);
        writeOutbox(readOutbox().filter((candidate) =>
          candidate.key !== item.key || candidate.revision !== item.revision
        ));
      } catch (error) {
        if (error.retryable === false) {
          writeOutbox(readOutbox().filter((candidate) =>
            candidate.key !== item.key || candidate.revision !== item.revision
          ));
          console.warn("[TypingSupport] Invalid intervention record was discarded.");
          continue;
        }
        console.warn("[TypingSupport] Intervention save deferred.");
        break;
      }
    }
  }

  function flush(options) {
    if (options?.keepalive) {
      if (!identity()) return Promise.resolve();
      readOutbox().forEach((item) => send(item.record, true).catch(() => {}));
      return Promise.resolve();
    }
    if (!flushPromise) flushPromise = drainOutbox().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  function buildIntervention(target, metrics, triggerReasons, studentId, triggeredAt) {
    return {
      schemaVersion: SCHEMA_VERSION,
      studentId,
      experimentId: target.dataset.experimentId,
      stageId: target.dataset.stageId,
      taskId: target.dataset.taskId,
      pageId: pageId(),
      interventionType: INTERVENTION_TYPE,
      triggerReasons: triggerReasons.slice(),
      triggerMetrics: {
        observedDurationMs: Math.round(metrics.observedDurationMs),
        effectiveCharacterCount: metrics.effectiveCharacterCount,
        pauseCount: metrics.pauseCount,
        longestPauseMs: Math.round(metrics.longestPauseMs),
        deleteCount: metrics.deleteCount,
        largeDeleteCount: metrics.largeDeleteCount,
        focusCount: metrics.focusCount
      },
      studentResponse: "ignored",
      voiceInsertSucceeded: false,
      triggeredAt: new Date(triggeredAt).toISOString()
    };
  }

  function updateResponse(key, response) {
    const entry = findLocalEntry(key);
    if (!entry || !entry.intervention) return null;
    const next = Object.assign({}, entry, {
      response,
      intervention: Object.assign({}, entry.intervention, {
        studentResponse: response
      })
    });
    upsertLocalEntry(next);
    enqueue(next.intervention);
    drainOutbox();
    return next;
  }

  function handleSuggestionResponse(key, response, target) {
    if (key !== activeSuggestionKey) return;
    activeSuggestionKey = "";
    const entry = updateResponse(key, response);
    if (response === "accepted" && entry) {
      global.VirtualAgent.openVoiceFor(target);
    }
  }

  function showSuggestion(target, metrics, result, studentId, now) {
    const key = taskKey(target, studentId);
    const signature = stateSignature(target, result.triggerReasons);
    const previous = findLocalEntry(key);
    if (previous?.lastStateSignature === signature) return false;
    const intervention = buildIntervention(target, metrics, result.triggerReasons, studentId, now);
    const shown = global.VirtualAgent.showVoiceSuggestion({
      target,
      message: MESSAGE,
      onResponse: (response) => handleSuggestionResponse(key, response, target)
    });
    if (!shown) return false;

    activeSuggestionKey = key;
    upsertLocalEntry(Object.assign({}, previous, {
      key,
      shownAt: now,
      lastStateSignature: signature,
      response: "shown",
      intervention
    }));
    if (global.AGENT_DEBUG === true) {
      console.debug("[TypingSupport] Voice suggestion shown.", {
        experimentId: intervention.experimentId,
        stageId: intervention.stageId,
        taskId: intervention.taskId,
        triggerReasons: intervention.triggerReasons,
        triggerMetrics: intervention.triggerMetrics
      });
    }
    return true;
  }

  function evaluateActiveTarget() {
    global.clearTimeout(evaluationTimer);
    evaluationTimer = 0;
    if (!activeTarget || !eligibleTarget(activeTarget) || document.activeElement !== activeTarget) return;
    const currentIdentity = identity();
    if (!currentIdentity) return;
    const metrics = global.LearningBehaviorTracker.getTaskMetrics(activeTarget);
    if (!metrics || metrics.taskStatus === "submitted") return;
    const now = Date.now();
    if (!isInCooldown(currentIdentity.studentId, now) && !global.VirtualAgent.isBusy()) {
      const result = global.TypingSupportRules.evaluate(metrics, now);
      if (result.shouldSuggest) {
        showSuggestion(activeTarget, metrics, result, currentIdentity.studentId, now);
      }
    }
    if (!activeSuggestionKey) {
      evaluationTimer = global.setTimeout(evaluateActiveTarget, 1000);
    }
  }

  function beginMonitoring(target) {
    if (!eligibleTarget(target) || !identity()) return;
    if (activeTarget && activeTarget !== target && activeSuggestionKey) {
      global.VirtualAgent.hideVoiceSuggestion("ignored");
    }
    activeTarget = target;
    evaluateActiveTarget();
  }

  function stopTimer() {
    global.clearTimeout(evaluationTimer);
    evaluationTimer = 0;
  }

  function onFocusOut(event) {
    if (event.target !== activeTarget) return;
    stopTimer();
    global.setTimeout(() => {
      const next = document.activeElement;
      if (global.VirtualAgent.isSuggestionElement(next)) return;
      if (activeTarget && !activeTarget.isConnected) {
        if (activeSuggestionKey) global.VirtualAgent.hideVoiceSuggestion("ignored");
        activeTarget = null;
        return;
      }
      if (eligibleTarget(next) && next !== activeTarget) {
        if (activeSuggestionKey) global.VirtualAgent.hideVoiceSuggestion("ignored");
        beginMonitoring(next);
      }
    }, 0);
  }

  function onStageSubmitted(event) {
    if (!event.detail || event.detail.experimentId !== experimentId) return;
    if (activeTarget?.dataset.stageId !== event.detail.stageId) return;
    stopTimer();
    if (activeSuggestionKey) global.VirtualAgent.hideVoiceSuggestion("ignored");
    activeTarget = null;
  }

  function onVoiceInserted(event) {
    const target = event.detail?.target;
    if (!eligibleTarget(target)) return;
    const currentIdentity = identity();
    if (!currentIdentity) return;
    const key = taskKey(target, currentIdentity.studentId);
    const entry = findLocalEntry(key);
    if (!entry || entry.response !== "accepted" || !entry.intervention) return;
    const next = Object.assign({}, entry, {
      intervention: Object.assign({}, entry.intervention, {
        studentResponse: "accepted",
        voiceInsertSucceeded: true
      })
    });
    upsertLocalEntry(next);
    enqueue(next.intervention);
    drainOutbox();
  }

  function beforePageChange() {
    stopTimer();
    if (activeSuggestionKey) global.VirtualAgent.hideVoiceSuggestion("ignored");
    activeTarget = null;
  }

  function afterPageRender() {
    if (activeTarget && !activeTarget.isConnected) activeTarget = null;
  }

  function recoverUnresolvedEntries() {
    const currentIdentity = identity();
    if (!currentIdentity) return;
    readLocalState().forEach((entry) => {
      if (entry.response !== "shown" || !entry.intervention ||
          entry.intervention.studentId !== currentIdentity.studentId) return;
      updateResponse(entry.key, "ignored");
    });
  }

  function init(options) {
    if (initialized) return true;
    if (!options?.experimentId || !global.TypingSupportRules ||
        !global.LearningBehaviorTracker || !global.VirtualAgent) {
      console.warn("[TypingSupport] Required components are unavailable.");
      return false;
    }
    experimentId = String(options.experimentId);
    initialized = true;
    recoverUnresolvedEntries();
    document.addEventListener("focusin", (event) => beginMonitoring(event.target));
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("learning-behavior:stage-submitted", onStageSubmitted);
    document.addEventListener("voice-assistant:text-inserted", onVoiceInserted);
    global.addEventListener("online", drainOutbox);
    global.addEventListener("pagehide", () => {
      stopTimer();
      if (activeSuggestionKey) global.VirtualAgent.hideVoiceSuggestion("ignored");
      flush({ keepalive: true });
    });
    drainOutbox();
    return true;
  }

  global.TypingSupport = Object.freeze({ init, beforePageChange, afterPageRender, flush });
  global.__TypingSupportTestHooks = Object.freeze({
    message: MESSAGE,
    normalizeText,
    textFingerprint,
    stateSignature
  });
})(window);
