(function (global) {
  "use strict";

  const definitions = [
    {
      id: "memory",
      label: "记忆容量",
      kind: "experiment",
      order: 1,
      caseNo: "案件01",
      caseTitle: "记忆容量调查",
      activityName: "探索短时记忆的容量",
      reportType: "science",
      route: "memory.html",
      storageKey: "memory-capacity-state-v1",
      reportEnabled: true
    },
    {
      id: "nback",
      label: "N-back 工作记忆",
      kind: "experiment",
      order: 2,
      caseNo: "案件02",
      caseTitle: "工作记忆追踪",
      activityName: "探索神奇的 N-back",
      reportType: "science",
      route: "nback.html",
      storageKey: "nback-inquiry-state-v1",
      reportEnabled: true
    },
    {
      id: "interference",
      label: "长时记忆干扰",
      kind: "experiment",
      order: 3,
      caseNo: "案件03",
      caseTitle: "遗忘元凶调查",
      activityName: "探究干扰长时记忆的因素",
      reportType: "science",
      route: "interference.html",
      storageKey: "longterm-interference-state-v1",
      reportEnabled: true
    },
    {
      id: "strategies",
      label: "长时记忆策略",
      kind: "experiment",
      order: 4,
      caseNo: "案件04",
      caseTitle: "记忆策略破解",
      activityName: "改善长时记忆的策略有哪些？",
      reportType: "science",
      route: "strategies.html",
      storageKey: "longterm-strategies-state-v4",
      reportEnabled: true
    },
    {
      id: "poster",
      label: "海报制作",
      kind: "experiment",
      order: 5,
      caseNo: "案件05",
      caseTitle: "科学海报创作档案",
      activityName: "海报制作与分享交流",
      reportType: "poster",
      route: "poster.html",
      storageKey: "poster-making-state-v1",
      reportEnabled: true
    },
    {
      id: "screening",
      label: "资格审查",
      kind: "screening",
      order: 0,
      route: "pretest.html",
      storageKey: "pretestData",
      reportEnabled: false
    },
    {
      id: "aiChat",
      label: "AI 对话合集",
      kind: "service",
      order: 0,
      route: "",
      storageKey: "aiChatLogs",
      reportEnabled: false
    }
  ].map((definition) => Object.freeze(definition));

  const entries = Object.freeze(definitions);
  const entriesById = Object.freeze(Object.fromEntries(
    entries.map((entry) => [entry.id, entry])
  ));
  const moduleIds = Object.freeze(entries.map((entry) => entry.id));
  const experiments = Object.freeze(entries.filter((entry) => entry.kind === "experiment"));

  function get(id) {
    return entriesById[String(id || "")] || null;
  }

  function getReportUrl(id) {
    const entry = get(id);
    if (!entry || !entry.reportEnabled) return "";
    return `review.html?activityType=${encodeURIComponent(entry.id)}`;
  }

  global.BrainExperimentRegistry = Object.freeze({
    version: 1,
    entries,
    experiments,
    moduleIds,
    get,
    getReportUrl
  });
})(window);
