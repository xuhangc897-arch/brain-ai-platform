"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");
const https = require("https");
const answers = require("./question-answers");

const EXPERIMENTS = Object.freeze({
  memory: { order: 1, label: "记忆容量实验" },
  nback: { order: 2, label: "N-back工作记忆实验" },
  interference: { order: 3, label: "长时记忆干扰实验" },
  strategies: { order: 4, label: "长时记忆策略实验" }
});
const STAGES = new Set(["question", "hypothesis", "plan", "evidence", "analysis", "conclusion", "reflection", "posttest"]);
const SUMMARY_CODES = new Set([
  "FORM_QUESTION", "DESIGN_INQUIRY", "COMPARE_RESULTS", "USE_EVIDENCE",
  "FORM_CONCLUSION", "REFLECT_REVISE", "EXPRESS_IDEAS", "INPUT_SUPPORT"
]);
const SUPPORT_TYPES = new Set(["question_prompt", "evidence_prompt", "comparison_prompt", "reflection_prompt", "voice_optional"]);
const MODEL = "deepseek-v4-flash";
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const recordsCollection = db.collection("experimentRecords");
const submissionsCollection = db.collection("experiment_submissions");
const learningCollection = db.collection("learning_records");
const interventionsCollection = db.collection("agent_interventions");
const memoriesCollection = db.collection("student_memories");
const studentsCollection = db.collection("students");

function parsePayload(event) {
  if (event && typeof event.body === "string") {
    try { return JSON.parse(event.body); } catch (error) { return {}; }
  }
  return event && event.body && typeof event.body === "object" ? event.body : (event || {});
}

function header(event, name) {
  const headers = event && event.headers && typeof event.headers === "object" ? event.headers : {};
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] || "") : "";
}

function decode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

