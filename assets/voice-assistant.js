(function () {
  "use strict";

  const EMPTY_COPY_NOTICE = "暂无可复制内容";
  const COPIED_NOTICE = "已复制，可粘贴到任意填写框中";
  const DRAG_MARGIN = 12;
  const DRAG_THRESHOLD = 5;
  let activeApi = null;
  let activeSession = null;

  function setStatus(status, message, type) {
    status.textContent = message || "";
    status.classList.toggle("is-success", type === "success");
    status.classList.toggle("is-warning", type === "warning");
  }

  async function copyText(text, textarea) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.setSelectionRange(text.length, text.length);
    if (!copied) {
      throw new Error("copy command failed");
    }
  }

  function appendFinalText(textarea, text) {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    const current = textarea.value.trim();
    textarea.value = current ? `${current}\n${nextText}` : nextText;
    textarea.scrollTop = textarea.scrollHeight;
  }

  function createTranscriptionSession(callbacks) {
    const config = callbacks || {};
    let state = "idle";
    let destroyed = false;
    let operationId = 0;

    function emitState(nextState) {
      state = nextState;
      if (!destroyed && typeof config.onStateChange === "function") {
        config.onStateChange(nextState);
      }
    }

    function emitError(message, error) {
      if (!destroyed && typeof config.onError === "function") {
        config.onError(message, error);
      }
    }

    const recorder = window.VoiceRecorder?.create?.({
      onTimeChange(time) {
        if (!destroyed && typeof config.onTimeChange === "function") config.onTimeChange(time);
      },
      onError(message, error) {
        fail(message, error);
      }
    }) || null;

    const asrClient = window.AsrClient?.create?.({
      onStateChange(nextState) {
        if (nextState === "idle" && state === "recording") {
          recorder?.stop();
          finish();
        } else if (nextState === "idle" && state === "finalizing") {
          finish();
        }
      },
      onPartial(text) {
        if (!destroyed && typeof config.onPartial === "function") config.onPartial(text);
      },
      onFinal(text) {
        if (!destroyed && typeof config.onFinal === "function") config.onFinal(text);
      },
      onError(message, error) {
        fail(message || "识别失败，请稍后重试。", error);
      }
    }) || null;

    function releaseActiveSession() {
      if (activeSession === api) activeSession = null;
    }

    function finish() {
      releaseActiveSession();
      emitState("completed");
    }

    function fail(message, error) {
      operationId += 1;
      recorder?.stop();
      asrClient?.stop();
      releaseActiveSession();
      emitState("error");
      emitError(message || "识别失败，请稍后重试。", error);
    }

    function cancel() {
      operationId += 1;
      const shouldNotify = state !== "idle";
      state = "idle";
      recorder?.stop();
      asrClient?.stop();
      asrClient?.reset();
      releaseActiveSession();
      if (shouldNotify) emitState("idle");
    }

    async function start() {
      if (destroyed || ["preparing", "recording", "finalizing"].includes(state)) return false;
      if (!recorder || !asrClient) {
        fail("当前浏览器不支持语音识别助手。");
        return false;
      }

      if (activeSession && activeSession !== api) activeSession.cancel();
      activeSession = api;
      const currentOperation = ++operationId;
      asrClient.reset();
      emitState("preparing");

      try {
        await recorder.prepare();
        if (destroyed || currentOperation !== operationId) {
          recorder.stop();
          asrClient.stop();
          return false;
        }
        await asrClient.connect();
        if (destroyed || currentOperation !== operationId) {
          recorder.stop();
          asrClient.stop();
          return false;
        }
        recorder.start((pcmBuffer) => asrClient.sendAudio(pcmBuffer));
        emitState("recording");
        return true;
      } catch (error) {
        if (currentOperation === operationId) {
          fail(error?.message || "识别失败，请稍后重试。", error);
        }
        return false;
      }
    }

    function stop() {
      if (state !== "recording") return false;
      recorder?.stop();
      emitState("finalizing");
      asrClient?.stop();
      return true;
    }

    function destroy() {
      cancel();
      destroyed = true;
    }

    const api = Object.freeze({
      start,
      stop,
      cancel,
      destroy,
      isSupported: () => Boolean(recorder && asrClient && recorder.isSupported()),
      getState: () => state
    });
    return api;
  }

  function isWritableTarget(element) {
    if (!element || element.disabled || element.readOnly) return false;
    if (element.matches("textarea")) return true;
    if (!element.matches("input")) return false;
    return ["text", "search", "email", "tel", "url"].includes((element.type || "text").toLowerCase());
  }

  function getTargetLabel(element) {
    if (!element) return "";
    const idLabel = element.id
      ? Array.from(document.querySelectorAll("label[for]")).find((label) => label.htmlFor === element.id)
      : null;
    const wrappingLabel = element.closest("label");
    const fieldLabel = element.closest(".field, .form-group, .form-field")?.querySelector("label");
    const label = idLabel || wrappingLabel || fieldLabel;
    return String(
      element.getAttribute("aria-label") ||
      label?.textContent ||
      element.placeholder ||
      element.name ||
      "当前输入框"
    ).replace(/\s+/g, " ").trim().slice(0, 48);
  }

  function installDraggable(options) {
    const { dragRoot, visibleWhenClosed, visibleWhenOpen, handles } = options;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let didDrag = false;
    let suppressClick = false;

    function isInteractiveTarget(target) {
      return Boolean(target.closest("button, input, textarea, select, a, [data-no-drag]"));
    }

    function getVisibleElement() {
      return dragRoot.classList.contains("is-open") ? visibleWhenOpen : visibleWhenClosed;
    }

    function getVisibleRect() {
      return getVisibleElement().getBoundingClientRect();
    }

    function clampPosition(left, top) {
      const visible = getVisibleElement();
      const width = visible.offsetWidth || visible.getBoundingClientRect().width || 1;
      const height = visible.offsetHeight || visible.getBoundingClientRect().height || 1;
      const maxLeft = Math.max(DRAG_MARGIN, window.innerWidth - width - DRAG_MARGIN);
      const maxTop = Math.max(DRAG_MARGIN, window.innerHeight - height - DRAG_MARGIN);
      return {
        left: Math.min(Math.max(left, DRAG_MARGIN), maxLeft),
        top: Math.min(Math.max(top, DRAG_MARGIN), maxTop)
      };
    }

    function applyPosition(left, top) {
      const next = clampPosition(left, top);
      dragRoot.classList.add("is-dragged");
      dragRoot.style.left = `${next.left}px`;
      dragRoot.style.top = `${next.top}px`;
      dragRoot.style.right = "auto";
      dragRoot.style.bottom = "auto";
    }

    function onPointerMove(event) {
      if (event.pointerId !== pointerId) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (!didDrag && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
      didDrag = true;
      event.preventDefault();
      applyPosition(startLeft + deltaX, startTop + deltaY);
    }

    function onPointerUp(event) {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      dragRoot.classList.remove("is-dragging");
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture may already be released by the browser.
      }
      if (didDrag) {
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    }

    handles.forEach((handle) => {
      handle.setAttribute("data-drag-handle", "");
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (handle !== visibleWhenClosed && isInteractiveTarget(event.target)) return;
        const rect = getVisibleRect();
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        didDrag = false;
        dragRoot.classList.add("is-dragging");
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
      handle.addEventListener("click", (event) => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    });

    window.addEventListener("resize", () => {
      if (!dragRoot.classList.contains("is-dragged")) return;
      const rect = getVisibleRect();
      applyPosition(rect.left, rect.top);
    });

    return {
      clamp() {
        if (!dragRoot.classList.contains("is-dragged")) return;
        window.requestAnimationFrame(() => {
          const rect = getVisibleRect();
          applyPosition(rect.left, rect.top);
        });
      }
    };
  }

  function initVoiceAssistant() {
    if (document.querySelector(".voice-assistant")) return;

    const root = document.createElement("div");
    root.className = "voice-assistant";
    root.innerHTML = `
      <div class="voice-hint" aria-hidden="true">打字慢？别担心，让我来帮你！</div>
      <button class="voice-toggle" type="button" aria-label="打开语音助手">🎙 语音助手</button>
      <section class="voice-panel" aria-label="语音转文字助手">
        <header class="voice-head">
          <h2 class="voice-title">语音转文字助手</h2>
          <button class="voice-close" type="button" aria-label="关闭语音助手">×</button>
        </header>
        <div class="voice-body">
          <ol class="voice-guide" aria-label="语音转文字操作步骤">
            <li>点击“开始录音”</li>
            <li>看到“可以说话了”后再开始说</li>
            <li>说完点击“停止录音”</li>
            <li>等待转写完成后再复制或写入</li>
          </ol>
          <div class="voice-recording-status" aria-live="polite">
            <span class="voice-recording-label" data-voice-state>未开始</span>
            <span class="voice-recording-time" data-voice-time>00:00</span>
          </div>
          <textarea class="voice-output" aria-label="语音转文字结果" placeholder="识别结果会显示在这里，可复制后粘贴到任意填写框。"></textarea>
          <p class="voice-partial" data-voice-partial aria-live="polite"></p>
          <div class="voice-target" data-voice-target>
            <span class="voice-target-label">写入目标</span>
            <strong data-voice-target-name>请先点击页面中的输入框</strong>
            <small>识别完成后确认写入，不会自动覆盖你的答案。</small>
          </div>
          <div class="voice-actions" aria-label="语音助手操作">
            <button class="voice-action primary" type="button" data-voice-start>开始录音</button>
            <button class="voice-action" type="button" data-voice-stop disabled>停止录音</button>
            <button class="voice-action write" type="button" data-voice-write disabled>写入当前输入框</button>
            <button class="voice-action" type="button" data-voice-copy disabled>复制文字</button>
            <button class="voice-action" type="button" data-voice-clear>清空内容</button>
          </div>
          <p class="voice-status" role="status" aria-live="polite"></p>
        </div>
      </section>
    `;

    const toggle = root.querySelector(".voice-toggle");
    const close = root.querySelector(".voice-close");
    const textarea = root.querySelector(".voice-output");
    const status = root.querySelector(".voice-status");
    const startButton = root.querySelector("[data-voice-start]");
    const stopButton = root.querySelector("[data-voice-stop]");
    const writeButton = root.querySelector("[data-voice-write]");
    const copyButton = root.querySelector("[data-voice-copy]");
    const clearButton = root.querySelector("[data-voice-clear]");
    const stateLabel = root.querySelector("[data-voice-state]");
    const timeLabel = root.querySelector("[data-voice-time]");
    const partialLabel = root.querySelector("[data-voice-partial]");
    const targetBox = root.querySelector("[data-voice-target]");
    const targetName = root.querySelector("[data-voice-target-name]");
    const panel = root.querySelector(".voice-panel");
    const head = root.querySelector(".voice-head");
    let lastTarget = null;

    const dragControls = installDraggable({
      dragRoot: root,
      visibleWhenClosed: toggle,
      visibleWhenOpen: panel,
      handles: [toggle, head]
    });

    const session = createTranscriptionSession({
      onStateChange(nextState) {
        root.classList.toggle("is-recording", nextState === "recording");
        if (nextState === "preparing") {
          stateLabel.textContent = "正在准备，请稍候";
          setStatus(status, "正在连接麦克风和语音识别，请先不要说话。", "");
        } else if (nextState === "recording") {
          stateLabel.textContent = "可以说话了";
          setStatus(status, "现在可以开始说话，说完请点击“停止录音”。", "success");
        } else if (nextState === "finalizing") {
          stateLabel.textContent = "正在生成文字";
          setStatus(status, "请稍候，转写完成后才能复制或写入。", "");
        } else if (nextState === "completed") {
          stateLabel.textContent = "转写完成";
          partialLabel.textContent = "";
          setStatus(status, textarea.value.trim()
            ? "转写完成，请复制文字或写入当前输入框。"
            : "没有识别到文字，请重新录音。", textarea.value.trim() ? "success" : "warning");
        } else if (nextState === "idle") {
          stateLabel.textContent = "未开始";
          partialLabel.textContent = "";
        } else if (nextState === "error") {
          stateLabel.textContent = "识别失败";
        }
        updateActions();
      },
      onTimeChange(time) {
        timeLabel.textContent = time.label;
      },
      onPartial(text) {
        partialLabel.textContent = text ? `正在识别：${text}` : "";
      },
      onFinal(text) {
        appendFinalText(textarea, text);
        updateActions();
      },
      onError(message, error) {
        console.warn("[Voice Assistant] ASR error:", {
          name: (error && error.name) || "Error"
        });
        setStatus(status, message || "识别失败，请稍后重试。", "warning");
      }
    });

    function updateActions() {
      const sessionState = session.getState();
      const busy = ["preparing", "recording", "finalizing"].includes(sessionState);
      const hasText = Boolean(textarea.value.trim());
      const hasTarget = isWritableTarget(lastTarget) && lastTarget.isConnected;
      startButton.disabled = busy || !session.isSupported();
      stopButton.disabled = sessionState !== "recording";
      copyButton.disabled = busy || !hasText;
      writeButton.disabled = busy || !hasText || !hasTarget;
      clearButton.disabled = busy;
    }

    function updateTargetDisplay() {
      const available = isWritableTarget(lastTarget) && lastTarget.isConnected;
      targetBox.classList.toggle("has-target", available);
      targetName.textContent = available ? getTargetLabel(lastTarget) : "请先点击页面中的输入框";
      updateActions();
    }

    function rememberTarget(event) {
      if (root.contains(event.target) || !isWritableTarget(event.target)) return;
      lastTarget = event.target;
      updateTargetDisplay();
    }

    function setTarget(target) {
      if (root.contains(target) || !isWritableTarget(target) || !target.isConnected) return false;
      lastTarget = target;
      updateTargetDisplay();
      return true;
    }

    function writeToTarget() {
      const text = textarea.value.trim();
      if (!text) {
        setStatus(status, EMPTY_COPY_NOTICE, "warning");
        return;
      }
      if (!isWritableTarget(lastTarget) || !lastTarget.isConnected) {
        lastTarget = null;
        updateTargetDisplay();
        setStatus(status, "目标输入框已失效，请重新点击需要填写的位置。", "warning");
        return;
      }

      const position = Number.isInteger(lastTarget.selectionEnd)
        ? lastTarget.selectionEnd
        : lastTarget.value.length;
      document.dispatchEvent(new CustomEvent("voice-assistant:before-text-insert", {
        detail: {
          target: lastTarget,
          insertedCharacterCount: Array.from(text).length
        }
      }));
      lastTarget.value =
        lastTarget.value.slice(0, position) +
        text +
        lastTarget.value.slice(position);
      const nextPosition = position + text.length;
      lastTarget.focus();
      if (typeof lastTarget.setSelectionRange === "function") {
        lastTarget.setSelectionRange(nextPosition, nextPosition);
      }
      lastTarget.dispatchEvent(new Event("input", { bubbles: true }));
      lastTarget.dispatchEvent(new Event("change", { bubbles: true }));
      document.dispatchEvent(new CustomEvent("voice-assistant:text-inserted", {
        detail: {
          target: lastTarget,
          insertedCharacterCount: Array.from(text).length
        }
      }));
      setStatus(status, `已写入“${getTargetLabel(lastTarget)}”。`, "success");
    }

    async function startRecording() {
      if (!session.isSupported()) {
        setStatus(status, "当前浏览器不支持语音识别助手。", "warning");
        return;
      }
      setStatus(status, "", "");
      await session.start();
    }

    toggle.addEventListener("click", () => {
      root.classList.add("is-open");
      dragControls.clamp();
      updateTargetDisplay();
      window.setTimeout(() => textarea.focus(), 80);
    });

    close.addEventListener("click", () => {
      if (session.getState() === "recording") session.stop();
      if (session.getState() === "preparing") session.cancel();
      root.classList.remove("is-open");
    });

    startButton.addEventListener("click", startRecording);
    stopButton.addEventListener("click", () => session.stop());
    writeButton.addEventListener("click", writeToTarget);

    copyButton.addEventListener("click", async () => {
      const text = textarea.value.trim();
      if (!text) {
        setStatus(status, EMPTY_COPY_NOTICE, "warning");
        return;
      }

      try {
        await copyText(text, textarea);
        setStatus(status, COPIED_NOTICE, "success");
      } catch (error) {
        textarea.focus();
        textarea.select();
        setStatus(status, "复制失败，请手动选中文字后复制。", "warning");
      }
    });

    clearButton.addEventListener("click", () => {
      textarea.value = "";
      partialLabel.textContent = "";
      setStatus(status, "", "");
      updateActions();
      textarea.focus();
    });

    textarea.addEventListener("input", updateActions);
    window.addEventListener("pagehide", () => session.cancel());
    window.addEventListener("beforeunload", () => session.cancel());
    document.addEventListener("focusin", rememberTarget);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") session.cancel();
    });

    if (!session.isSupported()) {
      setStatus(status, "当前浏览器不支持语音识别助手。", "warning");
    }
    updateActions();

    activeApi = Object.freeze({
      setTarget,
      isOpen: () => root.classList.contains("is-open"),
      cancel: () => session.cancel()
    });
    document.body.appendChild(root);
  }

  window.VoiceAssistant = Object.freeze({
    setTarget: (target) => Boolean(activeApi && activeApi.setTarget(target)),
    isOpen: () => Boolean(activeApi && activeApi.isOpen()),
    createSession: (callbacks) => createTranscriptionSession(callbacks)
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initVoiceAssistant);
  } else {
    initVoiceAssistant();
  }
})();
