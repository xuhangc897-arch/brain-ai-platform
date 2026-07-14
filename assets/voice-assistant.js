(function () {
  "use strict";

  const EMPTY_COPY_NOTICE = "暂无可复制内容";
  const COPIED_NOTICE = "已复制，可粘贴到任意填写框中";
  const DRAG_MARGIN = 12;
  const DRAG_THRESHOLD = 5;

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
          <div class="voice-recording-status" aria-live="polite">
            <span class="voice-recording-label" data-voice-state>未开始</span>
            <span class="voice-recording-time" data-voice-time>00:00</span>
          </div>
          <textarea class="voice-output" aria-label="语音转文字结果" placeholder="识别结果会显示在这里，可复制后粘贴到任意填写框。"></textarea>
          <p class="voice-partial" data-voice-partial aria-live="polite"></p>
          <div class="voice-actions" aria-label="语音助手操作">
            <button class="voice-action primary" type="button" data-voice-start>开始录音</button>
            <button class="voice-action" type="button" data-voice-stop disabled>停止录音</button>
            <button class="voice-action" type="button" data-voice-copy>复制文字</button>
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
    const copyButton = root.querySelector("[data-voice-copy]");
    const clearButton = root.querySelector("[data-voice-clear]");
    const stateLabel = root.querySelector("[data-voice-state]");
    const timeLabel = root.querySelector("[data-voice-time]");
    const partialLabel = root.querySelector("[data-voice-partial]");
    const panel = root.querySelector(".voice-panel");
    const head = root.querySelector(".voice-head");
    let isRunning = false;

    const dragControls = installDraggable({
      dragRoot: root,
      visibleWhenClosed: toggle,
      visibleWhenOpen: panel,
      handles: [toggle, head]
    });

    const recorder = window.VoiceRecorder && window.VoiceRecorder.create ? window.VoiceRecorder.create({
      onStateChange(nextState) {
        root.classList.toggle("is-recording", nextState === "recording");
      },
      onTimeChange(time) {
        timeLabel.textContent = time.label;
      },
      onError(message) {
        setStatus(status, message, "warning");
      }
    }) : null;

    const asrClient = window.AsrClient && window.AsrClient.create ? window.AsrClient.create({
      onStateChange(nextState) {
        if (nextState === "open") stateLabel.textContent = "正在识别";
      },
      onPartial(text) {
        partialLabel.textContent = text ? `正在识别：${text}` : "";
      },
      onFinal(text) {
        appendFinalText(textarea, text);
      },
      onError(message, error) {
        console.warn("[Voice Assistant] ASR error:", message, error);
        stateLabel.textContent = "识别失败";
        setStatus(status, message || "识别失败，请稍后重试。", "warning");
      }
    }) : null;

    function setRunning(nextRunning) {
      isRunning = nextRunning;
      root.classList.toggle("is-recording", nextRunning);
      startButton.disabled = nextRunning;
      stopButton.disabled = !nextRunning;
    }

    function stopAll() {
      if (recorder) recorder.stop();
      if (asrClient) asrClient.stop();
      setRunning(false);
      stateLabel.textContent = "未开始";
      partialLabel.textContent = "";
    }

    async function startRecording() {
      if (isRunning) return;
      if (!recorder || !asrClient) {
        setStatus(status, "当前浏览器不支持语音识别助手。", "warning");
        return;
      }

      setStatus(status, "", "");
      stateLabel.textContent = "正在录音";
      setRunning(true);

      try {
        await recorder.prepare();
        stateLabel.textContent = "正在识别";
        await asrClient.connect();
        recorder.start((pcmBuffer) => {
          asrClient.sendAudio(pcmBuffer);
        });
      } catch (error) {
        console.warn("[Voice Assistant] start failed:", error);
        stopAll();
        stateLabel.textContent = "识别失败";
        setStatus(status, error && error.message ? error.message : "识别失败，请稍后重试。", "warning");
      }
    }

    toggle.addEventListener("click", () => {
      root.classList.add("is-open");
      dragControls.clamp();
      window.setTimeout(() => textarea.focus(), 80);
    });

    close.addEventListener("click", () => {
      root.classList.remove("is-open");
    });

    startButton.addEventListener("click", startRecording);
    stopButton.addEventListener("click", stopAll);

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
      if (asrClient) asrClient.reset();
      setStatus(status, "", "");
      textarea.focus();
    });

    window.addEventListener("pagehide", stopAll);
    window.addEventListener("beforeunload", stopAll);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") stopAll();
    });

    if (!recorder || !asrClient) {
      startButton.disabled = true;
      stopButton.disabled = true;
      setStatus(status, "当前浏览器不支持语音识别助手。", "warning");
    }

    document.body.appendChild(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initVoiceAssistant);
  } else {
    initVoiceAssistant();
  }
})();
