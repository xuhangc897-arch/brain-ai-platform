(function (global) {
  "use strict";

  const platform = global.BrainPlatform;
  const registry = global.BrainExperimentRegistry;
  const SCHEMA_VERSION = 2;
  const MAX_OUTBOX_ENTRIES = 50;
  const acknowledgedSubmissions = new Set();

  function clone(value) {
    return value == null ? value : structuredClone(value);
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function iso(value) {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  function normalizeQuizAttempt(record, index) {
    const totalCount = Number(record && record.totalCount) || 0;
    const correctCount = Number(record && record.correctCount) || 0;
    const score = Number(record && record.score) || 0;
    return {
      attemptNumber: Number(record && record.attemptNumber) || index + 1,
      score,
      answers: clone(record && record.answers || {}),
      correctCount,
      totalCount,
      accuracy: Number(record && record.accuracy) || (totalCount ? Math.round((correctCount / totalCount) * 100) : 0),
      timestamp: iso(record && (record.timestamp || record.submittedAt)),
      wrongQuestions: clone(record && record.wrongQuestions || [])
    };
  }

  function normalizeKnowledgeQuiz(source) {
    const quiz = source && typeof source === "object" ? source : {};
    let attempts = Array.isArray(quiz.attempts) ? quiz.attempts : quiz.history;
    attempts = Array.isArray(attempts) ? attempts.slice(0, 1).map(normalizeQuizAttempt) : [];
    if (!attempts.length && (quiz.submitted || quiz.submittedAt)) {
      attempts.push(normalizeQuizAttempt(quiz, 0));
    }
    const scores = attempts.map((attempt) => Number(attempt.score) || 0);
    return {
      attempts,
      firstScore: scores.length ? scores[0] : null,
      bestScore: scores.length ? Math.max(...scores) : null,
      finalScore: scores.length ? scores[scores.length - 1] : null
    };
  }

  function normalizeSurveys(source) {
    const surveys = source && typeof source === "object" ? source : {};
    const current = surveys.current && typeof surveys.current === "object" ? surveys.current : surveys;
    const metaSource = current.meta || current.postMeta || {};
    const meta = {};
    for (let index = 1; index <= 5; index += 1) {
      if (Object.prototype.hasOwnProperty.call(metaSource, `q${index}`)) meta[`q${index}`] = clone(metaSource[`q${index}`]);
    }
    return {
      meta,
      cognitiveLoad: clone(current.cognitiveLoad || {}),
      inquiryParticipation: clone(current.inquiryParticipation || {})
    };
  }

  function collectReflections(fields) {
    const result = {};
    Object.keys(fields || {}).forEach((key) => {
      if (/(reflection|improve|strength|teamwork|insight|surprise|applicability|persuasiveness)/i.test(key)) {
        result[key] = clone(fields[key]);
      }
    });
    return result;
  }

  function collectExperimentResults(state) {
    const excluded = new Set([
      "studentId", "studentName", "studentAge", "className", "groupName", "groupId", "isGuest",
      "fields", "surveys", "knowledgeQuiz", "knowledgeAssessment", "currentStep", "maxUnlockedStep", "flowVersion", "savedAt", "createdAt"
    ]);
    const results = {};
    Object.keys(state || {}).forEach((key) => {
      if (!excluded.has(key)) results[key] = clone(state[key]);
    });
    return results;
  }

  function countAiUsage(experimentId) {
    const chat = global.BrainAIChat;
    if (!chat || typeof chat.readLogs !== "function") return 0;
    const integration = global.BrainExperimentIntegration;
    return chat.readLogs().filter((log) => {
      const source = log.experimentId || (integration && integration.resolveSourceModule(log.sourceModule, log.path));
      return source === experimentId && !log.failed;
    }).length;
  }

  function buildExperimentSubmission(options) {
    const experimentId = text(options && options.experimentId);
    const experiment = registry && registry.get(experimentId);
    if (!experiment || !["experiment", "screening"].includes(experiment.kind)) throw new Error("Invalid experimentId.");
    const state = options && options.state && typeof options.state === "object" ? options.state : {};
    const session = platform.identity.readStudentSession() || {};
    const submissionTime = iso(options && options.submissionTime);
    const submissionId = text(options && options.submissionId) || [
      experimentId,
      state.studentId || session.studentId || "guest",
      submissionTime
    ].join("|");
    const assessmentApi = global.BrainKnowledgeAssessment;
    const knowledgeAssessment = assessmentApi && typeof assessmentApi.normalizeTimeline === "function"
      ? assessmentApi.normalizeTimeline(state.knowledgeAssessment)
      : clone(state.knowledgeAssessment || null);
    return {
      schemaVersion: SCHEMA_VERSION,
      submissionId,
      clientRecordId: submissionId,
      studentId: text(state.studentId || session.studentId),
      experimentId,
      experimentName: experiment.label,
      submissionTime,
      answers: clone(state.fields || state.answers || {}),
      experimentResults: collectExperimentResults(state),
      knowledgeQuiz: normalizeKnowledgeQuiz(state.knowledgeQuiz),
      knowledgeAssessment,
      surveys: normalizeSurveys(state.surveys),
      reflections: collectReflections(state.fields || {}),
      aiSummary: { usageCount: countAiUsage(experimentId) }
    };
  }

  function outboxKey() {
    return platform.storage.scopedKey(platform.config.storageKeys.submissionOutbox);
  }

  function readOutbox() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(outboxKey()) || "null");
      return parsed && Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch (error) {
      return [];
    }
  }

  function writeOutbox(entries) {
    global.localStorage.setItem(outboxKey(), JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      entries: entries.slice(-MAX_OUTBOX_ENTRIES)
    }));
  }

  function enqueue(submission) {
    const entries = readOutbox();
    if (!entries.some((entry) => entry.submissionId === submission.submissionId)) entries.push(submission);
    writeOutbox(entries);
  }

  function acknowledge(submissionId) {
    writeOutbox(readOutbox().filter((entry) => entry.submissionId !== submissionId));
  }

  function notifyAcknowledged(submission, result) {
    if (!submission || !result || !(result.ok || result.code === "DUPLICATE")) return false;
    const submissionId = text(submission.submissionId);
    if (!submissionId || acknowledgedSubmissions.has(submissionId)) return false;
    acknowledgedSubmissions.add(submissionId);
    if (global.document && typeof global.CustomEvent === "function") {
      global.document.dispatchEvent(new CustomEvent("experiment-submission:acknowledged", {
        detail: {
          experimentId: text(submission.experimentId),
          submissionId,
          recordId: text(result.recordId),
          status: text(result.code || "STORED")
        }
      }));
    }
    return true;
  }

  async function sendSubmission(submission) {
    const session = platform.identity.readStudentSession() || {};
    if (!session.sessionToken || session.isGuest) {
      return { ok: false, code: session.isGuest ? "GUEST" : "UNAUTHORIZED", retryable: !session.isGuest };
    }
    try {
      const response = await global.fetch(platform.config.endpoints.saveExperimentSubmission, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.sessionToken}` },
        body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, submission })
      });
      const result = await response.json().catch(() => ({}));
      if (result.code === "UNAUTHORIZED") result.retryable = true;
      return Object.assign({ ok: response.ok && Boolean(result.ok) }, result);
    } catch (error) {
      return { ok: false, code: "NETWORK_ERROR", retryable: true };
    }
  }

  async function flushExperimentSubmissionOutbox() {
    const entries = readOutbox();
    const results = [];
    for (const submission of entries) {
      const result = await sendSubmission(submission);
      results.push(result);
      if (result.ok || result.code === "DUPLICATE") {
        acknowledge(submission.submissionId);
        notifyAcknowledged(submission, result);
      }
      if (!result.ok && result.retryable === false) acknowledge(submission.submissionId);
    }
    return { ok: results.every((result) => result.ok), results, queued: readOutbox().length };
  }

  async function submitExperimentSubmission(options) {
    const session = platform.identity.readStudentSession() || {};
    const experimentId = text(options && options.experimentId);
    const pending = readOutbox().find((entry) => entry.experimentId === experimentId && entry.studentId === text(session.studentId));
    const submission = pending || buildExperimentSubmission(options);
    if (session.isGuest) return { ok: true, guest: true, submission };
    if (!pending) enqueue(submission);
    const result = await sendSubmission(submission);
    if (result.ok || result.code === "DUPLICATE") {
      acknowledge(submission.submissionId);
      notifyAcknowledged(submission, result);
    } else if (result.retryable === false) acknowledge(submission.submissionId);
    return Object.assign({}, result, {
      submission,
      submissionId: submission.submissionId,
      queued: readOutbox().some((entry) => entry.submissionId === submission.submissionId)
    });
  }

  async function getLatestExperimentSubmission(experimentId, submissionId) {
    const session = platform.identity.readStudentSession() || {};
    if (!session.sessionToken || session.isGuest) return { ok: false, code: "UNAUTHORIZED" };
    const response = await global.fetch(platform.config.endpoints.getLatestExperimentSubmission, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.sessionToken}` },
      body: JSON.stringify({ experimentId: text(experimentId), submissionId: text(submissionId) })
    });
    const result = await response.json().catch(() => ({}));
    return Object.assign({ ok: response.ok && Boolean(result.ok) }, result);
  }

  global.BrainExperimentSubmission = Object.freeze({
    build: buildExperimentSubmission,
    submit: submitExperimentSubmission,
    getLatest: getLatestExperimentSubmission,
    flush: flushExperimentSubmissionOutbox,
    normalizeKnowledgeQuiz,
    normalizeSurveys
  });
  global.submitExperimentSubmission = submitExperimentSubmission;

  if (typeof global.addEventListener === "function") {
    global.addEventListener("online", () => flushExperimentSubmissionOutbox().catch(() => {}));
  }
})(window);
