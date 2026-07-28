(function () {
  "use strict";

  const PARTNER_NAME = "记忆侦探助手";
  const DRAG_MARGIN = 12;
  const DRAG_THRESHOLD = 5;

  function initMemoryPartner() {
    if (document.querySelector(".memory-partner")) return;

    const aiAssistant = document.querySelector(".ai-assistant");
    const voiceAssistant = document.querySelector(".voice-assistant");
    if (!aiAssistant && !voiceAssistant) {
      console.warn("[Memory Partner] No assistant modules are available.");
      return;
    }

    const root = document.createElement("div");
    root.className = "memory-partner";
    root.innerHTML = `
      <div class="memory-partner-menu" id="memoryPartnerMenu" aria-label="${PARTNER_NAME}功能">
        <p class="memory-partner-menu-title">需要我怎么帮助你？</p>
        ${aiAssistant ? `
          <button class="memory-partner-action" type="button" data-partner-mode="ai">
            <span class="memory-partner-action-icon" aria-hidden="true">💬</span>
            <span class="memory-partner-action-copy">
              <strong>AI 对话</strong>
              <small>梳理思路、理解概念，不代写答案</small>
            </span>
          </button>
        ` : ""}
        ${voiceAssistant ? `
          <button class="memory-partner-action" type="button" data-partner-mode="voice">
            <span class="memory-partner-action-icon" aria-hidden="true">🎙</span>
            <span class="memory-partner-action-copy">
              <strong>语音输入</strong>
              <small>把说话内容转换成可复制的文字</small>
            </span>
          </button>
        ` : ""}
      </div>
      <button class="memory-partner-launcher" type="button" aria-label="打开${PARTNER_NAME}" aria-expanded="false" aria-controls="memoryPartnerMenu">
        <span class="memory-partner-avatar" aria-hidden="true">
          <span class="memory-partner-pose is-initial"></span>
          <span class="memory-partner-pose is-thinking"></span>
        </span>
        <span class="memory-partner-copy">
          <span class="memory-partner-name">${PARTNER_NAME}</span>
          <span class="memory-partner-status">AI 对话 · 语音输入</span>
        </span>
      </button>
    `;

    const launcher = root.querySelector(".memory-partner-launcher");
    const status = root.querySelector(".memory-partner-status");
    const aiToggle = aiAssistant && aiAssistant.querySelector(".ai-toggle");
    const aiClose = aiAssistant && aiAssistant.querySelector(".ai-close");
    const voiceToggle = voiceAssistant && voiceAssistant.querySelector(".voice-toggle");
    const voiceClose = voiceAssistant && voiceAssistant.querySelector(".voice-close");
    const aiPanel = aiAssistant && aiAssistant.querySelector(".ai-panel");
    const voicePanel = voiceAssistant && voiceAssistant.querySelector(".voice-panel");
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let didDrag = false;
    let suppressClick = false;

    function clamp(value, minimum, maximum) {
      return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
    }

    function getOpenPanel() {
      if (aiAssistant && aiAssistant.classList.contains("is-open")) return aiPanel;
      if (voiceAssistant && voiceAssistant.classList.contains("is-open")) return voicePanel;
      return null;
    }

    function positionOpenPanel() {
      const panel = getOpenPanel();
      if (!panel) return;

      const launcherRect = launcher.getBoundingClientRect();
      const panelWidth = panel.offsetWidth || panel.getBoundingClientRect().width;
      const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height;
      const maxLeft = window.innerWidth - panelWidth - DRAG_MARGIN;
      const maxTop = window.innerHeight - panelHeight - DRAG_MARGIN;
      const aboveTop = launcherRect.top - panelHeight - 12;
      const belowTop = launcherRect.bottom + 12;
      const leftSide = launcherRect.left - panelWidth - 12;
      const rightSide = launcherRect.right + 12;
      let left = clamp(launcherRect.right - panelWidth, DRAG_MARGIN, maxLeft);
      let top = clamp(aboveTop, DRAG_MARGIN, maxTop);

      if (aboveTop < DRAG_MARGIN && leftSide >= DRAG_MARGIN) {
        left = leftSide;
        top = clamp(launcherRect.top, DRAG_MARGIN, maxTop);
      } else if (aboveTop < DRAG_MARGIN && rightSide <= maxLeft) {
        left = rightSide;
        top = clamp(launcherRect.top, DRAG_MARGIN, maxTop);
      } else if (aboveTop < DRAG_MARGIN && belowTop <= maxTop) {
        top = belowTop;
      }

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }

    function applyPosition(left, top) {
      const width = launcher.offsetWidth || launcher.getBoundingClientRect().width || 1;
      const height = launcher.offsetHeight || launcher.getBoundingClientRect().height || 1;
      root.classList.add("is-dragged");
      root.style.left = `${clamp(left, DRAG_MARGIN, window.innerWidth - width - DRAG_MARGIN)}px`;
      root.style.top = `${clamp(top, DRAG_MARGIN, window.innerHeight - height - DRAG_MARGIN)}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      positionOpenPanel();
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
      root.classList.remove("is-dragging");
      try {
        launcher.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture may already be released.
      }
      if (!didDrag) return;
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }

    function setMenuOpen(open) {
      root.classList.toggle("is-menu-open", open);
      launcher.setAttribute("aria-expanded", String(open));
    }

    function closeAssistant(assistant, closeButton) {
      if (!assistant || !assistant.classList.contains("is-open")) return;
      if (closeButton) {
        closeButton.click();
      } else {
        assistant.classList.remove("is-open");
      }
    }

    function closeAllAssistants() {
      closeAssistant(aiAssistant, aiClose);
      closeAssistant(voiceAssistant, voiceClose);
      status.textContent = "AI 对话 · 语音输入";
    }

    function openMode(mode) {
      closeAllAssistants();
      setMenuOpen(false);

      if (mode === "ai" && aiToggle) {
        aiToggle.click();
        status.textContent = "正在使用 AI 对话";
        window.requestAnimationFrame(positionOpenPanel);
        return;
      }

      if (mode === "voice" && voiceToggle) {
        voiceToggle.click();
        status.textContent = "正在使用语音输入";
        window.requestAnimationFrame(positionOpenPanel);
      }
    }

    launcher.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = launcher.getBoundingClientRect();
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      didDrag = false;
      root.classList.add("is-dragging");
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener("pointermove", onPointerMove);
    launcher.addEventListener("pointerup", onPointerUp);
    launcher.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    launcher.addEventListener("click", (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const hasOpenAssistant = Boolean(
        (aiAssistant && aiAssistant.classList.contains("is-open")) ||
        (voiceAssistant && voiceAssistant.classList.contains("is-open"))
      );
      if (hasOpenAssistant) {
        closeAllAssistants();
        setMenuOpen(true);
        return;
      }
      setMenuOpen(!root.classList.contains("is-menu-open"));
    });

    root.querySelectorAll("[data-partner-mode]").forEach((button) => {
      button.addEventListener("click", () => openMode(button.dataset.partnerMode));
    });

    [aiClose, voiceClose].filter(Boolean).forEach((button) => {
      button.addEventListener("click", () => {
        status.textContent = "AI 对话 · 语音输入";
      });
    });

    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) setMenuOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      closeAllAssistants();
      launcher.focus();
    });

    [aiPanel, voicePanel].filter(Boolean).forEach((panel) => {
      panel.addEventListener("mouseenter", () => root.classList.add("is-thinking"));
      panel.addEventListener("mouseleave", () => root.classList.remove("is-thinking"));
    });

    window.addEventListener("resize", () => {
      if (root.classList.contains("is-dragged")) {
        const rect = launcher.getBoundingClientRect();
        applyPosition(rect.left, rect.top);
      } else {
        positionOpenPanel();
      }
    });

    if (aiAssistant) {
      const title = aiAssistant.querySelector(".ai-title");
      const panel = aiAssistant.querySelector(".ai-panel");
      if (title) title.textContent = `${PARTNER_NAME} · AI 对话`;
      if (panel) panel.setAttribute("aria-label", `${PARTNER_NAME} AI 对话`);
    }

    if (voiceAssistant) {
      const title = voiceAssistant.querySelector(".voice-title");
      const panel = voiceAssistant.querySelector(".voice-panel");
      if (title) title.textContent = `${PARTNER_NAME} · 语音输入`;
      if (panel) panel.setAttribute("aria-label", `${PARTNER_NAME}语音输入`);
    }

    document.body.classList.add("has-memory-partner");
    document.body.appendChild(root);
    window.MemoryPartner = {
      openAi: () => openMode("ai"),
      openVoice: () => openMode("voice"),
      close: closeAllAssistants
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMemoryPartner);
  } else {
    initMemoryPartner();
  }
})();
