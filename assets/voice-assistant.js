(function () {
  "use strict";

  const EMPTY_COPY_NOTICE = "暂无可复制内容";
  const COPIED_NOTICE = "已复制，可粘贴到任意填写框中";
  const IDLE_LABEL = "○ 未开始录音";
  const RECORDING_LABEL = "🎙 正在录音...";
  const UNSUPPORTED_MESSAGE = "当前浏览器不支持语音录音，请使用最新版 Edge 或 Chrome。";
  const PERMISSION_MESSAGE = "未获得麦克风权限，请在浏览器设置中允许访问麦克风后重试。";
  const DRAG_MARGIN = 12;
  const DRAG_THRESHOLD = 5;

  function setStatus(status, message, type) {
    status.textContent = message;
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
      <button class="voice-toggle" type="button" aria-label="打开语音助手">🎙 语音助手</button>
      <section class="voice-panel" aria-label="语音转文字助手">
        <header class="voice-head">
          <h2 class="voice-title">语音转文字助手</h2>
          <button class="voice-close" type="button" aria-label="关闭语音助手">×</button>
        </header>
        <div class="voice-body">
          <p class="voice-note">点击开始录音后，说出的内容会转换为文字。你可以复制文字，再粘贴到任意填写框中。</p>
          <div class="voice-recording-status" aria-live="polite">
            <span class="voice-recording-label" data-voice-recording-label>${IDLE_LABEL}</span>
            <span class="voice-recording-time" data-voice-recording-time>00:00</span>
          </div>
          <textarea class="voice-output" aria-label="语音转文字结果" placeholder="语音转文字结果会显示在这里，也可以先手动输入内容测试复制功能。"></textarea>
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
    const start = root.querySelector("[data-voice-start]");
    const stop = root.querySelector("[data-voice-stop]");
    const copy = root.querySelector("[data-voice-copy]");
    const clear = root.querySelector("[data-voice-clear]");
    const recordingLabel = root.querySelector("[data-voice-recording-label]");
    const recordingTime = root.querySelector("[data-voice-recording-time]");
    const panel = root.querySelector(".voice-panel");
    const head = root.querySelector(".voice-head");
    const dragControls = installDraggable({
      dragRoot: root,
      visibleWhenClosed: toggle,
      visibleWhenOpen: panel,
      handles: [toggle, head]
    });
    const recorder = window.VoiceRecorder && window.VoiceRecorder.create ? window.VoiceRecorder.create({
      onStateChange(nextState) {
        const isRecording = nextState === "recording";
        const isRequesting = nextState === "requesting";
        root.classList.toggle("is-recording", isRecording);
        recordingLabel.textContent = isRecording ? RECORDING_LABEL : IDLE_LABEL;
        start.disabled = isRecording || isRequesting;
        stop.disabled = !isRecording && !isRequesting;
        if (isRequesting) {
          setStatus(status, "正在请求麦克风权限...", "warning");
        } else if (isRecording) {
          setStatus(status, "", "");
        }
      },
      onTimeChange(time) {
        recordingTime.textContent = time.label;
      },
      onError(message) {
        setStatus(status, message, "warning");
        alert(message);
      }
    }) : null;

    if (!recorder) {
      start.disabled = true;
      stop.disabled = true;
      setStatus(status, UNSUPPORTED_MESSAGE, "warning");
    }

    toggle.addEventListener("click", () => {
      root.classList.add("is-open");
      dragControls.clamp();
      setTimeout(() => textarea.focus(), 80);
    });

    close.addEventListener("click", () => {
      root.classList.remove("is-open");
    });

    start.addEventListener("click", async () => {
      if (!recorder) {
        setStatus(status, UNSUPPORTED_MESSAGE, "warning");
        alert(UNSUPPORTED_MESSAGE);
        return;
      }
      await recorder.start();
    });

    stop.addEventListener("click", () => {
      if (!recorder) return;
      recorder.stop();
    });

    copy.addEventListener("click", async () => {
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

    clear.addEventListener("click", () => {
      textarea.value = "";
      textarea.focus();
      setStatus(status, "", "");
    });

    document.body.appendChild(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initVoiceAssistant);
  } else {
    initVoiceAssistant();
  }
})();
