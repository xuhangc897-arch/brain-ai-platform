(function () {
  "use strict";

  const AI_API_ENDPOINT = "https://brain-ai-platform.vercel.app/api/chat";
  const MAX_QUESTION_LENGTH = 500;

  const root = document.createElement("div");
  root.className = "ai-assistant";
  root.innerHTML = `
    <button class="ai-toggle" type="button" aria-label="打开 AI 助手">AI</button>
    <section class="ai-panel" aria-label="AI 学习助手">
      <header class="ai-head">
        <div>
          <p class="ai-title">AI 学习助手</p>
          <p class="ai-subtitle">只给提示，不代写答案</p>
        </div>
        <button class="ai-close" type="button" aria-label="关闭 AI 助手">×</button>
      </header>
      <div class="ai-messages" aria-live="polite"></div>
      <form class="ai-form">
        <input class="ai-input" type="text" maxlength="${MAX_QUESTION_LENGTH}" placeholder="输入你的问题..." autocomplete="off" />
        <button class="ai-send" type="submit">发送</button>
      </form>
    </section>
  `;

  const toggle = root.querySelector(".ai-toggle");
  const close = root.querySelector(".ai-close");
  const messages = root.querySelector(".ai-messages");
  const form = root.querySelector(".ai-form");
  const input = root.querySelector(".ai-input");
  const send = root.querySelector(".ai-send");

  function getEndpoint() {
    return window.BRAIN_AI_ENDPOINT || AI_API_ENDPOINT;
  }

  function getText(selector) {
    const node = document.querySelector(selector);
    return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function getCurrentStep() {
    const activeProgress = getText(".progress-step.is-active");
    if (activeProgress) return activeProgress;
    const panelTitle = getText(".panel-head h2");
    if (panelTitle) return panelTitle;
    const scienceTitle = getText("#scienceTitle h2");
    if (scienceTitle) return scienceTitle;
    return "未识别当前步骤";
  }

  function getExperimentName() {
    const title = document.title.replace(/\s+/g, " ").trim();
    const headerTitle = getText(".brand-title h1") || getText("h1") || getText(".ai-page-title");
    return headerTitle || title || "脑育智能体学习平台";
  }

  function getContext(question) {
    return {
      question,
      pageTitle: document.title || "",
      experimentName: getExperimentName(),
      currentStep: getCurrentStep(),
      path: location.pathname
    };
  }

  function appendMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `ai-message ${role === "user" ? "is-user" : "is-ai"}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    if (open) {
      setTimeout(() => input.focus(), 80);
    }
  }

  async function askAssistant(question) {
    const endpoint = getEndpoint();
    if (!endpoint) {
      return "AI 后端地址还没有配置。请教师在 assets/ai-assistant.js 中填写 AI_API_ENDPOINT，或在页面中设置 window.BRAIN_AI_ENDPOINT。";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getContext(question))
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return data.error || "AI 助手暂时无法回答，请稍后再试。";
    }
    return data.answer || "我暂时没有生成有效回答。你可以换一种问法试试。";
  }

  toggle.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    appendMessage("user", question);
    input.value = "";
    input.disabled = true;
    send.disabled = true;
    const loading = appendMessage("ai", "我正在思考，先试着回到材料里找一个线索...");

    try {
      loading.textContent = await askAssistant(question);
    } catch (error) {
      loading.textContent = "AI 助手连接失败。请检查网络、Vercel 后端地址或环境变量配置。";
    } finally {
      input.disabled = false;
      send.disabled = false;
      input.focus();
      messages.scrollTop = messages.scrollHeight;
    }
  });

  function initAssistant() {
    if (document.querySelector(".ai-assistant")) return;
    document.body.appendChild(root);
    appendMessage("ai", "你好，我可以解释概念、提醒你看材料、帮你梳理思路，但不会直接替你写实验答案。");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAssistant);
  } else {
    initAssistant();
  }
})();
