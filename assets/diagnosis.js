(function () {
  "use strict";

  const root = document.getElementById("diagnosisRoot");
  const printBtn = document.getElementById("printBtn");
  const retryBtn = document.getElementById("retryBtn");

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderList(items, className = "") {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return '<p class="diagnosis-empty">本项暂时没有足够记录。</p>';
    return `<ul class="diagnosis-list ${className}">${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }

  function formatDate(value) {
    if (!value) return "";
    if (typeof value === "string") return new Date(value).toLocaleString();
    if (value.$date) return new Date(value.$date).toLocaleString();
    if (value.seconds) return new Date(value.seconds * 1000).toLocaleString();
    return "";
  }

  function renderDiagnosis(diagnosis) {
    const report = diagnosis.report || {};
    root.innerHTML = `
      <article class="diagnosis-sheet">
        <header class="diagnosis-header">
          <p class="diagnosis-kicker">记忆侦探社 · 四次探究总结</p>
          <h1>你的记忆侦探诊断</h1>
          <p class="diagnosis-meta">第 ${escapeHtml(diagnosis.diagnosisVersion)} 版 · ${escapeHtml(formatDate(diagnosis.generatedAt))}</p>
          <p class="diagnosis-lead">${escapeHtml(diagnosis.progressSummary)}</p>
        </header>
        <section class="diagnosis-section">
          <h2>你做得很好的地方</h2>
          ${renderList(report.strengths)}
        </section>
        <section class="diagnosis-section">
          <h2>你在四次实验中的进步</h2>
          ${renderList(report.progress)}
        </section>
        <section class="diagnosis-section">
          <h2>你还可以继续提升的地方</h2>
          ${renderList(report.growthAreas)}
        </section>
        <section class="diagnosis-section">
          <h2>五个学习观察维度</h2>
          <div class="dimension-grid">
            ${(diagnosis.dimensions || []).map((item) => `
              <article class="dimension-card">
                <h3>${escapeHtml(item.title)}</h3>
                <span class="dimension-level">${escapeHtml(item.level)}</span>
                <p>${escapeHtml(item.progress)}</p>
                <p><strong>下一步：</strong>${escapeHtml(item.suggestion)}</p>
              </article>
            `).join("")}
          </div>
        </section>
        <section class="diagnosis-section">
          <h2>下一步行动建议</h2>
          ${renderList(report.nextActions, "actions")}
        </section>
      </article>
    `;
    retryBtn.hidden = true;
  }

  function renderStatus(title, message, canRetry) {
    root.innerHTML = `<section class="diagnosis-status"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></section>`;
    retryBtn.hidden = !canRetry;
  }

  async function load() {
    const session = window.BrainPlatform?.identity?.readStudentSession?.();
    if (!session || session.isGuest || !session.sessionToken) {
      renderStatus("请先登录", "学习诊断只向已登录的学生本人开放。", false);
      return;
    }
    window.LearningDiagnosis.init({ experimentId: "strategies" });
    const result = await window.LearningDiagnosis.refresh();
    if (!result) {
      renderStatus("暂时无法读取", "网络或诊断服务暂时不可用，请稍后再试。", true);
      return;
    }
    if (result.diagnosis) {
      renderDiagnosis(result.diagnosis);
      return;
    }
    if (!result.eligibility?.eligible) {
      renderStatus("诊断尚未开放", "完成全部四次记忆探究后，这里会出现你的学习诊断。", false);
      return;
    }
    renderStatus("正在整理学习诊断", "四次实验已经完成，系统正在核对记录并生成诊断。", true);
  }

  printBtn?.addEventListener("click", () => window.print());
  retryBtn?.addEventListener("click", async () => {
    retryBtn.disabled = true;
    renderStatus("正在重新整理", "请稍候，不会影响你已经完成的实验记录。", false);
    await window.LearningDiagnosis.requestGeneration();
    retryBtn.disabled = false;
    load();
  });

  load();
})();
