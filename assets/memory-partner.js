(function (global) {
  "use strict";

  const PARTNER_NAME = "记忆侦探助手";
  const DRAG_MARGIN = 12;
  const DRAG_THRESHOLD = 5;
  let activeInstance = null;
  let pendingConfig = null;

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  }

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getFallbackLearningState(config) {
    const progressButtons = Array.from(document.querySelectorAll(".progress-step"));
    const activeButton = progressButtons.find((button) =>
      button.classList.contains("active") ||
      button.classList.contains("is-active") ||
      button.getAttribute("aria-current") === "step"
    );
    const configuredStage = document.querySelector(
      '[data-stage-id][aria-current="step"], [data-stage-id].is-active, [data-stage-id].active'
    );
    const currentIndex = Math.max(0, activeButton ? progressButtons.indexOf(activeButton) : 0);
    const stageTitle = asText(
      configuredStage?.dataset.taskTitle ||
      activeButton?.querySelector("span")?.textContent ||
      document.querySelector("main .panel-head h2, main .panel-head h3")?.textContent
    );
    const fallbackDescription = asText(
      configuredStage?.dataset.taskDescription ||
      document.querySelector("main [data-task-description]")?.textContent ||
      document.querySelector("main .panel-body p")?.textContent
    );
    const steps = progressButtons.map((button, index) => ({
      id: button.dataset.stageId || button.dataset.step || `step-${index + 1}`,
      title: asText(button.querySelector("span")?.textContent) || `步骤 ${index + 1}`,
      taskDescription: index === currentIndex ? fallbackDescription : ""
    }));
    const completedCount = progressButtons.filter((button) =>
      button.classList.contains("done") || button.classList.contains("is-done")
    ).length;

    if (!steps.length && (configuredStage || stageTitle)) {
      steps.push({
        id: configuredStage?.dataset.stageId || "current",
        title: stageTitle || "当前任务",
        taskDescription: fallbackDescription
      });
    }

    return {
      experimentName: asText(config.experimentName) || document.title,
      steps,
      currentStepIndex: Math.min(currentIndex, Math.max(0, steps.length - 1)),
      maxUnlockedStep: completedCount
    };
  }

  function readLearningState(config) {
    let supplied = null;
    if (typeof config.getLearningState === "function") {
      try {
        supplied = config.getLearningState();
      } catch (error) {
        console.warn("[Virtual Agent] Learning state is unavailable.");
      }
    }

    if (!supplied || !Array.isArray(supplied.steps) || !supplied.steps.length) {
      return getFallbackLearningState(config);
    }

    const steps = supplied.steps.map((step, index) => ({
      id: asText(step?.id) || `step-${index + 1}`,
      title: asText(step?.title) || `步骤 ${index + 1}`,
      taskDescription: asText(step?.taskDescription || step?.description)
    }));
    const currentStepIndex = clamp(
      Number.isFinite(Number(supplied.currentStepIndex)) ? Number(supplied.currentStepIndex) : 0,
      0,
      steps.length - 1
    );
    const maxUnlockedStep = clamp(
      Number.isFinite(Number(supplied.maxUnlockedStep)) ? Number(supplied.maxUnlockedStep) : 0,
      0,
      steps.length
    );

    return {
      experimentName: asText(config.experimentName) || document.title,
      steps,
      currentStepIndex,
      maxUnlockedStep
    };
  }

  function createVirtualAgent(config) {
    if (!config || !asText(config.experimentId)) {
      throw new Error("experimentId is required");
    }

    const existingRoot = document.querySelector(".memory-partner");
    if (existingRoot) existingRoot.remove();
    document.body.classList.remove("has-memory-partner", "has-virtual-agent");

    const aiAssistant = document.querySelector(".ai-assistant");
    const voiceAssistant = document.querySelector(".voice-assistant");
    const root = document.createElement("div");
    root.className = "memory-partner";
    root.dataset.experimentId = config.experimentId;
    root.innerHTML = `
      <section class="memory-partner-menu" id="memoryPartnerMenu" role="dialog" aria-modal="false" aria-labelledby="memoryPartnerMenuTitle" aria-hidden="true">
        <header class="memory-partner-menu-head">
          <div>
            <p class="memory-partner-menu-kicker">秘密档案馆 · 学习工具</p>
            <h2 class="memory-partner-menu-title" id="memoryPartnerMenuTitle">需要我怎么帮助你？</h2>
          </div>
          <button class="memory-partner-menu-close" type="button" aria-label="关闭${PARTNER_NAME}功能面板">×</button>
        </header>
        <div class="memory-partner-view is-active" data-partner-view="menu">
          <button class="memory-partner-action" type="button" data-partner-mode="ai"${aiAssistant ? "" : " disabled"}>
            <span class="memory-partner-action-icon" aria-hidden="true">AI</span>
            <span class="memory-partner-action-copy">
              <strong>AI 学习助手</strong>
              <small>梳理思路、理解概念，不代写答案</small>
            </span>
          </button>
          <button class="memory-partner-action" type="button" data-partner-mode="voice"${voiceAssistant ? "" : " disabled"}>
            <span class="memory-partner-action-icon" aria-hidden="true">🎙</span>
            <span class="memory-partner-action-copy">
              <strong>语音转文字</strong>
              <small>先选择输入框，再把转写内容写进去</small>
            </span>
          </button>
          <button class="memory-partner-action" type="button" data-partner-mode="task">
            <span class="memory-partner-action-icon" aria-hidden="true">⌖</span>
            <span class="memory-partner-action-copy">
              <strong>查看当前任务</strong>
              <small>查看当前探究环节和任务说明</small>
            </span>
          </button>
          <button class="memory-partner-action" type="button" data-partner-mode="progress">
            <span class="memory-partner-action-icon" aria-hidden="true">✓</span>
            <span class="memory-partner-action-copy">
              <strong>查看学习进度</strong>
              <small>查看已完成和待完成的步骤</small>
            </span>
          </button>
        </div>
        <div class="memory-partner-view" data-partner-view="detail" aria-live="polite">
          <button class="memory-partner-back" type="button">← 返回工具列表</button>
          <div class="memory-partner-detail" data-partner-detail></div>
        </div>
      </section>
      <button class="memory-partner-launcher" type="button" aria-label="打开${PARTNER_NAME}" aria-expanded="false" aria-controls="memoryPartnerMenu">
        <span class="memory-partner-avatar" aria-hidden="true">
          <span class="memory-partner-pose is-initial"></span>
          <span class="memory-partner-pose is-thinking"></span>
        </span>
        <span class="memory-partner-copy">
          <span class="memory-partner-name">${PARTNER_NAME}</span>
          <span class="memory-partner-status" role="status" aria-live="polite">AI 学习助手 · 语音转文字 · 当前任务 · 学习进度</span>
        </span>
      </button>
    `;

    const launcher = root.querySelector(".memory-partner-launcher");
    const menu = root.querySelector(".memory-partner-menu");
    const menuView = root.querySelector('[data-partner-view="menu"]');
    const detailView = root.querySelector('[data-partner-view="detail"]');
    const detail = root.querySelector("[data-partner-detail]");
    const closeMenuButton = root.querySelector(".memory-partner-menu-close");
    const backButton = root.querySelector(".memory-partner-back");
    const status = root.querySelector(".memory-partner-status");
    const aiToggle = aiAssistant?.querySelector(".ai-toggle");
    const aiClose = aiAssistant?.querySelector(".ai-close");
    const voiceToggle = voiceAssistant?.querySelector(".voice-toggle");
    const voiceClose = voiceAssistant?.querySelector(".voice-close");
    const aiPanel = aiAssistant?.querySelector(".ai-panel");
    const voicePanel = voiceAssistant?.querySelector(".voice-panel");
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let didDrag = false;
    let suppressClick = false;

    function getOpenPanel() {
      if (aiAssistant?.classList.contains("is-open")) return aiPanel;
      if (voiceAssistant?.classList.contains("is-open")) return voicePanel;
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

    function showMenuView() {
      menuView.classList.add("is-active");
      detailView.classList.remove("is-active");
    }

    function setMenuOpen(open, options = {}) {
      root.classList.toggle("is-menu-open", open);
      launcher.setAttribute("aria-expanded", String(open));
      launcher.setAttribute("aria-label", `${open ? "关闭" : "打开"}${PARTNER_NAME}`);
      menu.setAttribute("aria-hidden", String(!open));
      if (!open) showMenuView();
      if (open && options.focus !== false) {
        window.requestAnimationFrame(() => {
          root.querySelector(".memory-partner-action:not(:disabled)")?.focus();
        });
      }
      if (!open && options.returnFocus) launcher.focus();
    }

    function closeAssistant(assistant, closeButton) {
      if (!assistant?.classList.contains("is-open")) return;
      if (closeButton) closeButton.click();
      else assistant.classList.remove("is-open");
    }

    function closeAllAssistants() {
      closeAssistant(aiAssistant, aiClose);
      closeAssistant(voiceAssistant, voiceClose);
      status.textContent = "AI 学习助手 · 语音转文字 · 当前任务 · 学习进度";
    }

    function renderTask() {
      const learningState = readLearningState(config);
      const currentStep = learningState.steps[learningState.currentStepIndex];
      const description = currentStep?.taskDescription || "请按照页面当前环节中的说明完成任务。";
      detail.innerHTML = `
        <div class="memory-partner-detail-heading">
          <span class="memory-partner-detail-label">当前任务</span>
          <h3>${escapeHtml(learningState.experimentName)}</h3>
        </div>
        <dl class="memory-partner-task">
          <div><dt>当前环节</dt><dd>${escapeHtml(currentStep?.title || "暂未识别")}</dd></div>
          <div><dt>任务说明</dt><dd>${escapeHtml(description)}</dd></div>
        </dl>
      `;
      showDetail();
      status.textContent = `当前任务：${currentStep?.title || "暂未识别"}`;
    }

    function renderProgress() {
      const learningState = readLearningState(config);
      const total = learningState.steps.length;
      const completed = clamp(learningState.maxUnlockedStep, 0, total);
      const currentStep = learningState.steps[learningState.currentStepIndex];
      const unfinished = learningState.steps.slice(completed);
      detail.innerHTML = `
        <div class="memory-partner-detail-heading">
          <span class="memory-partner-detail-label">学习进度</span>
          <h3>${escapeHtml(learningState.experimentName)}</h3>
        </div>
        <div class="memory-partner-progress-summary">
          <strong>${completed}<span> / ${total}</span></strong>
          <span>个步骤已完成</span>
        </div>
        <dl class="memory-partner-task">
          <div><dt>当前步骤</dt><dd>${escapeHtml(currentStep?.title || "暂未识别")}</dd></div>
        </dl>
        <div class="memory-partner-unfinished">
          <h4>尚未完成</h4>
          ${unfinished.length
            ? `<ol>${unfinished.map((step, index) => `
                <li${completed + index === learningState.currentStepIndex ? ' aria-current="step"' : ""}>
                  <span>${completed + index + 1}</span>${escapeHtml(step.title)}
                </li>
              `).join("")}</ol>`
            : "<p>当前实验步骤已全部完成。</p>"}
        </div>
      `;
      showDetail();
      status.textContent = `学习进度：已完成 ${completed} / ${total}`;
    }

    function showDetail() {
      menuView.classList.remove("is-active");
      detailView.classList.add("is-active");
      backButton.focus();
    }

    function openAssistant(mode) {
      closeAllAssistants();
      setMenuOpen(false);

      if (mode === "ai" && aiToggle) {
        aiToggle.click();
        const learningState = readLearningState(config);
        document.dispatchEvent(new CustomEvent("virtual-agent:ai-opened", {
          detail: {
            experimentId: config.experimentId || "",
            stageId: learningState.current && learningState.current.id
              ? learningState.current.id
              : ""
          }
        }));
        status.textContent = "正在使用 AI 学习助手";
        window.requestAnimationFrame(positionOpenPanel);
        return;
      }
      if (mode === "voice" && voiceToggle) {
        voiceToggle.click();
        status.textContent = "正在使用语音转文字";
        window.requestAnimationFrame(positionOpenPanel);
        return;
      }

      console.warn(`[Virtual Agent] ${mode === "ai" ? "AI" : "Voice"} assistant is unavailable.`);
    }

    function openMode(mode) {
      if (mode === "ai" || mode === "voice") {
        openAssistant(mode);
        return;
      }
      if (mode === "task") renderTask();
      if (mode === "progress") renderProgress();
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
        aiAssistant?.classList.contains("is-open") ||
        voiceAssistant?.classList.contains("is-open")
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
    closeMenuButton.addEventListener("click", () => setMenuOpen(false, { returnFocus: true }));
    backButton.addEventListener("click", () => {
      showMenuView();
      root.querySelector(".memory-partner-action:not(:disabled)")?.focus();
    });

    [aiClose, voiceClose].filter(Boolean).forEach((button) => {
      button.addEventListener("click", () => {
        status.textContent = "AI 学习助手 · 语音转文字 · 当前任务 · 学习进度";
      });
    });

    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) setMenuOpen(false, { focus: false });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const wasOpen = root.classList.contains("is-menu-open") || Boolean(getOpenPanel());
      setMenuOpen(false, { focus: false });
      closeAllAssistants();
      if (wasOpen) launcher.focus();
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
      if (title) title.textContent = `${PARTNER_NAME} · AI 学习助手`;
      if (aiPanel) aiPanel.setAttribute("aria-label", `${PARTNER_NAME} AI 学习助手`);
    }
    if (voiceAssistant) {
      const title = voiceAssistant.querySelector(".voice-title");
      if (title) title.textContent = `${PARTNER_NAME} · 语音转文字`;
      if (voicePanel) voicePanel.setAttribute("aria-label", `${PARTNER_NAME}语音转文字`);
    }

    document.body.appendChild(root);
    document.body.classList.add("has-memory-partner", "has-virtual-agent");

    return Object.freeze({
      open: () => setMenuOpen(true),
      openAi: () => openAssistant("ai"),
      openVoice: () => openAssistant("voice"),
      openTask: () => {
        setMenuOpen(true, { focus: false });
        renderTask();
      },
      openProgress: () => {
        setMenuOpen(true, { focus: false });
        renderProgress();
      },
      close: () => {
        setMenuOpen(false);
        closeAllAssistants();
      }
    });
  }

  function init(config) {
    if (activeInstance) return activeInstance;
    if (document.readyState === "loading") {
      pendingConfig = config;
      document.addEventListener("DOMContentLoaded", () => {
        const nextConfig = pendingConfig;
        pendingConfig = null;
        init(nextConfig);
      }, { once: true });
      return null;
    }
    try {
      activeInstance = createVirtualAgent(config);
      return activeInstance;
    } catch (error) {
      document.querySelector(".memory-partner")?.remove();
      document.body?.classList.remove("has-memory-partner", "has-virtual-agent");
      console.warn("[Virtual Agent] Initialization failed.", {
        name: error?.name || "Error"
      });
      return null;
    }
  }

  global.VirtualAgent = Object.freeze({ init });
  global.MemoryPartner = Object.freeze({
    openAi: () => activeInstance?.openAi(),
    openVoice: () => activeInstance?.openVoice(),
    close: () => activeInstance?.close()
  });
})(window);
