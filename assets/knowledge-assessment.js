(function (global) {
  "use strict";

  const SCHEMA_VERSION = 2;
  const QUESTION_SET_VERSION = "knowledge-v2-2026-08";
  const STORAGE_KEY = "knowledge-assessment-v2";
  const STAGES = Object.freeze(["T0", "T1", "T2", "T3", "T4", "T5"]);
  const VALID_ANSWERS = new Set(["A", "B", "C", "D"]);

  function clone(value) {
    return value == null ? value : structuredClone(value);
  }

  function emptyTimeline() {
    return { schemaVersion: SCHEMA_VERSION, T0: null, T1: null, T2: null, T3: null, T4: null, T5: null };
  }

  function normalizeRecord(value, stage) {
    if (!value || typeof value !== "object" || value.stage !== stage) return null;
    const totalCount = Number(value.totalCount) || 0;
    const correctCount = Number(value.correctCount) || 0;
    const score = Number(value.score);
    if (!value.assessmentId || !value.timestamp || !totalCount || !Number.isFinite(score)) return null;
    return {
      stage,
      assessmentId: String(value.assessmentId),
      questionSetVersion: String(value.questionSetVersion || QUESTION_SET_VERSION),
      questionOrder: Array.isArray(value.questionOrder) ? value.questionOrder.map(String) : [],
      answers: Object.fromEntries(Object.entries(value.answers || {}).filter(([, answer]) => VALID_ANSWERS.has(String(answer))).map(([id, answer]) => [String(id), String(answer)])),
      score,
      correctCount,
      totalCount,
      categoryScores: value.categoryScores && typeof value.categoryScores === "object" ? clone(value.categoryScores) : {},
      timestamp: String(value.timestamp)
    };
  }

  function normalizeTimeline(value) {
    const source = value && typeof value === "object" ? value : {};
    const result = emptyTimeline();
    STAGES.forEach((stage) => { result[stage] = normalizeRecord(source[stage], stage); });
    return result;
  }

  function mergeTimelines() {
    const result = emptyTimeline();
    Array.from(arguments).forEach((value) => {
      const source = normalizeTimeline(value);
      STAGES.forEach((stage) => {
        if (!result[stage] && source[stage]) result[stage] = source[stage];
      });
    });
    return result;
  }

  function scopedStorageKey() {
    const platform = global.BrainPlatform;
    return platform && platform.storage && typeof platform.storage.scopedKey === "function"
      ? platform.storage.scopedKey(STORAGE_KEY)
      : STORAGE_KEY;
  }

  function readTimeline() {
    try {
      return normalizeTimeline(JSON.parse(global.localStorage.getItem(scopedStorageKey()) || "null"));
    } catch (error) {
      return emptyTimeline();
    }
  }

  function writeTimeline(value) {
    const timeline = mergeTimelines(readTimeline(), value);
    global.localStorage.setItem(scopedStorageKey(), JSON.stringify(timeline));
    return timeline;
  }

  function shuffle(ids) {
    const result = ids.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const values = new Uint32Array(1);
      if (global.crypto && typeof global.crypto.getRandomValues === "function") global.crypto.getRandomValues(values);
      else values[0] = Math.floor(Math.random() * 0xffffffff);
      const target = values[0] % (index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function createDraft(stage, questions, randomize) {
    return {
      stage,
      questionSetVersion: QUESTION_SET_VERSION,
      questionOrder: randomize ? shuffle(questions.map((item) => item.id)) : questions.map((item) => item.id),
      answers: {},
      currentPage: 0
    };
  }

  function normalizeDraft(value, stage, questions, randomize) {
    const source = value && typeof value === "object" ? value : {};
    const validIds = new Set(questions.map((item) => item.id));
    const incomingOrder = Array.isArray(source.questionOrder) ? source.questionOrder.filter((id) => validIds.has(id)) : [];
    const draft = createDraft(stage, questions, randomize);
    if (incomingOrder.length === questions.length && new Set(incomingOrder).size === questions.length) draft.questionOrder = incomingOrder;
    Object.entries(source.answers || {}).forEach(([id, answer]) => {
      if (validIds.has(id) && VALID_ANSWERS.has(String(answer))) draft.answers[id] = String(answer);
    });
    draft.currentPage = Math.max(0, Number(source.currentPage) || 0);
    return draft;
  }

  function scoreQuestions(questions, answers) {
    let correctCount = 0;
    const categoryTotals = {};
    questions.forEach((item) => {
      const category = item.category || "";
      if (category) {
        if (!categoryTotals[category]) categoryTotals[category] = { correctCount: 0, totalCount: 0, score: 0 };
        categoryTotals[category].totalCount += 1;
      }
      if (String(answers[item.id] || "") === item.answer) {
        correctCount += 1;
        if (category) categoryTotals[category].correctCount += 1;
      }
    });
    Object.values(categoryTotals).forEach((summary) => {
      summary.score = summary.totalCount ? Math.round((summary.correctCount / summary.totalCount) * 100) : 0;
    });
    return {
      score: questions.length ? Math.round((correctCount / questions.length) * 100) : 0,
      correctCount,
      totalCount: questions.length,
      categoryScores: categoryTotals
    };
  }

  function submitStage(timelineValue, stage, questions, draftValue) {
    if (!STAGES.includes(stage)) throw new Error("Invalid assessment stage.");
    const timeline = mergeTimelines(timelineValue, readTimeline());
    if (timeline[stage]) return { timeline, record: timeline[stage], existing: true };
    const draft = normalizeDraft(draftValue, stage, questions, stage === "T0" || stage === "T5");
    const unanswered = draft.questionOrder.filter((id) => !draft.answers[id]);
    if (unanswered.length) return { timeline, record: null, unanswered };
    const summary = scoreQuestions(questions, draft.answers);
    const session = global.BrainPlatform?.identity?.readStudentSession?.() || {};
    const timestamp = new Date().toISOString();
    const record = {
      stage,
      assessmentId: [stage, QUESTION_SET_VERSION, session.studentId || "guest"].join("|"),
      questionSetVersion: QUESTION_SET_VERSION,
      questionOrder: draft.questionOrder.slice(),
      answers: { ...draft.answers },
      score: summary.score,
      correctCount: summary.correctCount,
      totalCount: summary.totalCount,
      categoryScores: summary.categoryScores,
      timestamp
    };
    timeline[stage] = record;
    return { timeline: writeTimeline(timeline), record, existing: false, unanswered: [] };
  }

  function getQuestion(questions, id) {
    return questions.find((item) => item.id === id) || null;
  }

  global.BrainKnowledgeAssessment = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    questionSetVersion: QUESTION_SET_VERSION,
    stages: STAGES,
    emptyTimeline,
    normalizeTimeline,
    mergeTimelines,
    readTimeline,
    writeTimeline,
    createDraft,
    normalizeDraft,
    scoreQuestions,
    submitStage,
    getQuestion
  });
})(window);