function verifySession(event) {
  const token = header(event, "authorization").replace(/^Bearer\s+/i, "").trim();
  const secret = String(process.env.STUDENT_SESSION_SECRET || "");
  const parts = token.split(".");
  if (!token || secret.length < 32 || parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let signature;
  try { signature = decode(parts[1]); } catch (error) { return null; }
  if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) return null;
  let payload;
  try { payload = JSON.parse(decode(parts[0]).toString("utf8")); } catch (error) { return null; }
  if (payload.version !== 1 || !payload.studentId || Number(payload.expiresAt) <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function clean(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function hash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function memoryId(studentId, type, experimentId) {
  return `memory_${hash([studentId, type, experimentId || "overall"].join("|"))}`;
}

function recordData(record) {
  return record && (record.payload || record.data) || {};
}

function fullState(record) {
  if (record && record.experimentResults && typeof record.experimentResults === "object") {
    const quiz = record.knowledgeQuiz || {};
    const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : [];
    const last = attempts[attempts.length - 1] || {};
    return Object.assign({}, record.experimentResults, {
      fields: record.answers || {},
      surveys: { postMeta: record.surveys && record.surveys.meta || {}, cognitiveLoad: record.surveys && record.surveys.cognitiveLoad || {}, inquiryParticipation: record.surveys && record.surveys.inquiryParticipation || {} },
      knowledgeQuiz: Object.assign({}, quiz, { history: attempts.map((item) => Object.assign({}, item, { submittedAt: item.timestamp || item.submittedAt || "" })), submitted: attempts.length > 0, score: quiz.finalScore, correctCount: last.correctCount || 0, submittedAt: last.timestamp || "" })
    });
  }
  const data = recordData(record);
  return data.fullState && typeof data.fullState === "object" ? data.fullState : {};
}

async function latestSubmission(studentId, experimentId) {
  const current = await submissionsCollection.where({ studentId, experimentId }).orderBy("uploadedAt", "desc").limit(1).get();
  if (Array.isArray(current.data) && current.data[0]) return current.data[0];
  const result = await recordsCollection
    .where({ studentId, module: experimentId, recordType: "submission" })
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

async function latestScreening(studentId) {
  const result = await recordsCollection
    .where({ studentId, module: "screening", recordType: "submission" })
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

async function readDocument(id) {
  try {
    const result = await memoriesCollection.doc(id).get();
    return Array.isArray(result.data) ? result.data[0] || null : null;
  } catch (error) {
    const code = error && (error.code || error.errCode);
    if (code === "DATABASE_DOCUMENT_NOT_EXIST" || code === -502005) return null;
    throw error;
  }
}

function surveyComplete(state) {
  const surveys = state.surveys || {};
  const requiredCounts = { postMeta: 6, cognitiveLoad: 2, inquiryParticipation: 9 };
  return Object.entries(requiredCounts).every(([key, requiredCount]) => {
    const answers = surveys[key] || {};
    return Object.keys(answers).length >= requiredCount && Object.values(answers).every((value) => Number(value) > 0);
  });
}

function completionFacts(state) {
  const unlocked = Math.max(0, Math.min(7, Number(state.maxUnlockedStep) || 0));
  const completedStages = Array.from(STAGES).slice(0, unlocked);
  const posttestComplete = surveyComplete(state);
  if (posttestComplete) completedStages.push("posttest");
  const unique = Array.from(new Set(completedStages));
  return {
    totalTaskCount: 8,
    completedTaskCount: unique.length,
    unfinishedStageIds: Array.from(STAGES).filter((stageId) => !unique.includes(stageId)),
    posttestSurveyComplete: posttestComplete,
    posttestKnowledgeComplete: Boolean(state.knowledgeQuiz && state.knowledgeQuiz.submitted)
  };
}

function aggregate(records, keyField) {
  const groups = {};
  records.forEach((record) => {
    const key = clean(record[keyField] || record.condition || record.n || "overall", 80);
    if (!groups[key]) groups[key] = { key, count: 0, accuracyTotal: 0, scoreTotal: 0, reactionTotal: 0 };
    const group = groups[key];
    group.count += 1;
    group.accuracyTotal += Number(record.accuracy) || 0;
    group.scoreTotal += Number(record.score ?? record.correctCount) || 0;
    group.reactionTotal += Number(record.reactionTime ?? record.avgRt) || 0;
  });
  return Object.values(groups).map((group) => ({
    key: group.key,
    count: group.count,
    averageAccuracy: Number((group.accuracyTotal / group.count).toFixed(2)),
    averageScore: Number((group.scoreTotal / group.count).toFixed(2)),
    averageReactionTimeMs: Math.round(group.reactionTotal / group.count)
  }));
}

function performanceFacts(experimentId, state) {
  const records = Array.isArray(state.records) ? state.records : Array.isArray(state.testRuns) ? state.testRuns : [];
  if (experimentId === "memory") return aggregate(records, "direction");
  if (experimentId === "nback") return aggregate(records, "n");
  if (experimentId === "interference") return aggregate(records, "condition");
  const strategyRecords = records.concat(Array.isArray(state.strategyScores) ? state.strategyScores : []);
  return aggregate(strategyRecords, "strategy");
}

function quizSummary(state) {
  const history = state.knowledgeQuiz && Array.isArray(state.knowledgeQuiz.history) ? state.knowledgeQuiz.history : [];
  const first = history[0] || null;
  const last = history[history.length - 1] || null;
  const highest = history.reduce((best, item) => !best || Number(item.score) > Number(best.score) ? item : best, null);
  return {
    available: Boolean(history.length),
    firstScore: first ? Number(first.score) || 0 : null,
    latestScore: last ? Number(last.score) || 0 : null,
    highestScore: highest ? Number(highest.score) || 0 : null,
    submissionCount: history.length
  };
}

function scorePretest(screening, experimentId) {
  const state = screening ? fullState(screening) : {};
  const pretest = state.knowledgePretest || {};
  const source = pretest.answersByQuestionId || {};
  const answerKey = answers[experimentId];
  if (!pretest.submitted || !answerKey) return { available: false, score: null, correctCount: null };
  let correctCount = 0;
  answerKey.forEach((answer, index) => {
    if (String(source[`${experimentId}_q${index + 1}`] || "") === answer) correctCount += 1;
  });
  return { available: true, score: correctCount * 10, correctCount };
}

function interventionFacts(records) {
  return records.reduce((facts, record) => {
    if (record.interventionType === "task_relevance") {
      facts.relevancePromptCount += Number(record.promptCount) || 0;
      if (record.modifiedAfterPrompt) facts.modificationCount += 1;
      if (record.returnedToModify) facts.acceptedReminderCount += 1;
    }
    if (record.interventionType === "suggest_voice_input" && record.studentResponse === "accepted") {
      facts.acceptedReminderCount += 1;
    }
    return facts;
  }, { relevancePromptCount: 0, modificationCount: 0, acceptedReminderCount: 0 });
}

function buildFacts(experimentId, state, learning, interventions, screening, submission) {
  const completion = completionFacts(state);
  const pretest = scorePretest(screening, experimentId);
  const posttest = quizSummary(state);
  return {
    completion,
    performance: performanceFacts(experimentId, state),
    knowledge: {
      pretest,
      posttest,
      changeFromPretest: pretest.available && posttest.available ? posttest.latestScore - pretest.score : null
    },
    input: {
      typingDurationMs: learning.reduce((sum, record) => sum + (Number(record.typingDurationMs) || 0), 0),
      activeTypingDurationMs: learning.reduce((sum, record) => sum + (Number(record.activeTypingDurationMs) || 0), 0),
      aiUsageTaskCount: learning.filter((record) => record.aiUsed).length,
      voiceUsageTaskCount: learning.filter((record) => record.voiceUsed).length
    },
    interventions: interventionFacts(interventions),
    submittedAt: submission.uploadedAt || submission.timestamps?.receivedAt || recordData(submission).createdAt || submission.createdAt || ""
  };
}

function textSamples(learning) {
  const preferred = ["question", "hypothesis", "analysis", "conclusion", "reflection"];
  let total = 0;
  const samples = [];
  preferred.forEach((stageId) => {
    const record = learning.find((item) => item.stageId === stageId && clean(item.inputText));
    if (!record || total >= 4000) return;
    const value = clean(record.inputText, Math.min(800, 4000 - total));
    total += Array.from(value).length;
    samples.push({ taskId: record.taskId, stageId, text: value });
  });
  return samples;
}

function validEvidenceList(value, allowedTaskIds) {
  if (!Array.isArray(value) || value.length > 5) return null;
  const result = [];
  for (const item of value) {
    if (!item || !SUMMARY_CODES.has(clean(item.code, 64))) return null;
    const evidence = clean(item.evidence, 240);
    const sourceTaskIds = Array.isArray(item.sourceTaskIds) ? item.sourceTaskIds.map((id) => clean(id, 100)).filter(Boolean).slice(0, 5) : [];
    if (!evidence || !sourceTaskIds.length || sourceTaskIds.some((id) => !allowedTaskIds.has(id))) return null;
    result.push({ code: clean(item.code, 64), evidence, sourceTaskIds });
  }
  return result;
}

function validSection(value, allowedTaskIds) {
  if (!value || typeof value !== "object") return null;
  const summary = clean(value.summary, 240);
  const evidence = clean(value.evidence, 240);
  const sourceTaskIds = Array.isArray(value.sourceTaskIds) ? value.sourceTaskIds.map((id) => clean(id, 100)).filter(Boolean).slice(0, 5) : [];
  return summary && evidence && sourceTaskIds.length && sourceTaskIds.every((id) => allowedTaskIds.has(id))
    ? { summary, evidence, sourceTaskIds }
    : null;
}

function validateSummary(value, allowedTaskIds = new Set()) {
  if (!value || typeof value !== "object") return null;
  const strengths = validEvidenceList(value.strengths, allowedTaskIds);
  const needsSupport = validEvidenceList(value.needsSupport, allowedTaskIds);
  const inquiryPerformance = validSection(value.inquiryPerformance, allowedTaskIds);
  const evidenceUse = validSection(value.evidenceUse, allowedTaskIds);
  const reflectionPerformance = validSection(value.reflectionPerformance, allowedTaskIds);
  if (!strengths || !needsSupport || !inquiryPerformance || !evidenceUse || !reflectionPerformance) return null;
  const nextSupport = Array.isArray(value.nextSupport) ? value.nextSupport.slice(0, 4).map((item) => ({
    stageId: clean(item.stageId, 64),
    supportType: clean(item.supportType, 64),
    message: clean(item.message, 240),
    evidenceCodes: Array.isArray(item.evidenceCodes) ? item.evidenceCodes.map((code) => clean(code, 64)).filter((code) => SUMMARY_CODES.has(code)).slice(0, 4) : []
  })) : [];
  if (nextSupport.some((item) => !STAGES.has(item.stageId) || !SUPPORT_TYPES.has(item.supportType) || !item.message || !item.evidenceCodes.length)) return null;
  const changesFromPrevious = Array.isArray(value.changesFromPrevious) ? value.changesFromPrevious.slice(0, 4).map((item) => ({
    code: clean(item.code, 64),
    direction: ["improved", "stable", "needs_support"].includes(item.direction) ? item.direction : "",
    summary: clean(item.summary, 240),
    sourceExperimentIds: Array.isArray(item.sourceExperimentIds) ? item.sourceExperimentIds.map((id) => clean(id, 32)).filter((id) => EXPERIMENTS[id]).slice(0, 4) : []
  })) : [];
  if (changesFromPrevious.some((item) => !SUMMARY_CODES.has(item.code) || !item.direction || !item.summary || !item.sourceExperimentIds.length)) return null;
  return {
    strengths, needsSupport, inquiryPerformance, evidenceUse, reflectionPerformance,
    inputSupport: { summary: clean(value.inputSupport && value.inputSupport.summary, 240), evidenceCodes: (Array.isArray(value.inputSupport && value.inputSupport.evidenceCodes) ? value.inputSupport.evidenceCodes : []).filter((code) => SUMMARY_CODES.has(code)).slice(0, 4) },
    interventionResponse: { summary: clean(value.interventionResponse && value.interventionResponse.summary, 240), evidenceCodes: (Array.isArray(value.interventionResponse && value.interventionResponse.evidenceCodes) ? value.interventionResponse.evidenceCodes : []).filter((code) => SUMMARY_CODES.has(code)).slice(0, 4) },
    nextSupport, changesFromPrevious
  };
}

function callAi(input) {
  return new Promise((resolve, reject) => {
    if (!process.env.OPENAI_API_KEY) return reject(Object.assign(new Error("AI unavailable"), { code: "AI_NOT_CONFIGURED" }));
    const system = [
      "你是中学科学探究学习记录摘要器。只根据给定事实与学生文本生成结构化支持摘要。",
      "不得评价人格，不得使用能力差、不认真等固定标签；不得给标准答案；不得猜测事实。",
      "所有判断必须引用sourceTaskIds。只返回JSON，不要Markdown。",
      "code只能使用FORM_QUESTION、DESIGN_INQUIRY、COMPARE_RESULTS、USE_EVIDENCE、FORM_CONCLUSION、REFLECT_REVISE、EXPRESS_IDEAS、INPUT_SUPPORT。",
      "nextSupport.stageId只能使用question、hypothesis、plan、evidence、analysis、conclusion、reflection、posttest。",
      "supportType只能使用question_prompt、evidence_prompt、comparison_prompt、reflection_prompt、voice_optional。"
    ].join("\n");
    const body = JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1800
    });
    const request = https.request({
      hostname: "api.deepseek.com",
      path: "/chat/completions",
      method: "POST",
      timeout: 20000,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; if (responseBody.length > 200000) request.destroy(); });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(new Error("AI service error"), { code: `AI_HTTP_${response.statusCode}` }));
        try { resolve(JSON.parse(JSON.parse(responseBody).choices[0].message.content)); }
        catch (error) { reject(Object.assign(new Error("AI response invalid"), { code: "AI_INVALID_JSON" })); }
      });
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("AI timeout"), { code: "AI_TIMEOUT" })));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function buildOverall(student, experimentMemories) {
  const sorted = experimentMemories.slice().sort((a, b) => Number(a.experimentOrder) - Number(b.experimentOrder));
  const strengthMap = new Map();
  sorted.forEach((memory) => {
    (memory.summary && memory.summary.strengths || []).forEach((item) => {
      if (!strengthMap.has(item.code)) strengthMap.set(item.code, []);
      strengthMap.get(item.code).push({ experimentId: memory.experimentId, evidence: item.evidence });
    });
  });
  const stableStrengths = Array.from(strengthMap.entries())
    .filter(([, evidence]) => new Set(evidence.map((item) => item.experimentId)).size >= 2)
    .map(([code, evidence]) => ({ code, evidence: evidence.slice(-2) }))
    .slice(0, 5);
  const latest = sorted[sorted.length - 1] || {};
  const totals = sorted.reduce((facts, memory) => {
    const input = memory.objectiveFacts && memory.objectiveFacts.input || {};
    facts.ai += Number(input.aiUsageTaskCount) || 0;
    facts.voice += Number(input.voiceUsageTaskCount) || 0;
    return facts;
  }, { ai: 0, voice: 0 });
  return {
    schemaVersion: 1,
    recordId: memoryId(student.studentId, "overall"),
    memoryType: "overall",
    studentId: student.studentId,
    studentName: clean(student.name, 100),
    className: clean(student.class, 100),
    groupName: clean(student.group, 100),
    completedExperiments: sorted.map((memory) => ({ experimentId: memory.experimentId, completedAt: memory.completedAt })),
    stableStrengths,
    currentNeedsSupport: latest.summary && latest.summary.needsSupport || [],
    preferredSupportMode: totals.voice > 0 ? (totals.ai > 0 ? "mixed_support" : "voice_optional") : "keyboard",
    progressChanges: latest.summary && latest.summary.changesFromPrevious || [],
    nextSupport: (latest.summary && latest.summary.nextSupport || []).map((item) => ({ ...item, sourceExperimentId: latest.experimentId })),
    lastCompletedExperiment: latest.experimentId || "",
    updatedAt: db.serverDate()
  };
}

