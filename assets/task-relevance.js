(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const OFF_TOPIC_CONFIDENCE = 0.85;
  const PARTIAL_CONFIDENCE = 0.70;
  const MAX_PROMPTS_PER_TASK = 2;
  const MIN_BLUR_EDIT_SIZE = 3;
  const OUTBOX_LIMIT = 100;
  const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const LOCAL_STATE_LIMIT = 500;
  const OFF_TOPIC_MESSAGE = "这段内容好像与当前任务的关系不大。请再阅读一次任务要求，并结合刚才的实验材料或实验结果重新思考。";
  const INSUFFICIENT_MESSAGE = "这段内容可能还比较少，暂时无法判断它与任务的关系。你可以再阅读一次任务要求，补充与实验材料、过程或结果有关的内容。";
  let initialized = false;
  let experimentId = "";
  let outboxSequence = 0;
  let flushPromise = null;
  let activePrompt = null;
  let hashWarningShown = false;
  const lastCheckedText = new Map();
  const focusText = new WeakMap();
  const pendingHashes = new Map();

  function identity() {
    const session = global.BrainPlatform?.identity?.readStudentSession?.();
    const studentId = session && String(session.studentId || "").trim();
    if (!session || session.isGuest || session.role === "guest" || !studentId || studentId === "guest") {
      return null;
    }
    return { studentId };
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
    const previous = items.find((item) => item.key === key) || { key, checkedHashes: [], promptedHashes: [], promptCount: 0 };
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
    const response = await global.fetch(global.BrainPlatform.config.endpoints.checkTaskRelevance, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      experimentId: target.dataset.experimentId,
      stageId: target.dataset.stageId,
      taskId: target.dataset.taskId,
      pageId: pageId()
    };
  }

  function promptForResult(result) {
    if (!result) return null;
    if (result.status === "off_topic" && result.confidence >= OFF_TOPIC_CONFIDENCE) {
      return { kind: "off_topic", title: "再看看当前任务", message: OFF_TOPIC_MESSAGE };
    }
    if (result.status === "partially_relevant" &&
        result.confidence >= PARTIAL_CONFIDENCE &&
        normalizeText(result.supportHint)) {
      return { kind: "partially_relevant", title: "可以再补充一点", message: result.supportHint };
    }
    if (result.status === "insufficient") {
      return { kind: "insufficient", title: "内容还可以更具体", message: INSUFFICIENT_MESSAGE };
    }
    return null;
  }

  function saveInteraction(target, hash, interaction) {
    const currentIdentity = identity();
    if (!currentIdentity || !taskConfig(target)) return;
    const payload = Object.assign(basePayload(target, currentIdentity), {
      action: "interaction",
      textHash: hash,
      interaction
    });
    enqueue(payload);
    flush();
  }

  function handlePromptResponse(target, hash, response) {
    if (!activePrompt || activePrompt.target !== target || activePrompt.hash !== hash) return;
    saveInteraction(target, hash, response);
    if (response !== "view_task") activePrompt = null;
  }

  function showPrompt(target, hash, result, config, key) {
    const local = findLocalEntry(key) || {};
    if ((local.promptCount || 0) >= MAX_PROMPTS_PER_TASK ||
        (local.promptedHashes || []).includes(hash) ||
        global.VirtualAgent.isBusy()) {
      return false;
    }
    const prompt = promptForResult(result);
    if (!prompt) return false;
    const shown = global.VirtualAgent.showRelevanceSuggestion({
      target,
      title: prompt.title,
      message: prompt.message,
      taskTitle: config.taskTitle,
      taskInstruction: config.taskInstruction,
      onResponse: (response) => handlePromptResponse(target, hash, response)
    });
    if (!shown) return false;

    const promptedHashes = Array.from(new Set([...(local.promptedHashes || []), hash])).slice(-10);
    updateLocalEntry(key, {
      promptCount: Math.min(MAX_PROMPTS_PER_TASK, Number(local.promptCount || 0) + 1),
      promptedHashes
    });
    activePrompt = { target, hash };
    const currentIdentity = identity();
    if (currentIdentity) {
      const promptPayload = Object.assign(basePayload(target, currentIdentity), {
        action: "check",
        inputText: normalizeText(target.value),
        trigger: "prompt_shown",
        prompted: true
      });
      enqueue(promptPayload);
      flush();
    }
    return true;
  }

  async function checkTarget(target, options = {}) {
    const config = taskConfig(target);
    const currentIdentity = identity();
    if (!config || !currentIdentity) return null;

    const normalized = normalizeText(target.value);
    const key = taskKey(target, currentIdentity.studentId);
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
      const focused = focusText.get(target);
      if (previous === undefined && focused !== undefined && editSize(focused, normalized) < MIN_BLUR_EDIT_SIZE) {
        return null;
      }
    }

    pendingHashes.set(key, hash);
    const payload = Object.assign(basePayload(target, currentIdentity), {
      action: "check",
      inputText: normalized,
      trigger: String(options.trigger || "blur")
    });
    try {
      const response = await request(payload, false);
      rememberHash(key, response.textHash || hash);
      lastCheckedText.set(key, normalized);
      if (global.AGENT_DEBUG === true) {
        console.debug("[TaskRelevance] Check completed.", {
          experimentId: target.dataset.experimentId,
          stageId: target.dataset.stageId,
          taskId: target.dataset.taskId,
          trigger: payload.trigger,
          status: response.result?.status,
          confidence: response.result?.confidence,
          cached: Boolean(response.cached)
        });
      }
      const unchanged = target.isConnected &&
        normalizeText(target.value) === normalized &&
        target.dataset.stageId === config.stageId;
      if (unchanged && response.promptEligible !== false) {
        showPrompt(target, response.textHash || hash, response.result, config, key);
      }
      return response;
    } catch (error) {
      console.warn("[TaskRelevance] Check unavailable; student work can continue.");
      return null;
    } finally {
      if (pendingHashes.get(key) === hash) pendingHashes.delete(key);
    }
  }

  function targetsForStage(stageId) {
    return Array.from(document.querySelectorAll(
      'textarea[data-agent-track="true"][data-relevance-check="true"]'
    )).filter((target) => eligibleTarget(target) && target.dataset.stageId === stageId);
  }

  function checkStage(stageId, options = {}) {
    return Promise.allSettled(targetsForStage(stageId).map((target) =>
      checkTarget(target, { trigger: options.trigger || "stage_complete", force: true })
    ));
  }

  function submitTarget(target, trigger) {
    const config = taskConfig(target);
    const currentIdentity = identity();
    if (!config || !currentIdentity) return Promise.resolve(null);
    const payload = Object.assign(basePayload(target, currentIdentity), {
      action: "submit",
      finalText: normalizeText(target.value),
      trigger: trigger || "stage_submit"
    });
    enqueue(payload);
    return flush().then(() => null);
  }

  function submitStage(stageId, options = {}) {
    return Promise.allSettled(targetsForStage(stageId).map((target) =>
      submitTarget(target, options.trigger || "stage_submit")
    ));
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
    flush
  });
  global.__TaskRelevanceTestHooks = Object.freeze({
    normalizeText,
    unicodeLength,
    editSize,
    promptForResult,
    constants: Object.freeze({
      OFF_TOPIC_CONFIDENCE,
      PARTIAL_CONFIDENCE,
      MAX_PROMPTS_PER_TASK,
      MIN_BLUR_EDIT_SIZE,
      OUTBOX_LIMIT
    })
  });
})(window);
