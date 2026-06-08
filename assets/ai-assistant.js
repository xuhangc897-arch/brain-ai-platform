(function () {
  "use strict";

  const AI_API_ENDPOINT = "https://1441391469-5jm5srurlk.ap-shanghai.tencentscf.com";
  const CONTEXT_KEY = "science-inquiry-context-v1";
  const LOG_KEY = "aiChatLogs";
  const MAX_QUESTION_LENGTH = 500;

  const root = document.createElement("div");
  root.className = "ai-assistant";
  root.innerHTML = `
    <button class="ai-toggle" type="button" aria-label="打开 AI 助手">
      <span class="ai-brain-wrap" aria-hidden="true">
        <svg class="ai-brain-icon" viewBox="0 0 64 64" focusable="false">
          <path class="ai-brain-fill" d="M23.6 49.8c-6.3-.7-11-5.5-11-11.8 0-2.6.8-5 2.2-7-1.3-5.8 2.4-11.5 8.2-12.3 2-4.1 6-6.6 10.6-6.6 5.7 0 10.5 3.9 11.6 9.3 4.6 1.5 7.8 5.7 7.8 10.8 0 5.3-3.5 9.8-8.3 11.1-1.7 4.1-5.7 7-10.5 7-1.7 0-3.4-.4-4.8-1.1-1.7.8-3.7 1.1-5.8.6Z"/>
          <path d="M23.1 19.1c-1.4 2.5-1.3 5.8.5 8.3M34 12.4c-2.6 2.2-3.5 5.8-2.2 8.9M45 21.6c-3.4-.2-6.6 1.5-8.2 4.4M15.1 31.1c2.5-.7 5.3-.1 7.3 1.8M29.1 48.9c1.6-2.5 1.8-5.7.5-8.3M44.7 43.3c-.6-3.4-2.9-6-6-7.1M24.2 32.7c2.3-2.1 5.8-2.6 8.6-1.2" />
          <circle cx="39.8" cy="31.9" r="2.1" />
          <circle cx="23.8" cy="39.1" r="2" />
        </svg>
        <span class="ai-brain-mark">?</span>
      </span>
      <span class="ai-toggle-label">点击与 AI 对话</span>
    </button>
    <section class="ai-panel" aria-label="AI 学习助手">
      <header class="ai-head">
        <div class="ai-heading">
          <p class="ai-title">AI 学习助手</p>
          <p class="ai-subtitle">只给提示，不代写答案</p>
        </div>
        <div class="ai-head-actions" aria-label="AI 对话记录操作">
          <button class="ai-tool-btn" type="button" data-ai-export>导出记录</button>
          <button class="ai-tool-btn danger" type="button" data-ai-clear>清空记录</button>
          <button class="ai-close" type="button" aria-label="关闭 AI 助手">×</button>
        </div>
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
  const exportButton = root.querySelector("[data-ai-export]");
  const clearButton = root.querySelector("[data-ai-clear]");

  function getEndpoint() {
    return window.BRAIN_AI_ENDPOINT || AI_API_ENDPOINT;
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value || fallback;
    } catch (error) {
      console.warn("[AI Assistant] localStorage parse failed:", key, error);
      return fallback;
    }
  }

  function readIdentity() {
    const identity = readJson(CONTEXT_KEY, {});
    return {
      studentName: identity.studentName || "",
      studentAge: identity.studentAge || "",
      studentId: identity.studentId || "",
      groupId: identity.groupId || ""
    };
  }

  function readLogs() {
    const logs = readJson(LOG_KEY, []);
    return Array.isArray(logs) ? logs : [];
  }

  function saveLogs(logs) {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
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
      ...readIdentity(),
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

  function renderHistory() {
    messages.innerHTML = "";
    const identity = readIdentity();
    const logs = readLogs().filter((log) => {
      if (identity.studentId && log.studentId && log.studentId !== identity.studentId) return false;
      return log.path === location.pathname;
    });

    if (!logs.length) {
      appendMessage("ai", "你好，我可以解释概念、提醒你看材料、帮你梳理思路，但不会直接替你写实验答案。");
      return;
    }

    logs.slice(-20).forEach((log) => {
      appendMessage("user", log.question);
      appendMessage("ai", log.answer);
    });
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    if (open) {
      renderHistory();
      setTimeout(() => input.focus(), 80);
    }
  }

  function buildLog(context, answer) {
    return {
      timestamp: new Date().toISOString(),
      studentName: context.studentName,
      studentAge: context.studentAge,
      studentId: context.studentId,
      groupId: context.groupId,
      pageTitle: context.pageTitle,
      experimentName: context.experimentName,
      currentStep: context.currentStep,
      path: context.path,
      question: context.question,
      answer
    };
  }

  function saveChatLog(context, answer) {
    const logs = readLogs();
    logs.push(buildLog(context, answer));
    saveLogs(logs);
  }

  function makeAssistantError(reason) {
    return `AI 助手连接失败：${reason}`;
  }

  async function askAssistant(context) {
    const endpoint = getEndpoint();
    if (!endpoint) {
      throw new Error("AI 接口地址未配置，请在 assets/ai-assistant.js 中填写 AI_API_ENDPOINT。");
    }
    if (!/^(https?:\/\/|\/)/.test(endpoint)) {
      console.warn("[AI Assistant] endpoint should be an absolute URL or a root-relative path:", endpoint);
    }

    let response;
    try {
      console.info("[AI Assistant] requesting:", endpoint, {
        pageTitle: context.pageTitle,
        experimentName: context.experimentName,
        currentStep: context.currentStep,
        studentId: context.studentId,
        hasQuestion: Boolean(context.question)
      });
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context)
      });
    } catch (error) {
      console.error("[AI Assistant] fetch failed:", endpoint, error);
      throw new Error("后端接口无法访问，请检查 AI 接口地址、网络或 CORS 配置。");
    }

    const data = await response.json().catch((error) => {
      console.error("[AI Assistant] response JSON parse failed:", response.status, error);
      return {};
    });

    if (!response.ok) {
      console.error("[AI Assistant] backend error:", {
        endpoint,
        status: response.status,
        data
      });
      const detail = data.error || `后端返回 HTTP ${response.status}`;
      throw new Error(detail);
    }

    const answer = data.reply || data.answer;
    if (!answer) {
      console.error("[AI Assistant] missing reply field:", data);
      throw new Error("后端没有返回 reply 字段。");
    }
    return answer;
  }

  function csvCell(value) {
    const text = String(value ?? "").replace(/\r?\n/g, " ");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportLogs() {
    const logs = readLogs();
    if (!logs.length) {
      appendMessage("ai", "当前还没有可导出的 AI 对话记录。");
      return;
    }

    const headers = ["时间", "学生姓名", "学生年龄", "学生编号", "小组编号", "页面", "实验", "阶段", "学生问题", "AI回答"];
    const rows = logs.map((log) => [
      log.timestamp,
      log.studentName,
      log.studentAge,
      log.studentId,
      log.groupId,
      log.pageTitle || log.path,
      log.experimentName,
      log.currentStep,
      log.question,
      log.answer
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const identity = readIdentity();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `ai_chat_logs_${identity.studentId || "unknown"}_${stamp}.csv`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function clearLogs() {
    if (!confirm("确定要清空 AI 对话记录吗？此操作不可恢复。")) return;
    localStorage.removeItem(LOG_KEY);
    renderHistory();
  }

  toggle.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));
  exportButton.addEventListener("click", exportLogs);
  clearButton.addEventListener("click", clearLogs);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    const context = getContext(question);
    appendMessage("user", question);
    input.value = "";
    input.disabled = true;
    send.disabled = true;
    const loading = appendMessage("ai", "我正在思考，先试着回到材料里找一个线索...");

    try {
      const answer = await askAssistant(context);
      loading.textContent = answer;
      saveChatLog(context, answer);
    } catch (error) {
      const reason = error && error.message ? error.message : "网络请求失败。";
      const message = makeAssistantError(reason);
      loading.textContent = message;
      saveChatLog(context, `错误：${message}`);
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
    renderHistory();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAssistant);
  } else {
    initAssistant();
  }
})();
