(function (global) {
  "use strict";

  const PARTNER_NAME = "记忆侦探助手";
  const DRAG_MARGIN = 12;
  const DRAG_THRESHOLD = 5;
  let activeInstance = null;
  let pendingConfig = null;
  let pendingDiagnosisState = null;

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
    let activeDetailMode = "";
    root.className = "memory-partner";
    root.dataset.experimentId = config.experimentId;
    root.innerHTML = `
      <section class="memory-partner-suggestion" role="dialog" aria-modal="false" aria-labelledby="memoryPartnerSuggestionTitle" aria-hidden="true">
        <button class="memory-partner-suggestion-close" type="button" aria-label="关闭语音输入建议">×</button>
        <p class="memory-partner-suggestion-kicker">输入支持</p>
        <h2 id="memoryPartnerSuggestionTitle">需要换一种输入方式吗？</h2>
        <p class="memory-partner-suggestion-message" aria-live="polite"></p>
        <div class="memory-partner-suggestion-actions">
          <button class="memory-partner-suggestion-accept" type="button">使用语音输入</button>
          <button class="memory-partner-suggestion-dismiss" type="button">继续打字</button>
        </div>
      </section>
      <section class="memory-partner-relevance" role="dialog" aria-modal="false" aria-labelledby="memoryPartnerRelevanceTitle" aria-hidden="true">
        <button class="memory-partner-relevance-close" type="button" aria-label="关闭任务相关性提示">×</button>
        <p class="memory-partner-relevance-kicker">任务提示</p>
        <h2 id="memoryPartnerRelevanceTitle"></h2>
        <p class="memory-partner-relevance-message" aria-live="polite"></p>
        <div class="memory-partner-relevance-requirement" hidden>
          <strong class="memory-partner-relevance-task-title"></strong>
          <p class="memory-partner-relevance-task-instruction"></p>
        </div>
        <div class="memory-partner-relevance-actions">
          <button class="memory-partner-relevance-view" type="button">查看任务要求</button>
          <button class="memory-partner-relevance-modify" type="button">返回修改</button>
          <button class="memory-partner-relevance-keep" type="button">仍然保留</button>
        </div>
      </section>
      <section class="memory-partner-memory-support" role="dialog" aria-modal="false" aria-labelledby="memoryPartnerMemorySupportTitle" aria-hidden="true">
        <button class="memory-partner-memory-support-close" type="button" aria-label="关闭个性化学习建议">×</button>
        <p class="memory-partner-suggestion-kicker">上次探究带来的提示</p>
        <h2 id="memoryPartnerMemorySupportTitle">这条建议可能对当前任务有帮助</h2>
        <p class="memory-partner-memory-support-message" aria-live="polite"></p>
        <div class="memory-partner-suggestion-actions">
          <button class="memory-partner-memory-support-accept" type="button">知道了</button>
          <button class="memory-partner-memory-support-dismiss" type="button">暂时不用</button>
        </div>
      </section>
      <section class="memory-partner-diagnosis-ready" role="dialog" aria-modal="false" aria-labelledby="memoryPartnerDiagnosisReadyTitle" aria-hidden="true">
        <button class="memory-partner-diagnosis-ready-close" type="button" aria-label="稍后查看学习诊断">×</button>
        <p class="memory-partner-suggestion-kicker">四次探究完成</p>
        <h2 id="memoryPartnerDiagnosisReadyTitle">你的学习诊断已经整理好了</h2>
        <p class="memory-partner-diagnosis-ready-message" aria-live="polite">你已经完成了全部记忆探究任务，我根据四次实验中的表现整理了一份学习诊断。</p>
        <div class="memory-partner-suggestion-actions">
          <button class="memory-partner-diagnosis-ready-view" type="button">查看我的学习诊断</button>
          <button class="memory-partner-diagnosis-ready-later" type="button">稍后查看</button>
        </div>
      </section>
      <section class="memory-partner-menu" id="memoryPartnerMenu" role="dialog" aria-modal="false" aria-labelledby="memoryPartnerMenuTitle" aria-hidden="true">
        <header class="memory-partner-menu-head">
          <h2 class="memory-partner-menu-title" id="memoryPartnerMenuTitle">需要我怎么帮助你？</h2>
          <button class="memory-partner-menu-close" type="button" aria-label="关闭${PARTNER_NAME}功能面板">×</button>
        </header>
        <div class="memory-partner-view is-active" data-partner-view="menu">
          <button class="memory-partner-action" type="button" data-partner-mode="ai"${aiAssistant ? "" : " disabled"}>
            <span class="memory-partner-action-icon" aria-hidden="true">AI</span>
            <span class="memory-partner-action-copy">
              <strong>AI 学习助手</strong>
            </span>
          </button>
          <button class="memory-partner-action" type="button" data-partner-mode="voice"${voiceAssistant ? "" : " disabled"}>
            <span class="memory-partner-action-icon" aria-hidden="true">🎙</span>
            <span class="memory-partner-action-copy">
              <strong>语音转文字</strong>
            </span>
          </button>
          <button class="memory-partner-action" type="button" data-partner-mode="task">
            <span class="memory-partner-action-icon" aria-hidden="true">⌖</span>
            <span class="memory-partner-action-copy">
              <strong>查看当前任务</strong>
            </span>
          </button>
          <button class="memory-partner-action" type="button" data-partner-mode="memory">
            <span class="memory-partner-action-icon" aria-hidden="true">档</span>
            <span class="memory-partner-action-copy">
              <strong>我的学习记录</strong>
            </span>
          </button>
          <button class="memory-partner-action" type="button" data-partner-mode="diagnosis" hidden>
            <span class="memory-partner-action-icon" aria-hidden="true">诊</span>
            <span class="memory-partner-action-copy">
              <strong>我的学习诊断</strong>
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
          <span class="memory-partner-status" role="status" aria-live="polite">AI 学习助手 · 语音转文字 · 当前任务</span>
        </span>
      </button>
    `;

    const launcher = root.querySelector(".memory-partner-launcher");
    const menu = root.querySelector(".memory-partner-menu");
    const suggestion = root.querySelector(".memory-partner-suggestion");
    const suggestionMessage = root.querySelector(".memory-partner-suggestion-message");
    const suggestionClose = root.querySelector(".memory-partner-suggestion-close");
    const suggestionAccept = root.querySelector(".memory-partner-suggestion-accept");
    const suggestionDismiss = root.querySelector(".memory-partner-suggestion-dismiss");
    const relevance = root.querySelector(".memory-partner-relevance");
    const relevanceTitle = root.querySelector("#memoryPartnerRelevanceTitle");
    const relevanceMessage = root.querySelector(".memory-partner-relevance-message");
    const relevanceRequirement = root.querySelector(".memory-partner-relevance-requirement");
    const relevanceTaskTitle = root.querySelector(".memory-partner-relevance-task-title");
    const relevanceTaskInstruction = root.querySelector(".memory-partner-relevance-task-instruction");
    const relevanceClose = root.querySelector(".memory-partner-relevance-close");
    const relevanceView = root.querySelector(".memory-partner-relevance-view");
    const relevanceModify = root.querySelector(".memory-partner-relevance-modify");
    const relevanceKeep = root.querySelector(".memory-partner-relevance-keep");
    const memorySupport = root.querySelector(".memory-partner-memory-support");
    const memorySupportMessage = root.querySelector(".memory-partner-memory-support-message");
    const memorySupportClose = root.querySelector(".memory-partner-memory-support-close");
    const memorySupportAccept = root.querySelector(".memory-partner-memory-support-accept");
    const memorySupportDismiss = root.querySelector(".memory-partner-memory-support-dismiss");
    const diagnosisReady = root.querySelector(".memory-partner-diagnosis-ready");
    const diagnosisReadyClose = root.querySelector(".memory-partner-diagnosis-ready-close");
    const diagnosisReadyView = root.querySelector(".memory-partner-diagnosis-ready-view");
    const diagnosisReadyLater = root.querySelector(".memory-partner-diagnosis-ready-later");
    const diagnosisMenuButton = root.querySelector('[data-partner-mode="diagnosis"]');
    const menuView = root.querySelector('[data-partner-view="menu"]');
    const detailView = root.querySelector('[data-partner-view="detail"]');
    const detail = root.querySelector("[data-partner-detail]");
    const closeMenuButton = root.querySelector(".memory-partner-menu-close");
    const backButton = root.querySelector(".memory-partner-back");
    const status = root.querySelector(".memory-partner-status");
    let suggestionState = null;
    let relevanceState = null;
    let memorySupportState = null;
    let diagnosisReadyState = null;
    let diagnosisMenuState = null;
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
      activeDetailMode = "";
      menuView.classList.add("is-active");
      detailView.classList.remove("is-active");
    }

    function hasOpenAssistant() {
      return Boolean(
        aiAssistant?.classList.contains("is-open") ||
        voiceAssistant?.classList.contains("is-open")
      );
    }

    function resolveSuggestion(response, returnFocus) {
      if (!suggestionState) return false;
      const current = suggestionState;
      suggestionState = null;
      root.classList.remove("has-voice-suggestion");
      suggestion.setAttribute("aria-hidden", "true");
      suggestionMessage.textContent = "";
      try {
        current.onResponse(response);
      } catch (error) {
        console.warn("[Virtual Agent] Suggestion response handler failed.");
      }
      if (returnFocus && current.target?.isConnected) current.target.focus();
      return true;
    }

    function showVoiceSuggestion(options) {
      if (!options || typeof options.onResponse !== "function" || !options.target?.isConnected) {
        return false;
      }
      if (suggestionState || root.classList.contains("is-menu-open") || hasOpenAssistant()) {
        return false;
      }
      suggestionState = {
        target: options.target,
        onResponse: options.onResponse
      };
      suggestionMessage.textContent = asText(options.message);
      root.classList.add("has-voice-suggestion");
      suggestion.setAttribute("aria-hidden", "false");
      status.textContent = "当前任务中可能需要输入支持";
      return true;
    }

    function resolveRelevanceSuggestion(response, returnFocus) {
      if (!relevanceState) return false;
      const current = relevanceState;
      relevanceState = null;
      root.classList.remove("has-relevance-suggestion");
      relevance.setAttribute("aria-hidden", "true");
      relevanceRequirement.hidden = true;
      relevanceTitle.textContent = "";
      relevanceMessage.textContent = "";
      relevanceTaskTitle.textContent = "";
      relevanceTaskInstruction.textContent = "";
      try {
        current.onResponse(response);
      } catch (error) {
        console.warn("[Virtual Agent] Relevance response handler failed.");
      }
      if (returnFocus && current.target?.isConnected) current.target.focus();
      return true;
    }

    function showRelevanceSuggestion(options) {
      if (!options || typeof options.onResponse !== "function" || !options.target?.isConnected) {
        return false;
      }
      if (suggestionState || relevanceState || root.classList.contains("is-menu-open") || hasOpenAssistant()) {
        return false;
      }
      relevanceState = {
        target: options.target,
        onResponse: options.onResponse,
        requirementViewed: false
      };
      relevanceTitle.textContent = asText(options.title) || "再看看当前任务";
      relevanceMessage.textContent = asText(options.message);
      relevanceTaskTitle.textContent = asText(options.taskTitle);
      relevanceTaskInstruction.textContent = asText(options.taskInstruction);
      relevanceRequirement.hidden = true;
      root.classList.add("has-relevance-suggestion");
      relevance.setAttribute("aria-hidden", "false");
      status.textContent = "当前任务有一条思考提示";
      return true;
    }

    function resolveMemorySupport(response, returnFocus) {
      if (!memorySupportState) return false;
      const current = memorySupportState;
      memorySupportState = null;
      root.classList.remove("has-memory-support");
      memorySupport.setAttribute("aria-hidden", "true");
      memorySupportMessage.textContent = "";
      try {
        current.onResponse(response);
      } catch (error) {
        console.warn("[Virtual Agent] Memory support response handler failed.");
      }
      if (returnFocus && current.target?.isConnected) current.target.focus();
      return true;
    }

    function showMemorySupport(options) {
      if (!options || typeof options.onResponse !== "function" || !options.target?.isConnected) return false;
      if (suggestionState || relevanceState || memorySupportState || root.classList.contains("is-menu-open") || hasOpenAssistant()) return false;
      memorySupportState = { target: options.target, onResponse: options.onResponse };
      memorySupportMessage.textContent = asText(options.message);
      root.classList.add("has-memory-support");
      memorySupport.setAttribute("aria-hidden", "false");
      status.textContent = "有一条与当前任务相关的学习建议";
      return true;
    }

    function resolveDiagnosisReady(response) {
      if (!diagnosisReadyState) return false;
      const current = diagnosisReadyState;
      diagnosisReadyState = null;
      root.classList.remove("has-diagnosis-ready");
      diagnosisReady.setAttribute("aria-hidden", "true");
      try {
        if (response === "viewed") current.onView();
        else current.onLater();
      } catch (error) {
        console.warn("[Virtual Agent] Diagnosis response handler failed.");
      }
      return true;
    }

    function showDiagnosisReady(options) {
      if (!options || typeof options.onView !== "function" || typeof options.onLater !== "function") return false;
      if (
        suggestionState || relevanceState || memorySupportState || diagnosisReadyState ||
        root.classList.contains("is-menu-open") || hasOpenAssistant()
      ) return false;
      diagnosisReadyState = { onView: options.onView, onLater: options.onLater };
      root.classList.add("has-diagnosis-ready");
      diagnosisReady.setAttribute("aria-hidden", "false");
      status.textContent = "四次实验学习诊断已经整理完成";
      return true;
    }

    function setDiagnosisState(options) {
      diagnosisMenuState = options && typeof options === "object" ? options : null;
      const eligible = Boolean(diagnosisMenuState?.eligible);
      diagnosisMenuButton.hidden = !eligible;
      if (!eligible) return false;
      return true;
    }

    function setMenuOpen(open, options = {}) {
      if (open && suggestionState) resolveSuggestion("dismissed", false);
      if (open && relevanceState) resolveRelevanceSuggestion("closed", false);
      if (open && memorySupportState) resolveMemorySupport("dismissed", false);
      if (open && diagnosisReadyState) resolveDiagnosisReady("later");
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
      status.textContent = "AI 学习助手 · 语音转文字 · 当前任务";
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

    async function renderStudentMemory() {
      activeDetailMode = "memory";
      detail.innerHTML = '<p>正在读取你的学习记录...</p>';
      showDetail();
      try {
        const view = await global.StudentMemory?.getStudentView();
        const completed = Array.isArray(view?.completedExperiments) ? view.completedExperiments : [];
        const strengths = Array.isArray(view?.strengths) ? view.strengths : [];
        const suggestions = Array.isArray(view?.nextSuggestions) ? view.nextSuggestions : [];
        detail.innerHTML = `
          <div class="memory-partner-detail-heading">
            <span class="memory-partner-detail-label">我的学习记录</span>
            <h3>${escapeHtml(config.experimentName || "记忆侦探学习档案")}</h3>
          </div>
          <dl class="memory-partner-task">
            <div><dt>已完成实验</dt><dd>${completed.length ? completed.map((item) => escapeHtml(item.experimentId)).join("、") : "完成一次实验后会在这里形成记录"}</dd></div>
          </dl>
          <div class="memory-partner-unfinished"><h4>做得好的地方</h4>${strengths.length ? `<ul>${strengths.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : "<p>暂时还没有可展示的摘要。</p>"}</div>
          <div class="memory-partner-unfinished"><h4>下一次建议</h4>${suggestions.length ? `<ul>${suggestions.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : "<p>继续完成探究后，我会提供与任务相关的建议。</p>"}</div>
        `;
      } catch (error) {
        detail.innerHTML = "<p>学习记录暂时无法读取，不影响继续完成实验。</p>";
      }
    }

    function renderDiagnosis() {
      activeDetailMode = "diagnosis";
      const available = Boolean(diagnosisMenuState?.available);
      detail.innerHTML = `
        <div class="memory-partner-detail-heading">
          <span class="memory-partner-detail-label">四次探究总结</span>
          <h3>我的学习诊断</h3>
        </div>
        <div class="memory-partner-unfinished">
          <p>${available
            ? "诊断已经整理完成，可以在新页面查看并打印。"
            : "系统正在核对四次实验记录。这个过程不会影响你已经完成的实验和报告。"}</p>
          <button class="memory-partner-back" type="button" data-diagnosis-action>
            ${available ? "查看我的学习诊断" : "重新整理诊断"}
          </button>
        </div>
      `;
      showDetail();
      detail.querySelector("[data-diagnosis-action]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        if (available) {
          diagnosisMenuState?.open?.();
          return;
        }
        button.disabled = true;
        button.textContent = "正在整理...";
        await diagnosisMenuState?.retry?.();
        button.disabled = false;
        button.textContent = "稍后再试";
      });
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
        return true;
      }
      if (mode === "voice" && voiceToggle) {
        voiceToggle.click();
        status.textContent = "正在使用语音转文字";
        window.requestAnimationFrame(positionOpenPanel);
        return true;
      }

      console.warn(`[Virtual Agent] ${mode === "ai" ? "AI" : "Voice"} assistant is unavailable.`);
      return false;
    }

    function openMode(mode) {
      if (mode === "ai" || mode === "voice") {
        openAssistant(mode);
        return;
      }
      if (mode === "task") renderTask();
      if (mode === "memory") renderStudentMemory();
      if (mode === "diagnosis") renderDiagnosis();
    }

    document.addEventListener("student-memory:updated", () => {
      if (activeDetailMode === "memory" && root.classList.contains("is-menu-open")) {
        renderStudentMemory();
      }
    });

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
    suggestionAccept.addEventListener("click", () => resolveSuggestion("accepted", false));
    suggestionDismiss.addEventListener("click", () => resolveSuggestion("dismissed", true));
    suggestionClose.addEventListener("click", () => resolveSuggestion("dismissed", true));
    relevanceView.addEventListener("click", () => {
      if (!relevanceState) return;
      relevanceRequirement.hidden = false;
      if (!relevanceState.requirementViewed) {
        relevanceState.requirementViewed = true;
        try {
          relevanceState.onResponse("view_task");
        } catch (error) {
          console.warn("[Virtual Agent] Relevance response handler failed.");
        }
      }
      relevanceModify.focus();
    });
    relevanceModify.addEventListener("click", () => resolveRelevanceSuggestion("return_modify", true));
    relevanceKeep.addEventListener("click", () => resolveRelevanceSuggestion("keep", true));
    relevanceClose.addEventListener("click", () => resolveRelevanceSuggestion("closed", true));
    memorySupportAccept.addEventListener("click", () => resolveMemorySupport("accepted", true));
    memorySupportDismiss.addEventListener("click", () => resolveMemorySupport("dismissed", true));
    memorySupportClose.addEventListener("click", () => resolveMemorySupport("dismissed", true));
    diagnosisReadyView.addEventListener("click", () => resolveDiagnosisReady("viewed"));
    diagnosisReadyLater.addEventListener("click", () => resolveDiagnosisReady("later"));
    diagnosisReadyClose.addEventListener("click", () => resolveDiagnosisReady("later"));
    closeMenuButton.addEventListener("click", () => setMenuOpen(false, { returnFocus: true }));
    backButton.addEventListener("click", () => {
      showMenuView();
      root.querySelector(".memory-partner-action:not(:disabled)")?.focus();
    });

    [aiClose, voiceClose].filter(Boolean).forEach((button) => {
      button.addEventListener("click", () => {
        status.textContent = "AI 学习助手 · 语音转文字 · 当前任务";
      });
    });

    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) {
        setMenuOpen(false, { focus: false });
        if (relevanceState && event.target !== relevanceState.target) {
          resolveRelevanceSuggestion("closed", false);
        }
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (relevanceState) {
        resolveRelevanceSuggestion("closed", true);
        return;
      }
      if (memorySupportState) {
        resolveMemorySupport("dismissed", true);
        return;
      }
      if (diagnosisReadyState) {
        resolveDiagnosisReady("later");
        launcher.focus();
        return;
      }
      if (suggestionState) {
        resolveSuggestion("dismissed", true);
        return;
      }
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
      openVoiceFor: (target) => {
        if (!global.VoiceAssistant?.setTarget(target)) return false;
        return openAssistant("voice");
      },
      showVoiceSuggestion,
      hideVoiceSuggestion: (response = "ignored") => resolveSuggestion(response, false),
      showRelevanceSuggestion,
      hideRelevanceSuggestion: (response = "closed") => resolveRelevanceSuggestion(response, false),
      showMemorySupport,
      hideMemorySupport: (response = "ignored") => resolveMemorySupport(response, false),
      showDiagnosisReady,
      hideDiagnosisReady: () => resolveDiagnosisReady("later"),
      setDiagnosisState,
      isBusy: () => Boolean(
        suggestionState ||
        relevanceState ||
        memorySupportState ||
        diagnosisReadyState ||
        root.classList.contains("is-menu-open") ||
        hasOpenAssistant()
      ),
      isSuggestionElement: (node) => Boolean(
        node && (
          suggestion.contains(node) ||
          relevance.contains(node) ||
          memorySupport.contains(node) ||
          diagnosisReady.contains(node)
        )
      ),
      openTask: () => {
        setMenuOpen(true, { focus: false });
        renderTask();
      },
      close: () => {
        resolveSuggestion("ignored", false);
        resolveRelevanceSuggestion("closed", false);
        resolveMemorySupport("ignored", false);
        resolveDiagnosisReady("later");
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
      if (pendingDiagnosisState) activeInstance.setDiagnosisState(pendingDiagnosisState);
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

  global.VirtualAgent = Object.freeze({
    init,
    showVoiceSuggestion: (options) => Boolean(activeInstance?.showVoiceSuggestion(options)),
    hideVoiceSuggestion: (response) => Boolean(activeInstance?.hideVoiceSuggestion(response)),
    showRelevanceSuggestion: (options) => Boolean(activeInstance?.showRelevanceSuggestion(options)),
    hideRelevanceSuggestion: (response) => Boolean(activeInstance?.hideRelevanceSuggestion(response)),
    showMemorySupport: (options) => Boolean(activeInstance?.showMemorySupport(options)),
    hideMemorySupport: (response) => Boolean(activeInstance?.hideMemorySupport(response)),
    showDiagnosisReady: (options) => Boolean(activeInstance?.showDiagnosisReady(options)),
    hideDiagnosisReady: () => Boolean(activeInstance?.hideDiagnosisReady()),
    setDiagnosisState: (options) => {
      pendingDiagnosisState = options;
      return Boolean(activeInstance?.setDiagnosisState(options));
    },
    openVoiceFor: (target) => Boolean(activeInstance?.openVoiceFor(target)),
    isBusy: () => Boolean(activeInstance?.isBusy()),
    isSuggestionElement: (node) => Boolean(activeInstance?.isSuggestionElement(node))
  });
  global.MemoryPartner = Object.freeze({
    openAi: () => activeInstance?.openAi(),
    openVoice: () => activeInstance?.openVoice(),
    close: () => activeInstance?.close()
  });
})(window);