exports.main = async (event) => {
  const session = verifySession(event);
  if (!session) return { ok: false, code: "UNAUTHORIZED", message: "登录会话无效或已过期。", retryable: false };
  const payload = parsePayload(event);
  const experimentId = clean(payload.experimentId, 32);
  if (!EXPERIMENTS[experimentId]) return { ok: false, code: "INVALID_EXPERIMENT", message: "实验标识无效。", retryable: false };
  const studentId = clean(session.studentId, 100);

  try {
    const studentResult = await studentsCollection.where({ studentId }).limit(1).get();
    const student = Array.isArray(studentResult.data) ? studentResult.data[0] : null;
    if (!student) return { ok: false, code: "STUDENT_NOT_FOUND", message: "学生账号不存在。", retryable: false };
    const submission = await latestSubmission(studentId, experimentId);
    if (!submission) return { ok: false, code: "SUBMISSION_NOT_FOUND", message: "尚未找到实验提交记录。", retryable: true };
    const state = fullState(submission);
    const completion = completionFacts(state);
    if (completion.completedTaskCount < 8) {
      return { ok: false, code: "EXPERIMENT_INCOMPLETE", message: "实验必要环节尚未完成。", retryable: false, completion };
    }
    const [learningResult, interventionResult, screening, existingMemoriesResult] = await Promise.all([
      learningCollection.where({ studentId, experimentId }).limit(100).get(),
      interventionsCollection.where({ studentId, experimentId }).limit(100).get(),
      latestScreening(studentId),
      memoriesCollection.where({ studentId, memoryType: "experiment" }).limit(10).get()
    ]);
    const learning = Array.isArray(learningResult.data) ? learningResult.data : [];
    const interventions = Array.isArray(interventionResult.data) ? interventionResult.data : [];
    const previousMemories = Array.isArray(existingMemoriesResult.data) ? existingMemoriesResult.data : [];
    const facts = buildFacts(experimentId, state, learning, interventions, screening, submission);
    const sourceRecordIds = [submission.recordId, ...learning.map((item) => item.recordId), ...interventions.map((item) => item.recordId)].filter(Boolean).slice(0, 100);
    const sourceFactsHash = hash({ facts, samples: textSamples(learning), sourceRecordIds });
    const id = memoryId(studentId, "experiment", experimentId);
    const existing = await readDocument(id);
    if (existing && existing.sourceFactsHash === sourceFactsHash) {
      return { ok: true, recordId: id, operation: "unchanged", version: existing.version };
    }
    const aiValue = await callAi({
      experiment: { experimentId, name: EXPERIMENTS[experimentId].label, order: EXPERIMENTS[experimentId].order },
      objectiveFacts: facts,
      studentWorkSamples: textSamples(learning),
      previousExperimentMemories: previousMemories.filter((item) => Number(item.experimentOrder) < EXPERIMENTS[experimentId].order).map((item) => ({
        experimentId: item.experimentId,
        strengths: item.summary && item.summary.strengths || [],
        needsSupport: item.summary && item.summary.needsSupport || []
      }))
    });
    const summary = validateSummary(aiValue, new Set(learning.map((item) => clean(item.taskId, 100)).filter(Boolean)));
    if (!summary) return { ok: false, code: "AI_INVALID_STRUCTURE", message: "学习摘要暂时无法生成。", retryable: true };
    const latestBeforeWrite = await latestSubmission(studentId, experimentId);
    if (!latestBeforeWrite || latestBeforeWrite.recordId !== submission.recordId) {
      return { ok: false, code: "STALE_SUBMISSION", message: "检测到更新的实验提交，将重新生成。", retryable: true };
    }
    const document = {
      schemaVersion: 1,
      recordId: id,
      memoryType: "experiment",
      studentId,
      studentName: clean(student.name, 100),
      className: clean(student.class, 100),
      groupName: clean(student.group, 100),
      experimentId,
      experimentOrder: EXPERIMENTS[experimentId].order,
      completedAt: facts.submittedAt,
      objectiveFacts: facts,
      summary,
      sourceRecordIds,
      sourceSubmissionRecordId: submission.recordId,
      sourceFactsHash,
      version: (Number(existing && existing.version) || 0) + 1,
      promptVersion: 1,
      generatedAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    if (existing) await memoriesCollection.doc(id).update(document);
    else {
      document.createdAt = db.serverDate();
      await memoriesCollection.doc(id).set(document);
    }
    const refreshed = previousMemories.filter((item) => item.experimentId !== experimentId).concat(document);
    const overall = buildOverall(student, refreshed);
    const overallExisting = await readDocument(overall.recordId);
    overall.version = (Number(overallExisting && overallExisting.version) || 0) + 1;
    if (overallExisting) await memoriesCollection.doc(overall.recordId).update(overall);
    else {
      overall.createdAt = db.serverDate();
      await memoriesCollection.doc(overall.recordId).set(overall);
    }
    return { ok: true, recordId: id, operation: existing ? "updated" : "created", version: document.version };
  } catch (error) {
    console.error("generateExperimentMemory failed", { code: error.code || error.errCode || "UNKNOWN" });
    return { ok: false, code: error.code || "MEMORY_GENERATION_FAILED", message: "学习记忆暂时未生成，稍后会重试。", retryable: true };
  }
};

exports.__test = Object.freeze({
  completionFacts,
  performanceFacts,
  scorePretest,
  validateSummary,
  buildOverall,
  memoryId
});
