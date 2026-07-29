(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const PAUSE_MS = 3000;
  const SAVE_DELAY_MS = 5000;
  const LARGE_DELETE_SIZE = 5;
  const OUTBOX_LIMIT = 100;
  const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const states = new Map();
  const pendingVoice = new WeakMap();
  let config = null;
  let initialized = false;
  let lastActiveKey = "";
  let pendingAiStage = "";
  let flushPromise = null;
  let warnedIdentity = false;
  let outboxSequence = 0;

  function codePoints(value) {
    return Array.from(String(value == null ? "" : value));
  }

  function effectiveCount(value) {
    return codePoints(value).filter((character) => !/\s/u.test(character)).length;
  }

  function commonEdit(before, after) {
    const oldChars = codePoints(before);
    const newChars = codePoints(after);
    let start = 0;
    while (start < oldChars.length && start < newChars.length && oldChars[start] === newChars[start]) start += 1;
    let oldEnd = oldChars.length;
    let newEnd = newChars.length;
    while (oldEnd > start && newEnd > start && oldChars[oldEnd - 1] === newChars[newEnd - 1]) {
      oldEnd -= 1;
      newEnd -= 1;
    }
    return { inserted: newEnd - start, deleted: oldEnd - start };
  }

  function trackedElement(target) {
    return target instanceof Element &&
      target.matches('textarea[data-agent-track="true"][data-experiment-id][data-stage-id][data-task-id]');
  }

  function taskKey(target) {
    return [target.dataset.experimentId, target.dataset.stageId, target.dataset.taskId].join("|");
  }

  function currentIdentity() {
    const platform = global.BrainPlatform;
    const session = platform && platform.identity && platform.identity.readStudentSession
      ? platform.identity.readStudentSession()
      : null;
    const studentId = session && String(session.studentId || "").trim();
    if (!session || session.isGuest || session.role === "guest" || !studentId || studentId === "guest") {
      if (!warnedIdentity) {
        console.error("[LearningBehaviorTracker] No verified student session; persistence is disabled.");
        warnedIdentity = true;
      }
      return null;
    }
    return { studentId };
  }

  function iso(time) {
    return time ? new Date(time).toISOString() : null;
  }

  function pageId() {
    const name = global.location && global.location.pathname
      ? global.location.pathname.split("/").pop()
      : "";
    return name || config.experimentId;
  }

  function ensureState(target) {
    const key = taskKey(target);
    let state = states.get(key);
    if (!state) {
      state = {
        key,
        experimentId: target.dataset.experimentId,
        stageId: target.dataset.stageId,
        taskId: target.dataset.taskId,
        element: target,
        value: target.value || "",
        firstFocusedAt: 0,
        firstInputAt: 0,
        lastInputAt: 0,
        activeTypingDurationMs: 0,
        keyboardInputCharacterCount: 0,
        deleteCount: 0,
        largeDeleteCount: 0,
        pauseCount: 0,
        longestPauseMs: 0,
        keyboardUsed: false,
        voiceUsed: false,
        aiUsed: false,
        taskStatus: "in_progress",
        composing: false,
        compositionStartValue: "",
        ignoreInputValue: null,
        saveTimer: 0,
        dirty: false
      };
      states.set(key, state);
    } else {
      state.element = target;
      if (!state.composing && document.activeElement !== target) state.value = target.value || "";
    }
    return state;
  }

  function inputMethod(state) {
    if (state.voiceUsed && state.keyboardUsed) return "mixed";
    if (state.voiceUsed) return "voice";
    if (state.keyboardUsed) return "keyboard";
    return "";
  }

  function debugState(state) {
    return {
      experimentId: state.experimentId,
      stageId: state.stageId,
      taskId: state.taskId,
      inputMethod: inputMethod(state),
      typingDurationMs: state.firstInputAt && state.lastInputAt
        ? Math.max(0, state.lastInputAt - state.firstInputAt)
        : 0,
      activeTypingDurationMs: state.activeTypingDurationMs,
      effectiveCharacterCount: effectiveCount(state.value),
      keyboardInputCharacterCount: state.keyboardInputCharacterCount,
      deleteCount: state.deleteCount,
      largeDeleteCount: state.largeDeleteCount,
      pauseCount: state.pauseCount,
      longestPauseMs: state.longestPauseMs,
      aiUsed: state.aiUsed,
      voiceUsed: state.voiceUsed,
      taskStatus: state.taskStatus
    };
  }

  function logDebug(state) {
    if (global.AGENT_DEBUG === true) console.debug("[LearningBehaviorTracker]", debugState(state));
  }

  function snapshot(state, status) {
    const identity = currentIdentity();
    if (!identity) return null;
    const nextStatus = state.taskStatus === "submitted" ? "submitted" : (status || state.taskStatus);
    return {
      schemaVersion: SCHEMA_VERSION,
      studentId: identity.studentId,
      experimentId: state.experimentId,
      stageId: state.stageId,
      taskId: state.taskId,
      inputText: state.value,
      inputMethod: inputMethod(state),
      typingDurationMs: state.firstInputAt && state.lastInputAt
        ? Math.max(0, state.lastInputAt - state.firstInputAt)
        : 0,
      activeTypingDurationMs: state.activeTypingDurationMs,
      effectiveCharacterCount: effectiveCount(state.value),
      keyboardInputCharacterCount: state.keyboardInputCharacterCount,
      deleteCount: state.deleteCount,
      largeDeleteCount: state.largeDeleteCount,
      pauseCount: state.pauseCount,
      longestPauseMs: state.longestPauseMs,
      aiUsed: state.aiUsed,
      voiceUsed: state.voiceUsed,
      taskStatus: nextStatus,
      firstFocusedAt: iso(state.firstFocusedAt),
      firstInputAt: iso(state.firstInputAt),
      lastInputAt: iso(state.lastInputAt),
      pageId: pageId()
    };
  }

  function outboxKey() {
    return global.BrainPlatform.config.storageKeys.learningBehaviorOutbox;
  }

  function readOutbox() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(outboxKey()) || "[]");
      const now = Date.now();
      return Array.isArray(parsed)
        ? parsed.filter((item) => item && item.expiresAt > now && item.record)
        : [];
    } catch (error) {
      return [];
    }
  }

  function writeOutbox(items) {
    try {
      global.localStorage.setItem(outboxKey(), JSON.stringify(items.slice(-OUTBOX_LIMIT)));
    } catch (error) {
      console.warn("[LearningBehaviorTracker] Unable to update the local outbox.");
    }
  }

  function enqueue(record) {
    if (!record) return;
    const key = [record.studentId, record.experimentId, record.stageId, record.taskId].join("|");
    const items = readOutbox().filter((item) => item.key !== key);
    items.push({
      key,
      revision: `${Date.now()}-${outboxSequence += 1}`,
      expiresAt: Date.now() + OUTBOX_TTL_MS,
      record
    });
    writeOutbox(items);
  }

  async function sendRecord(record, keepalive) {
    const response = await global.fetch(global.BrainPlatform.config.endpoints.saveLearningRecord, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, record }),
      keepalive: Boolean(keepalive)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok !== true) {
      const error = new Error(result && result.message ? result.message : "Learning record save failed.");
      error.retryable = !result || result.retryable !== false;
      throw error;
    }
    return result;
  }

  async function drainOutbox() {
    if (!currentIdentity()) return;
    for (const item of readOutbox()) {
      try {
        await sendRecord(item.record, false);
        writeOutbox(readOutbox().filter((candidate) =>
          candidate.key !== item.key || candidate.revision !== item.revision
        ));
      } catch (error) {
        if (error.retryable === false) {
          writeOutbox(readOutbox().filter((candidate) =>
            candidate.key !== item.key || candidate.revision !== item.revision
          ));
          console.warn("[LearningBehaviorTracker] Invalid queued summary was discarded.");
          continue;
        }
        console.warn("[LearningBehaviorTracker] Save deferred; the latest summary remains queued.");
        break;
      }
    }
  }

  function scheduleSave(state) {
    global.clearTimeout(state.saveTimer);
    state.saveTimer = global.setTimeout(() => {
      state.saveTimer = 0;
      persistState(state, "saved");
      drainOutbox();
    }, SAVE_DELAY_MS);
  }

  function persistState(state, status) {
    if (!state) return;
    if (state.taskStatus !== "submitted" && status === "saved") state.taskStatus = "saved";
    const record = snapshot(state, status);
    if (!record) return;
    enqueue(record);
    state.dirty = false;
    logDebug(state);
  }

  function commitEdit(state, nextValue, method, now) {
    const edit = commonEdit(state.value, nextValue);
    if (!edit.inserted && !edit.deleted) {
      state.value = nextValue;
      return;
    }
    if (!state.firstInputAt) state.firstInputAt = now;
    if (state.lastInputAt) {
      const gap = now - state.lastInputAt;
      if (gap >= PAUSE_MS) {
        state.pauseCount += 1;
        state.longestPauseMs = Math.max(state.longestPauseMs, gap);
      } else {
        state.activeTypingDurationMs += gap;
      }
    }
    state.lastInputAt = now;
    if (edit.deleted) {
      state.deleteCount += 1;
      if (edit.deleted >= LARGE_DELETE_SIZE) state.largeDeleteCount += 1;
    }
    if (method === "voice") {
      state.voiceUsed = true;
    } else {
      state.keyboardUsed = true;
      state.keyboardInputCharacterCount += edit.inserted;
    }
    state.value = nextValue;
    state.dirty = true;
    scheduleSave(state);
    logDebug(state);
  }

  function onFocus(event) {
    if (!trackedElement(event.target)) return;
    const state = ensureState(event.target);
    if (!state.firstFocusedAt) state.firstFocusedAt = Date.now();
    lastActiveKey = state.key;
    if (pendingAiStage && pendingAiStage === state.stageId) {
      state.aiUsed = true;
      state.dirty = true;
      pendingAiStage = "";
      scheduleSave(state);
    }
  }

  function onInput(event) {
    if (!trackedElement(event.target)) return;
    const state = ensureState(event.target);
    if (state.composing || event.isComposing) return;
    const nextValue = event.target.value || "";
    if (state.ignoreInputValue === nextValue) {
      state.ignoreInputValue = null;
      return;
    }
    const pending = pendingVoice.get(event.target);
    const voice = pending && Date.now() - pending.at < 2000;
    if (pending) pendingVoice.delete(event.target);
    commitEdit(state, nextValue, voice ? "voice" : "keyboard", Date.now());
  }

  function onCompositionStart(event) {
    if (!trackedElement(event.target)) return;
    const state = ensureState(event.target);
    state.composing = true;
    state.compositionStartValue = state.value;
  }

  function onCompositionEnd(event) {
    if (!trackedElement(event.target)) return;
    const state = ensureState(event.target);
    state.composing = false;
    state.value = state.compositionStartValue;
    const nextValue = event.target.value || "";
    commitEdit(state, nextValue, "keyboard", Date.now());
    state.ignoreInputValue = nextValue;
  }

  function onBlur(event) {
    if (!trackedElement(event.target)) return;
    const state = ensureState(event.target);
    global.clearTimeout(state.saveTimer);
    state.saveTimer = 0;
    if (state.dirty || state.firstFocusedAt) {
      persistState(state, state.taskStatus === "submitted" ? "submitted" : "saved");
      drainOutbox();
    }
  }

  function onAiOpened(event) {
    if (!config || (event.detail && event.detail.experimentId !== config.experimentId)) return;
    const stageId = event.detail && String(event.detail.stageId || "");
    const active = states.get(lastActiveKey);
    if (active && (!stageId || active.stageId === stageId)) {
      active.aiUsed = true;
      active.dirty = true;
      scheduleSave(active);
      logDebug(active);
    } else {
      pendingAiStage = stageId;
    }
  }

  function onVoiceBeforeInsert(event) {
    const target = event.detail && event.detail.target;
    if (!trackedElement(target)) return;
    pendingVoice.set(target, { at: Date.now() });
  }

  function flush(options) {
    if (!initialized) return Promise.resolve();
    states.forEach((state) => {
      global.clearTimeout(state.saveTimer);
      state.saveTimer = 0;
      if (state.dirty || state.firstFocusedAt) {
        persistState(state, state.taskStatus === "submitted" ? "submitted" : "saved");
      }
    });
    if (options && options.keepalive) {
      if (!currentIdentity()) return Promise.resolve();
      readOutbox().forEach((item) => sendRecord(item.record, true).catch(() => {}));
      return Promise.resolve();
    }
    if (!flushPromise) flushPromise = drainOutbox().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  function markStageSubmitted(stageId) {
    states.forEach((state) => {
      if (state.stageId !== stageId) return;
      state.taskStatus = "submitted";
      state.dirty = true;
      persistState(state, "submitted");
    });
    return drainOutbox();
  }

  function init(options) {
    if (initialized) return true;
    if (!options || !String(options.experimentId || "").trim()) {
      console.warn("[LearningBehaviorTracker] experimentId is required.");
      return false;
    }
    if (!global.BrainPlatform || !global.BrainPlatform.config) {
      console.warn("[LearningBehaviorTracker] BrainPlatform is unavailable.");
      return false;
    }
    config = { experimentId: String(options.experimentId).trim() };
    initialized = true;
    document.addEventListener("focusin", onFocus);
    document.addEventListener("input", onInput);
    document.addEventListener("compositionstart", onCompositionStart);
    document.addEventListener("compositionend", onCompositionEnd);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("virtual-agent:ai-opened", onAiOpened);
    document.addEventListener("voice-assistant:before-text-insert", onVoiceBeforeInsert);
    global.addEventListener("online", drainOutbox);
    global.addEventListener("pagehide", () => flush({ keepalive: true }));
    drainOutbox();
    return true;
  }

  global.LearningBehaviorTracker = Object.freeze({
    init,
    markStageSubmitted,
    flush,
    getDebugSummary: () => Array.from(states.values(), debugState)
  });

  if (global.AGENT_DEBUG === true) {
    global.__LearningBehaviorTrackerTestHooks = Object.freeze({
      codePoints,
      effectiveCount,
      commonEdit,
      constants: { PAUSE_MS, SAVE_DELAY_MS, LARGE_DELETE_SIZE, OUTBOX_LIMIT, OUTBOX_TTL_MS }
    });
  }
})(window);
