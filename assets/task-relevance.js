(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const OFF_TOPIC_CONFIDENCE = 0.75;
  const DIRECTION_CONFIDENCE = 0.70;
  const PROMPT_COOLDOWN_MS = 60000;
  const MIN_BLUR_EDIT_SIZE = 3;
  const OUTBOX_LIMIT = 100;
  const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const LOCAL_STATE_LIMIT = 500;
  const OFF_TOPIC_MESSAGE = "侦探提醒：你的线索可能和当前案件关系不大，可以再看看任务要求。";
  const DIRECTION_MESSAGE = "你的想法已经找到方向，可以再补充一些实验现象或原因。";
  const INSUFFICIENT_MESSAGE = "这段内容可能还比较少，暂时无法判断它与任务的关系。你可以再阅读一次任务要求，补充与实验材料、过程或结果有关的内容。";
  const COGNITIVE_DIFFICULTY_MESSAGE = "侦探发现你暂时没有找到线索。";
  const DIRECTION_LEVEL_TWO = "如果不知道如何表达，可以先说出你的想法，助手可以帮你整理。";
  const CONTENT_LEVEL_TWO = "可以先从一个实验现象、可能原因或你的猜想开始。";
  const LEVEL_THREE = "可以尝试从三个方面思考：①观察到了什么；②为什么会这样；③实验结果说明什么。";
  let initialized = false;
  let experimentId = "";
  let outboxSequence = 0;
  let flushPromise = null;
  let activePrompt = null;
  let hashWarningShown = false;
  const lastCheckedText = new Map();
  const focusText = new WeakMap();
  const pendingHashes = new Map();
  const taskStates = new Map();

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

  function normalizeText(value) {
    return String(value == null ? "" : value).normalize("NFC").replace(/\s+/gu, " ").trim();
  }

  function unicodeLength(value) {
    return Array.from(value || "").length;
  }

  function editSize(before, after) {
    const left = Array.from(before || "");
    const right = Array.from(after || "");
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < left.length - prefix &&
      suffix < right.length - prefix &&
      left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
    ) suffix += 1;
    return (left.length - prefix - suffix) + (right.length - prefix - suffix);
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await global.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function eligibleTarget(target) {
    return target instanceof Element &&
      target.matches('textarea[data-agent-track="true"][data-relevance-check="true"]') &&
      !target.disabled &&
      !target.readOnly &&
      target.isConnected;
  }

  function snapshotTarget(target, currentIdentity) {
    if (!eligibleTarget(target) || !currentIdentity) return null;
    const snapshot = {
      studentId: currentIdentity.studentId,
      fieldId: String(target.dataset.field || target.id || target.dataset.taskId || ""),
      experimentId: String(target.dataset.experimentId || ""),
      stageId: String(target.dataset.stageId || ""),
      taskId: String(target.dataset.taskId || ""),
      value: normalizeText(target.value)
    };
    const config = global.TaskRelevanceConfig?.get(snapshot.experimentId, snapshot.taskId);
    if (!config || config.stageId !== snapshot.stageId) return null;
    return snapshot;
  }

  function snapshotKey(snapshot) {
    return [snapshot.studentId, snapshot.experimentId, snapshot.stageId, snapshot.taskId].join("|");
  }

  function rememberSnapshot(snapshot) {
    const key = snapshotKey(snapshot);
    const previous = taskStates.get(key) || {};
    if (previous.snapshot?.value !== snapshot.value) {
      previous.pendingResult = null;
      previous.pendingHash = "";
    }
    previous.snapshot = snapshot;
    taskStates.set(key, previous);
    return { key, state: previous };
  }

  function liveTarget(snapshot) {
    return Array.from(document.querySelectorAll(
      'textarea[data-agent-track="true"][data-relevance-check="true"]'
    )).find((target) => eligibleTarget(target) &&
      target.dataset.experimentId === snapshot.experimentId &&
      target.dataset.stageId === snapshot.stageId &&
      target.dataset.taskId === snapshot.taskId &&
      String(target.dataset.field || target.id || target.dataset.taskId || "") === snapshot.fieldId &&
      normalizeText(target.value) === snapshot.value) || null;
  }

  function taskConfig(target) {
    if (!eligibleTarget(target)) return null;
    const config = global.TaskRelevanceConfig?.get(target.dataset.experimentId, target.dataset.taskId);
    if (!config || config.stageId !== target.dataset.stageId) return null;
    return config;
  }

  function taskKey(target, studentId) {
    return [
      studentId,
      target.dataset.experimentId,
      target.dataset.stageId,
      target.dataset.taskId
    ].join("|");
  }

  function pageId() {
    return global.location?.pathname?.split("/").pop() || experimentId;
  }

  function stateStorageKey() {
    return global.BrainPlatform.config.storageKeys.taskRelevanceState;
  }

  function outboxStorageKey() {
    return global.BrainPlatform.config.storageKeys.taskRelevanceOutbox;
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
      console.warn("[TaskRelevance] Unable to update local check state.");
    }
  }

  function findLocalEntry(key) {
    return readLocalState().find((item) => item.key === key) || null;
  }

  function updateLocalEntry(key, updates) {
    const items = readLocalState();
    const previous = items.find((item) => item.key === key) || {
      key,
      checkedHashes: [],
      promptedHashes: [],
      promptCount: 0,
      promptCountsByCategory: {},
      lastPromptAtByCategory: {}
    };
    const next = Object.assign({}, previous, updates);
    const filtered = items.filter((item) => item.key !== key);
    filtered.push(next);
    writeLocalState(filtered);
    return next;
  }

  function rememberHash(key, hash) {
    const previous = findLocalEntry(key) || {};
    const hashes = Array.from(new Set([...(previous.checkedHashes || []), hash])).slice(-10);
    return updateLocalEntry(key, { checkedHashes: hashes });
  }

  function readOutbox() {
    const now = Date.now();
    const items = readJson(outboxStorageKey(), []);
    return Array.isArray(items)
      ? items.filter((item) => item && item.payload && Number(item.expiresAt) > now)
      : [];
  }

  function writeOutbox(items) {
    try {
      global.localStorage.setItem(outboxStorageKey(), JSON.stringify(items.slice(-OUTBOX_LIMIT)));
    } catch (error) {
      console.warn("[TaskRelevance] Unable to update the relevance outbox.");
    }
  }

  function enqueue(payload) {
    const key = [
      payload.studentId,
      payload.experimentId,
      payload.stageId,
      payload.taskId,
      payload.action,
      payload.interaction || payload.trigger || ""
    ].join("|");
    const items = readOutbox().filter((item) => item.key !== key);
    items.push({
      key,
      revision: `${Date.now()}-${outboxSequence += 1}`,
      expiresAt: Date.now() + OUTBOX_TTL_MS,
      payload
    });
    writeOutbox(items);
  }

  async function request(payload, keepalive) {
    const student = identity();
    if (!student || student.studentId !== payload.studentId) {
      const error = new Error("Student session is unavailable.");
      error.retryable = true;
      throw error;
    }
    const response = await global.fetch(global.BrainPlatform.config.endpoints.checkTaskRelevance, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${student.sessionToken}`
      },
      body: JSON.stringify(payload),
      keepalive: Boolean(keepalive)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok !== true) {
      const error = new Error(result?.message || "Task relevance request failed.");
      error.retryable = !result || result.retryable !== false;
      throw error;
    }
    return result;
  }

  async function drainOutbox() {
    if (!identity()) return { blocked: true };
    for (const item of readOutbox()) {
      try {
        await request(item.payload, false);
        writeOutbox(readOutbox().filter((candidate) =>
          candidate.key !== item.key || candidate.revision !== item.revision
        ));
      } catch (error) {
        if (error.retryable === false) {
          writeOutbox(readOutbox().filter((candidate) =>
            candidate.key !== item.key || candidate.revision !== item.revision
          ));
          console.warn("[TaskRelevance] Invalid queued update was discarded.");
          continue;
        }
        console.warn("[TaskRelevance] Relevance update deferred.");
        return { blocked: true };
      }
    }
    return { blocked: false };
  }

  function flush(options) {
    if (options?.keepalive) {
      if (!identity()) return Promise.resolve();
      readOutbox().forEach((item) => request(item.payload, true).catch(() => {}));
      return Promise.resolve();
    }
    if (!flushPromise) {
      let runAgain = false;
      flushPromise = drainOutbox()
        .then((outcome) => {
          runAgain = !outcome.blocked && readOutbox().length > 0;
        })
        .finally(() => {
          flushPromise = null;
          if (runAgain) global.setTimeout(() => flush(), 0);
        });
    }
    return flushPromise;
  }

  function basePayload(target, currentIdentity) {
    return {
      schemaVersion: SCHEMA_VERSION,
      studentId: currentIdentity.studentId,
      experimentId: target.experimentId || target.dataset.experimentId,
      stageId: target.stageId || target.dataset.stageId,
      taskId: target.taskId || target.dataset.taskId,
      pageId: pageId()
    };
  }

  function promptForResult(result) {
    if (!result) return null;
    if (result.status === "off_topic" && result.confidence >= OFF_TOPIC_CONFIDENCE) {
      return { kind: "off_topic", category: "direction", title: "再看看当前任务", message: OFF_TOPIC_MESSAGE };
    }
    if (["incomplete", "vague", "partially_relevant"].includes(result.status) &&
        result.confidence >= DIRECTION_CONFIDENCE) {
      return { kind: result.status, category: "direction", title: "可以再补充一点", message: DIRECTION_MESSAGE };
    }
    if (result.status === "insufficient") {
      return { kind: "insufficient", category: "content", title: "内容还可以更具体", message: INSUFFICIENT_MESSAGE };
    }
    if (result.status === "cognitive_difficulty") {
      return {
        kind: "cognitive_difficulty",
        category: "content",
        title: "我们一起找线索",
        message: COGNITIVE_DIFFICULTY_MESSAGE
      };
    }
    return null;
  }

  function tieredMessage(prompt, promptNumber) {
    if (promptNumber <= 1) return prompt.message;
    const support = promptNumber === 2
      ? (prompt.category === "direction" ? DIRECTION_LEVEL_TWO : CONTENT_LEVEL_TWO)
      : LEVEL_THREE;
    return `${prompt.message} ${support}`;
  }

  function saveInteraction(target, hash, interaction) {
    const currentIdentity = identity();
    const snapshot = target.dataset ? snapshotTarget(target, currentIdentity) : target;
    if (!currentIdentity || !snapshot) return;
    const payload = Object.assign(basePayload(snapshot, currentIdentity), {
      action: "interaction",
      textHash: hash,
      interaction
    });
    enqueue(payload);
    flush();
  }

  function handlePromptResponse(snapshot, hash, response) {
    if (!activePrompt || activePrompt.key !== snapshotKey(snapshot) || activePrompt.hash !== hash) return;
    saveInteraction(snapshot, hash, response);
    if (response !== "view_task") activePrompt = null;
  }

  function showPrompt(target, snapshot, hash, result, config, key) {
    const local = findLocalEntry(key) || {};
    if ((local.promptedHashes || []).includes(hash) || global.VirtualAgent.isBusy()) {
      return false;
    }
    const prompt = promptForResult(result);
    if (!prompt) return false;
    const now = Date.now();
    const lastPromptAt = Number(local.lastPromptAtByCategory?.[prompt.category] || 0);
    if (now - lastPromptAt < PROMPT_COOLDOWN_MS) return false;
    const promptCountsByCategory = Object.assign({}, local.promptCountsByCategory);
    const promptNumber = Number(promptCountsByCategory[prompt.category] || 0) + 1;
    const shown = global.VirtualAgent.showRelevanceSuggestion({
      target,
      title: prompt.title,
      message: tieredMessage(prompt, promptNumber),
      taskTitle: config.taskTitle,
      taskInstruction: config.taskInstruction,
      onResponse: (response) => handlePromptResponse(snapshot, hash, response)
    });
    if (!shown) return false;

    const promptedHashes = Array.from(new Set([...(local.promptedHashes || []), hash]));
    promptCountsByCategory[prompt.category] = promptNumber;
    const lastPromptAtByCategory = Object.assign({}, local.lastPromptAtByCategory, {
      [prompt.category]: now
    });
    updateLocalEntry(key, {
      promptCount: Number(local.promptCount || 0) + 1,
      promptCountsByCategory,
      lastPromptAtByCategory,
      promptedHashes
    });
    activePrompt = { target, key, hash };
    const currentIdentity = identity();
    if (currentIdentity) {
      const promptPayload = Object.assign(basePayload(snapshot, currentIdentity), {
        action: "check",
        inputText: snapshot.value,
        trigger: "prompt_shown",
        prompted: true
      });
      enqueue(promptPayload);
      flush();
    }
    return true;
  }

  function presentPending(state, key) {
    if (!state?.pendingResult || !state.snapshot) return false;
    if (!promptForResult(state.pendingResult)) {
      rememberHash(key, state.pendingHash);
      state.pendingResult = null;
      state.pendingHash = "";
      return false;
    }
    const target = liveTarget(state.snapshot);
    if (!target) return false;
    const config = global.TaskRelevanceConfig?.get(state.snapshot.experimentId, state.snapshot.taskId);
    if (!config) return false;
    const shown = showPrompt(target, state.snapshot, state.pendingHash, state.pendingResult, config, key);
    if (shown) {
      rememberHash(key, state.pendingHash);
      state.pendingResult = null;
      state.pendingHash = "";
    }
    return shown;
  }

  async function checkSnapshot(snapshot, options = {}) {
    const config = global.TaskRelevanceConfig?.get(snapshot.experimentId, snapshot.taskId);
    const currentIdentity = identity();
    if (!config || config.stageId !== snapshot.stageId || !currentIdentity ||
        currentIdentity.studentId !== snapshot.studentId) return null;

    const normalized = snapshot.value;
    const { key, state } = rememberSnapshot(snapshot);
    let hash;
    try {
      hash = await sha256(normalized);
    } catch (error) {
      if (!hashWarningShown) {
        hashWarningShown = true;
        console.warn("[TaskRelevance] Secure text hashing is unavailable; checks are disabled.");
      }
      return null;
    }
    const local = findLocalEntry(key);
    if ((local?.checkedHashes || []).includes(hash) || pendingHashes.get(key) === hash) {
      return null;
    }
    if (!options.force) {
      const previous = lastCheckedText.get(key);
      if (previous !== undefined && editSize(previous, normalized) < MIN_BLUR_EDIT_SIZE) return null;
      const target = liveTarget(snapshot);
      const focused = target ? focusText.get(target) : undefined;
      if (previous === undefined && focused !== undefined && editSize(focused, normalized) < MIN_BLUR_EDIT_SIZE) {
        return null;
      }
    }

    pendingHashes.set(key, hash);
    const payload = Object.assign(basePayload(snapshot, currentIdentity), {
      action: "check",
      inputText: normalized,
      trigger: String(options.trigger || "blur")
    });
    try {
      const response = await request(payload, false);
      lastCheckedText.set(key, normalized);
      if (global.AGENT_DEBUG === true) {
        console.debug("[TaskRelevance] Check completed.", {
          experimentId: snapshot.experimentId,
          stageId: snapshot.stageId,
          taskId: snapshot.taskId,
          trigger: payload.trigger,
          status: response.result?.status,
          confidence: response.result?.confidence,
          cached: Boolean(response.cached)
        });
      }
      const currentState = taskStates.get(key);
      const unchanged = currentState?.snapshot?.value === normalized;
      let shown = false;
      if (unchanged && response.promptEligible !== false) {
        currentState.pendingResult = response.result;
        currentState.pendingHash = response.textHash || hash;
        shown = presentPending(currentState, key);
      }
      if (response.promptEligible === false || !unchanged) rememberHash(key, response.textHash || hash);
      return response;
    } catch (error) {
      console.warn("[TaskRelevance] Check unavailable; student work can continue.");
      return null;
    } finally {
      if (pendingHashes.get(key) === hash) pendingHashes.delete(key);
    }
  }

  function checkTarget(target, options = {}) {
    const currentIdentity = identity();
    const snapshot = snapshotTarget(target, currentIdentity);
    if (!snapshot) return Promise.resolve(null);
    rememberSnapshot(snapshot);
    return checkSnapshot(snapshot, options);
  }

  function checkStage(stageId, options = {}) {
    captureCurrentTargets();
    const currentIdentity = identity();
    const snapshots = Array.from(taskStates.values(), (state) => state.snapshot)
      .filter((snapshot) => snapshot && currentIdentity &&
        snapshot.studentId === currentIdentity.studentId &&
        snapshot.experimentId === experimentId && snapshot.stageId === stageId);
    return Promise.allSettled(snapshots.map((snapshot) =>
      checkSnapshot(snapshot, { trigger: options.trigger || "stage_complete", force: true })
    ));
  }

  function submitSnapshot(snapshot, trigger) {
    const currentIdentity = identity();
    const config = global.TaskRelevanceConfig?.get(snapshot.experimentId, snapshot.taskId);
    if (!config || config.stageId !== snapshot.stageId || !currentIdentity) return Promise.resolve(null);
    const payload = Object.assign(basePayload(snapshot, currentIdentity), {
      action: "submit",
      finalText: snapshot.value,
      trigger: trigger || "stage_submit"
    });
    enqueue(payload);
    return flush().then(() => null);
  }

  function submitStage(stageId, options = {}) {
    captureCurrentTargets();
    const currentIdentity = identity();
    const snapshots = Array.from(taskStates.values(), (state) => state.snapshot)
      .filter((snapshot) => snapshot && currentIdentity &&
        snapshot.studentId === currentIdentity.studentId &&
        snapshot.experimentId === experimentId && snapshot.stageId === stageId);
    return Promise.allSettled(snapshots.map((snapshot) =>
      submitSnapshot(snapshot, options.trigger || "stage_submit")
    ));
  }

  function captureCurrentTargets() {
    const currentIdentity = identity();
    if (!currentIdentity) return [];
    return Array.from(document.querySelectorAll(
      'textarea[data-agent-track="true"][data-relevance-check="true"]'
    )).map((target) => snapshotTarget(target, currentIdentity)).filter(Boolean).map((snapshot) => {
      rememberSnapshot(snapshot);
      return snapshot;
    });
  }

  function beforePageChange() {
    const snapshots = captureCurrentTargets();
    snapshots.forEach((snapshot) => checkSnapshot(snapshot, { trigger: "page_change" }));
    if (activePrompt) global.VirtualAgent.hideRelevanceSuggestion("closed");
  }

  function afterPageRender() {
    captureCurrentTargets();
    taskStates.forEach((state, key) => presentPending(state, key));
  }

  function onFocusIn(event) {
    if (!eligibleTarget(event.target)) return;
    focusText.set(event.target, normalizeText(event.target.value));
  }

  function onFocusOut(event) {
    if (!eligibleTarget(event.target)) return;
    global.setTimeout(() => {
      if (global.VirtualAgent?.isSuggestionElement(document.activeElement)) return;
      checkTarget(event.target, { trigger: "blur" });
    }, 0);
  }

  function onInput(event) {
    if (!activePrompt || event.target !== activePrompt.target) return;
    global.VirtualAgent.hideRelevanceSuggestion("return_modify");
  }

  function onStageSubmitted(event) {
    if (!event.detail || event.detail.experimentId !== experimentId) return;
    if (activePrompt?.target?.dataset.stageId === event.detail.stageId) {
      global.VirtualAgent.hideRelevanceSuggestion("closed");
    }
    submitStage(event.detail.stageId, { trigger: "stage_complete" });
  }

  function init(options) {
    if (initialized) return true;
    if (!options?.experimentId || !global.TaskRelevanceConfig ||
        !global.VirtualAgent || !global.BrainPlatform) {
      console.warn("[TaskRelevance] Required components are unavailable.");
      return false;
    }
    experimentId = String(options.experimentId);
    initialized = true;
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("input", onInput);
    document.addEventListener("learning-behavior:stage-submitted", onStageSubmitted);
    global.addEventListener("online", flush);
    global.addEventListener("pagehide", () => {
      if (activePrompt) global.VirtualAgent.hideRelevanceSuggestion("closed");
      flush({ keepalive: true });
    });
    flush();
    return true;
  }

  global.TaskRelevance = Object.freeze({
    init,
    checkTarget,
    checkStage,
    submitStage,
    beforePageChange,
    afterPageRender,
    flush
  });
  global.__TaskRelevanceTestHooks = Object.freeze({
    normalizeText,
    unicodeLength,
    editSize,
    promptForResult,
    tieredMessage,
    constants: Object.freeze({
      OFF_TOPIC_CONFIDENCE,
      DIRECTION_CONFIDENCE,
      PROMPT_COOLDOWN_MS,
      MIN_BLUR_EDIT_SIZE,
      OUTBOX_LIMIT
    })
  });
})(window);
