(function () {
  const STORAGE_KEYS = {
    memory: "memory-capacity-state-v1",
    nback: "nback-inquiry-state-v1",
    interference: "longterm-interference-state-v1",
    strategies: "longterm-strategies-state-v1",
    poster: "poster-making-state-v1"
  };

  const ACTIVITY_META = {
    memory: { caseNo: "案件01", caseTitle: "记忆容量调查", activityName: "探索短时记忆的容量", type: "science" },
    nback: { caseNo: "案件02", caseTitle: "工作记忆追踪", activityName: "探索神奇的 N-back", type: "science" },
    interference: { caseNo: "案件03", caseTitle: "遗忘元凶调查", activityName: "探究干扰长时记忆的因素", type: "science" },
    strategies: { caseNo: "案件04", caseTitle: "记忆策略破解", activityName: "改善长时记忆的策略有哪些？", type: "science" },
    poster: { caseNo: "案件05", caseTitle: "科学海报创作档案", activityName: "海报制作与分享交流", type: "poster" }
  };

  const root = document.getElementById("reviewRoot");
  const printBtn = document.getElementById("printBtn");

  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  const params = new URLSearchParams(window.location.search);
  const activityType = params.get("activityType") || "memory";
  renderReviewPage(buildReviewData(activityType));

  function buildReviewData(activityType) {
    const meta = ACTIVITY_META[activityType] || ACTIVITY_META.memory;
    const storageKey = STORAGE_KEYS[activityType] || STORAGE_KEYS.memory;
    const state = readState(storageKey);
    const fields = state.fields || {};
    const generatedAt = new Date().toLocaleString();
    const base = {
      activityType,
      storageKey,
      state,
      fields,
      meta,
      generatedAt,
      identity: {
        studentName: state.studentName,
        studentAge: state.studentAge,
        studentId: state.studentId,
        groupId: state.groupId
      }
    };
    if (activityType === "poster") return buildPosterReview(base);
    return buildScienceReview(base);
  }

  function readState(storageKey) {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null") || {};
    } catch (error) {
      return {};
    }
  }

  function buildScienceReview(base) {
    const builders = {
      memory: buildMemoryContent,
      nback: buildNbackContent,
      interference: buildInterferenceContent,
      strategies: buildStrategiesContent
    };
    return Object.assign(base, builders[base.activityType](base.state, base.fields));
  }

  function buildMemoryContent(state, fields) {
    const summary = summarizeBy(state.records || [], "subject", (records) => {
      const capacities = records.map((record) => number(record.finalCapacity)).filter((value) => value > 0);
      const average = capacities.length ? round(avg(capacities), 1) : 0;
      return { value: average, label: average ? `${average} 个` : "暂未填写" };
    });
    const overall = fields.conclusionCapacity || averageFromSummary(summary);
    return {
      steps: [
        ["提出问题", fields.question],
        ["作出假设", fields.hypothesis],
        ["制定计划", `方法：${safe(fields.method)}；材料：${safe(fields.material)}；长度范围：${safe(fields.startLength)}-${safe(fields.maxLength)}`],
        ["搜集证据", `已记录 ${count(state.records)} 条记忆任务数据。`],
        ["处理信息", fields.brainFinding],
        ["得出结论", fields.finalConclusion]
      ],
      resultTitle: "短时记忆容量结果",
      chartRows: summary.length ? summary.map((item) => ({ label: item.name, value: item.value, text: item.label })) : [],
      resultHighlight: overall ? `我的短时记忆容量：约 ${overall} 个信息单位` : "",
      evidence: [
        ["研究问题", fields.question],
        ["研究假设", fields.hypothesis],
        ["实验计划", `采用${safe(fields.method)}，材料为${safe(fields.material)}，每位参与者测量${safe(fields.trialsPerParticipant)}次。`],
        ["头环观察记录", fields.brainFinding]
      ],
      conclusion: joinText([fields.finalConclusion, fields.designImprove, fields.teamwork, fields.inquiryReflection])
    };
  }

  function buildNbackContent(state, fields) {
    const summary = summarizeBy(state.testRuns || [], "condition", (records) => {
      const accuracy = records.map((record) => number(record.accuracy)).filter((value) => value >= 0);
      const average = accuracy.length ? Math.round(avg(accuracy)) : 0;
      return { value: average, label: average ? `${average}%` : "暂未填写" };
    });
    return {
      steps: [
        ["提出问题", fields.researchQuestion],
        ["作出假设", fields.hypothesis],
        ["制定计划", `自变量：${safe(fields.independentVariable)}；材料：${safe(fields.stimulusMaterial)}；设计：${safe(fields.experimentDesign)}`],
        ["搜集证据", `已记录 ${count(state.testRuns)} 条 N-back 测试数据。`],
        ["处理信息", fields.headbandObservation],
        ["得出结论", fields.conclusion]
      ],
      resultTitle: "N-back 正确率结果",
      chartRows: summary.length ? summary.map((item) => ({ label: item.name, value: item.value, text: item.label })) : [],
      resultHighlight: `假设判断：${safe(fields.conclusionSupported)}`,
      evidence: [
        ["研究问题", fields.researchQuestion],
        ["研究假设", fields.hypothesis],
        ["N-back 条件设计", `刺激材料：${safe(fields.stimulusMaterial)}；刺激间隔：${safe(fields.stimulusInterval)} 秒。`],
        ["头环观察记录", fields.headbandObservation]
      ],
      conclusion: joinText([fields.conclusion, fields.improvement, fields.persuasiveness])
    };
  }

  function buildInterferenceContent(state, fields) {
    const summary = summarizeBy(state.records || [], "condition", (records) => {
      const accuracy = records.map((record) => number(record.accuracy)).filter((value) => value >= 0);
      const average = accuracy.length ? Math.round(avg(accuracy)) : 0;
      return { value: average, label: average ? `${average}%` : "暂未填写" };
    });
    return {
      steps: [
        ["提出问题", fields.question || fields.questionFactor],
        ["作出假设", fields.hypothesis],
        ["制定计划", `探究因素：${safe(fields.factor)}；难度：${safe(fields.difficulty)}；记忆时间：${safe(fields.memorySeconds)} 秒。`],
        ["搜集证据", `已记录 ${count(state.records)} 条长时记忆干扰数据。`],
        ["处理信息", fields.headband],
        ["得出结论", fields.conclusion]
      ],
      resultTitle: "不同干扰条件下的记忆结果",
      chartRows: summary.length ? summary.map((item) => ({ label: item.name, value: item.value, text: item.label })) : [],
      resultHighlight: `最可能影响长时记忆的因素：${safe(fields.factor)}`,
      evidence: [
        ["研究问题", fields.question || fields.questionFactor],
        ["研究假设", fields.hypothesis],
        ["干扰因素选择", fields.factor],
        ["头环观察记录", fields.headband]
      ],
      conclusion: joinText([fields.conclusion, fields.strengths, fields.improvements, fields.learningInsight])
    };
  }

  function buildStrategiesContent(state, fields) {
    const summary = summarizeBy(state.records || [], "strategy", (records) => {
      const accuracy = records.map((record) => number(record.accuracy)).filter((value) => value >= 0);
      const average = accuracy.length ? Math.round(avg(accuracy)) : 0;
      return { value: average, label: average ? `${average}%` : "暂未填写" };
    });
    return {
      steps: [
        ["提出问题", fields.question],
        ["作出假设", joinText([fields.hypothesis1, fields.hypothesis2])],
        ["制定计划", `策略：${safe(fields.strategy1)}、${safe(fields.strategy2)}；材料：${safe(fields.materialType)}。`],
        ["搜集证据", `已记录 ${count(state.records)} 条记忆策略数据。`],
        ["处理信息", fields.headband],
        ["得出结论", fields.conclusion]
      ],
      resultTitle: "不同策略下的记忆表现",
      chartRows: summary.length ? summary.map((item) => ({ label: item.name, value: item.value, text: item.label })) : [],
      resultHighlight: `重点比较策略：${safe(fields.strategy1)}、${safe(fields.strategy2)}`,
      evidence: [
        ["研究问题", fields.question],
        ["研究假设", joinText([fields.hypothesis1, fields.hypothesis2])],
        ["所选记忆策略", `${safe(fields.strategy1)}；${safe(fields.strategy2)}`],
        ["头环观察记录", fields.headband]
      ],
      conclusion: joinText([fields.conclusion, fields.designImprove, fields.surprise, fields.applicability])
    };
  }

  function buildPosterReview(base) {
    const fields = base.fields;
    const validQuestions = (base.state.questions || []).filter((item) => hasText(item.question) || hasText(item.answer));
    const qaRecords = Array.isArray(base.state.qaRecords) && base.state.qaRecords.length
      ? base.state.qaRecords
      : [{ question: fields.askedQuestions || "", answer: fields.answers || "" }];
    const qaText = qaRecords.map((item, index) => [
      `问题${index + 1}：${safe(item.question)}`,
      `回答${index + 1}：${safe(item.answer)}`
    ].join("\n")).join("\n");
    return Object.assign(base, {
      steps: [
        ["初步方案", fields.researchPlan],
        ["研究问题", fields.researchQuestion],
        ["研究假设", fields.hypothesis],
        ["制作记录", joinText([fields.layoutSketch, fields.visualPlan])],
        ["分享交流", joinText([fields.speakingPoints, qaText])],
        ["总结反思", joinText([fields.reflectionGain, fields.reflectionImprove, fields.teamReflection, fields.nextUse])]
      ],
      resultTitle: "作品回顾",
      chartRows: [],
      resultHighlight: `数据呈现方式：${safe(fields.dataDisplay)}；主要图表类型：${safe(fields.chartPlan)}`,
      evidence: [
        ["研究问题", fields.researchQuestion],
        ["研究假设", fields.hypothesis],
        ["研究计划", fields.researchPlan],
        ["研究结论", fields.conclusion],
        ["海报制作记录", fields.layoutSketch],
        ["AI 辅助建议记录", fields.aiSupport],
        ["分享交流记录", joinText([fields.presenter, fields.presenterStudentId, fields.speakingPoints, qaText])],
        ["提问交流记录", validQuestions.map((item) => `${safe(item.group)}：${safe(item.question)} / ${safe(item.answer)}`).join("\n")]
      ],
      conclusion: joinText([fields.reflectionGain, fields.reflectionImprove, fields.teamReflection, fields.nextUse])
    });
  }

  function renderReviewPage(reviewData) {
    if (!root) return;
    const html = reviewData.meta.type === "poster" ? renderPosterReport(reviewData) : renderScienceReport(reviewData);
    root.innerHTML = html;
  }

  function renderScienceReport(data) {
    return renderReportShell(data, "实验结果", renderResultSection(data));
  }

  function renderPosterReport(data) {
    return renderReportShell(data, "作品回顾", renderResultSection(data));
  }

  function renderReportShell(data, resultLabel, resultHtml) {
    return `
      <article class="report-sheet">
        ${renderHeader(data)}
        <section>
          <h2 class="section-label">档案信息</h2>
          <div class="archive-grid">
            ${renderIdentity(data)}
            <div class="info-card activity-card">
              <small>参与活动</small>
              <h2>${esc(data.meta.caseNo)}：${esc(data.meta.caseTitle)}</h2>
              <p>${esc(data.meta.activityName)}</p>
            </div>
          </div>
        </section>
        <section>
          <h2 class="section-label">探究历程</h2>
          ${renderTimeline(data.steps)}
        </section>
        <section>
          <h2 class="section-label">${esc(resultLabel)}</h2>
          ${resultHtml}
        </section>
        <section>
          <h2 class="section-label">${data.meta.type === "poster" ? "我的活动收获" : "我的科学结论"}</h2>
          <div class="conclusion-card"><span class="stamp">${data.meta.type === "poster" ? "创作完成" : "探究完成"}</span><p>${esc(safe(data.conclusion))}</p></div>
        </section>
        <section>
          <h2 class="section-label">学习足迹</h2>
          ${renderFootprints(data)}
        </section>
        <footer class="footer-note">
          <p>由 ZJU BIElab 制作&nbsp;&nbsp;揭秘大脑密码，塑造无限可能</p>
          <div class="quote-note">每一次探究，都是一次发现</div>
        </footer>
      </article>
    `;
  }

  function renderHeader(data) {
    return `
      <header class="report-header">
        <div class="photo-card">
          <div class="brain-plate">${brainSvg()}</div>
          <span class="case-stamp">CASE FILE</span>
        </div>
        <div class="report-title">
          <span class="brand-strip">记忆侦探社</span>
          <h1>记忆侦探报告</h1>
          <p>我的科学探究档案</p>
        </div>
        <aside class="meta-slip">
          <p><span>报告生成时间</span><strong>${esc(data.generatedAt)}</strong></p>
          <p><span>探索编号</span><strong>${esc(createCaseId(data))}</strong></p>
        </aside>
      </header>
    `;
  }

  function renderIdentity(data) {
    const info = data.identity;
    return `
      <div class="info-card">
        <div class="info-item"><span>学生姓名</span><strong>${esc(safe(info.studentName))}</strong></div>
        <div class="info-item"><span>学生年龄</span><strong>${esc(safe(info.studentAge))}</strong></div>
        <div class="info-item"><span>学生编号</span><strong>${esc(safe(info.studentId))}</strong></div>
        <div class="info-item"><span>小组编号</span><strong>${esc(safe(info.groupId))}</strong></div>
      </div>
    `;
  }

  function renderTimeline(steps) {
    return `<div class="timeline">${steps.map((step, index) => `
      <article class="timeline-item">
        <span class="timeline-index">${index + 1}</span>
        <h3>${esc(step[0])}</h3>
        <p>${esc(safe(step[1]))}</p>
      </article>
    `).join("")}</div>`;
  }

  function renderResultSection(data) {
    return `
      <div class="result-grid">
        <div class="result-card">
          <h3>${esc(data.resultTitle)}</h3>
          ${data.chartRows.length ? renderBarChart(data.chartRows) : `<p>${esc(safe(data.resultHighlight))}</p>`}
          <div class="result-highlight">${esc(safe(data.resultHighlight))}</div>
        </div>
        <div class="result-card">
          <h3>${data.meta.type === "poster" ? "关键作品证据" : "关键探究证据"}</h3>
          <div class="evidence-list">
            ${(data.evidence || []).map((item) => `<div class="evidence-card"><span>${esc(item[0])}</span><strong>${esc(safe(item[1]))}</strong></div>`).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderBarChart(rows) {
    const maxValue = Math.max(100, ...rows.map((row) => number(row.value)));
    return `<div class="bar-chart">${rows.slice(0, 8).map((row) => {
      const width = Math.max(4, Math.round((number(row.value) / maxValue) * 100));
      return `<div class="bar-row"><span>${esc(row.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><strong>${esc(row.text)}</strong></div>`;
    }).join("")}</div>`;
  }

  function renderFootprints(data) {
    const state = data.state || {};
    const fields = data.fields || {};
    const hasRecords = count(state.records) + count(state.testRuns) > 0;
    const hasHeadband = hasText(fields.brainFinding) || hasText(fields.headbandObservation) || hasText(fields.headband);
    const items = [
      ["01", "完成了探究步骤"],
      ["02", hasRecords ? "记录了实验数据" : "整理了活动记录"],
      ["03", "绘制了结果图表"],
      ["04", hasHeadband ? "观察了头环数据" : "梳理了关键证据"],
      ["05", "形成了科学结论"],
      ["06", "进行了交流反思"]
    ];
    return `<div class="footprints">${items.map((item) => `<div class="footprint-card"><strong>${item[0]}</strong><span>${esc(item[1])}</span></div>`).join("")}</div>`;
  }

  function summarizeBy(records, key, project) {
    const groups = new Map();
    records.forEach((record) => {
      const name = safe(record[key] || record.nLevel || record.condition || record.strategy || record.participant);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(record);
    });
    return Array.from(groups.entries()).map(([name, items]) => Object.assign({ name }, project(items)));
  }

  function averageFromSummary(summary) {
    const values = summary.map((item) => number(item.value)).filter((value) => value > 0);
    return values.length ? round(avg(values), 1) : "";
  }

  function createCaseId(data) {
    const id = safe(data.identity.studentId).replace(/\s+/g, "") || "NOID";
    const date = new Date();
    const y = String(date.getFullYear()).slice(2);
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${data.activityType.toUpperCase()}-${y}${m}${d}-${id}`;
  }

  function brainSvg() {
    return '<svg viewBox="0 0 180 140" aria-hidden="true"><path d="M54 92c-18-4-28-17-26-34 2-16 15-25 28-24 7-15 30-17 41-6 13-10 35-2 38 14 18 4 25 21 18 36-6 13-19 18-33 15-11 14-33 15-45 2-7 2-14 1-21-3Z" fill="none" stroke="#35a9ff" stroke-width="6" stroke-linejoin="round"/><path d="M62 39c-6 12 5 19 19 17m16-29c-8 17 4 25 18 23m-65 24c16-7 28-4 36 10m10-29c16 1 25 11 25 27m-42-20c-2 18 8 29 24 34" fill="none" stroke="#7fe3ff" stroke-width="4" stroke-linecap="round"/><circle cx="135" cy="43" r="6" fill="#f4c45d"/><circle cx="39" cy="74" r="5" fill="#f4c45d"/></svg>';
  }

  function safe(value) {
    if (value === null || value === undefined || value === "") return "暂未填写";
    return String(value);
  }

  function hasText(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function joinText(items) {
    return items.filter(hasText).join("\n") || "暂未填写";
  }

  function count(items) {
    return Array.isArray(items) ? items.length : 0;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function avg(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function round(value, digits) {
    const factor = Math.pow(10, digits || 0);
    return Math.round(value * factor) / factor;
  }

  function esc(value) {
    return safe(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  window.buildReviewData = buildReviewData;
  window.renderReviewPage = renderReviewPage;
  window.renderScienceReport = renderScienceReport;
  window.renderPosterReport = renderPosterReport;
})();
