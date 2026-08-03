"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");
const https = require("https");

const EXPERIMENTS = Object.freeze([
  { id: "memory", order: 1, label: "记忆容量实验" },
  { id: "nback", order: 2, label: "N-back工作记忆实验" },
  { id: "interference", order: 3, label: "长时记忆干扰实验" },
  { id: "strategies", order: 4, label: "长时记忆策略实验" }
]);
const DIMENSION_IDS = Object.freeze([
  "memory_knowledge",
  "scientific_inquiry",
  "evidence_use",
  "metacognitive_regulation",
  "tool_use"
]);
const LEVELS = new Set(["consistent", "developing", "support_recommended", "insufficient_data"]);
const DIRECTIONS = new Set(["improved", "stable", "mixed", "needs_support", "insufficient_data"]);
const MODEL = "deepseek-v4-flash";
const PROMPT_VERSION = 1;
const DISCLAIMER = "本诊断仅基于本平台中的学习过程和任务表现，用于教学支持，不构成心理或医学诊断。";
const BANNED_PHRASES = ["能力差", "不认真", "依赖AI", "依赖 AI", "心理障碍", "医学诊断", "心理诊断", "智力低", "懒惰"];

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const recordsCollection = db.collection("experimentRecords");
const submissionsCollection = db.collection("experiment_submissions");
const learningCollection = db.collection("learning_records");
const interventionsCollection = db.collection("agent_interventions");
const memoriesCollection = db.collection("student_memories");
const diagnosesCollection = db.collection("learning_diagnoses");
const studentsCollection = db.collection("students");

function clean(value, max = 240) {
  return Array.from(String(value == null ? "" : value).trim()).slice(0, max).join("");
}

function parsePayload(event) {
  if (event && typeof event.body === "string") {
    try { return JSON.parse(event.body); } catch (error) { return {}; }
  }
  return event && event.body && typeof event.body === "object" ? event.body : (event || {});
}

function getHeader(event, name) {
  const headers = event && event.headers && typeof event.headers === "object" ? event.headers : {};
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] || "") : "";
}

function decodeBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

function verifyStudentSession(event) {
  const token = getHeader(event, "authorization").replace(/^Bearer\s+/i, "").trim();
  const secret = String(process.env.STUDENT_SESSION_SECRET || "");
  const parts = token.split(".");
  if (!token || secret.length < 32 || parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let actual;
  try { actual = decodeBase64url(parts[1]); } catch (error) { return null; }
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  let payload;
  try { payload = JSON.parse(decodeBase64url(parts[0]).toString("utf8")); } catch (error) { return null; }
  if (payload.version !== 1 || !clean(payload.studentId, 100) || Number(payload.expiresAt) <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function hash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function pointerId(studentId) {
  return `diagnosis_pointer_${hash(studentId)}`;
}

function versionId(studentId, sourceFactsHash) {
  return `diagnosis_${hash(`${studentId}|${sourceFactsHash}`)}`;
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

function surveyComplete(state) {
  const surveys = state.surveys || {};
  const requiredCounts = { postMeta: 6, cognitiveLoad: 2, inquiryParticipation: 9 };
  return Object.entries(requiredCounts).every(([key, count]) => {
    const answers = surveys[key] || {};
    return Object.keys(answers).length >= count && Object.values(answers).every((value) => Number(value) > 0);
  });
}

function completionFacts(state) {
  const unlocked = Math.max(0, Math.min(7, Number(state.maxUnlockedStep) || 0));
  const surveysCompleted = surveyComplete(state);
  return {
    completed: unlocked >= 7 && surveysCompleted,
    completedInquiryStageCount: unlocked,
    surveyComplete: surveysCompleted,
    knowledgeAvailable: Boolean(state.knowledgeQuiz && state.knowledgeQuiz.submitted)
  };
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

async function readDocument(collection, id) {
  try {
    const result = await collection.doc(id).get();
    return Array.isArray(result.data) ? result.data[0] || null : null;
  } catch (error) {
    const code = error && (error.code || error.errCode);
    if (code === "DATABASE_DOCUMENT_NOT_EXIST" || code === -502005) return null;
    throw error;
  }
}

function numericValues(value) {
  return Object.values(value && typeof value === "object" ? value : {})
    .map(Number)
    .filter((number) => Number.isFinite(number) && number > 0);
}

function average(values) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function surveyMetrics(state) {
  const surveys = state.surveys || {};
  const meta = numericValues(surveys.postMeta);
  const load = numericValues(surveys.cognitiveLoad);
  const inquiry = numericValues(surveys.inquiryParticipation);
  return {
    metacognitionAverage: average(meta),
    materialDifficulty: load.length ? load[0] : null,
    mentalEffort: load.length > 1 ? load[1] : null,
    inquiryParticipationAverage: average(inquiry)
  };
}

function learningMetrics(records) {
  return records.reduce((result, record) => {
    result.typingDurationMs += Number(record.typingDurationMs) || 0;
    result.activeTypingDurationMs += Number(record.activeTypingDurationMs) || 0;
    if (record.aiUsed) result.aiUsageTaskCount += 1;
    if (record.voiceUsed) result.voiceUsageTaskCount += 1;
    return result;
  }, { typingDurationMs: 0, activeTypingDurationMs: 0, aiUsageTaskCount: 0, voiceUsageTaskCount: 0 });
}

function interventionMetrics(records) {
  return records.reduce((result, record) => {
    if (record.interventionType === "task_relevance") {
      result.relevancePromptCount += Number(record.promptCount) || 0;
      if (record.modifiedAfterPrompt) result.modificationCount += 1;
      if (record.returnedToModify || record.keptOriginal) result.relevanceResponseCount += 1;
    }
    if (record.interventionType === "suggest_voice_input") {
      result.inputSupportPromptCount += 1;
      if (record.studentResponse === "accepted") result.acceptedInputSupportCount += 1;
    }
    if (record.interventionType === "memory_support") {
      result.memorySupportCount += 1;
      if (record.studentResponse === "accepted") result.acceptedMemorySupportCount += 1;
    }
    return result;
  }, {
    relevancePromptCount: 0,
    relevanceResponseCount: 0,
    modificationCount: 0,
    inputSupportPromptCount: 0,
    acceptedInputSupportCount: 0,
    memorySupportCount: 0,
    acceptedMemorySupportCount: 0
  });
}

function knowledgeMetrics(memory) {
  const knowledge = memory && memory.objectiveFacts && memory.objectiveFacts.knowledge || {};
  const pretest = knowledge.pretest || {};
  const posttest = knowledge.posttest || {};
  return {
    pretestAvailable: Boolean(pretest.available),
    pretestScore: pretest.available ? Number(pretest.score) : null,
    posttestAvailable: Boolean(posttest.available),
    posttestFirstScore: posttest.available ? Number(posttest.firstScore) : null,
    posttestLatestScore: posttest.available ? Number(posttest.latestScore) : null,
    posttestHighestScore: posttest.available ? Number(posttest.highestScore) : null,
    changeFromPretest: Number.isFinite(Number(knowledge.changeFromPretest)) ? Number(knowledge.changeFromPretest) : null
  };
}

function buildObjectiveMetrics(submissions, memories, learningByExperiment, interventionsByExperiment) {
  const experiments = EXPERIMENTS.map((experiment) => {
    const submission = submissions[experiment.id];
    const memory = memories[experiment.id];
    const state = fullState(submission);
    return {
      experimentId: experiment.id,
      experimentName: experiment.label,
      experimentOrder: experiment.order,
      submittedAt: memory.completedAt || submission.uploadedAt || recordData(submission).createdAt || "",
      completion: completionFacts(state),
      performance: memory.objectiveFacts && memory.objectiveFacts.performance || [],
      knowledge: knowledgeMetrics(memory),
      surveys: surveyMetrics(state),
      input: learningMetrics(learningByExperiment[experiment.id] || []),
      interventions: interventionMetrics(interventionsByExperiment[experiment.id] || [])
    };
  });
  const totals = experiments.reduce((result, experiment) => {
    for (const key of Object.keys(result.input)) result.input[key] += Number(experiment.input[key]) || 0;
    for (const key of Object.keys(result.interventions)) result.interventions[key] += Number(experiment.interventions[key]) || 0;
    return result;
  }, {
    input: { typingDurationMs: 0, activeTypingDurationMs: 0, aiUsageTaskCount: 0, voiceUsageTaskCount: 0 },
    interventions: {
      relevancePromptCount: 0,
      relevanceResponseCount: 0,
      modificationCount: 0,
      inputSupportPromptCount: 0,
      acceptedInputSupportCount: 0,
      memorySupportCount: 0,
      acceptedMemorySupportCount: 0
    }
  });
  return { experiments, totals };
}

function containsBannedText(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  return BANNED_PHRASES.some((phrase) => source.includes(phrase));
}

function textArray(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result = value.map((item) => clean(item, maxLength)).filter(Boolean);
  return result.length === value.length ? result : null;
}

function validateEvidence(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const result = [];
  for (const item of value) {
    const summary = clean(item && item.summary, 240);
    const sourceExperimentIds = Array.isArray(item && item.sourceExperimentIds)
      ? Array.from(new Set(item.sourceExperimentIds.map((id) => clean(id, 32)))).slice(0, 4)
      : [];
    if (!summary || !sourceExperimentIds.length || sourceExperimentIds.some((id) => !EXPERIMENTS.some((entry) => entry.id === id))) return null;
    result.push({ summary, sourceExperimentIds });
  }
  return result;
}

function validateDiagnosis(value) {
  if (!value || typeof value !== "object" || containsBannedText(value)) return null;
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== DIMENSION_IDS.length) return null;
  const byId = new Map();
  for (const item of value.dimensions) {
    const dimensionId = clean(item && item.dimensionId, 64);
    if (!DIMENSION_IDS.includes(dimensionId) || byId.has(dimensionId) || !LEVELS.has(item.level)) return null;
    const evidence = validateEvidence(item.evidence);
    const progress = item.progress || {};
    const direction = clean(progress.direction, 32);
    const sourceExperimentIds = Array.isArray(progress.sourceExperimentIds)
      ? Array.from(new Set(progress.sourceExperimentIds.map((id) => clean(id, 32)))).slice(0, 4)
      : [];
    const progressSummary = clean(progress.summary, 240);
    const suggestion = clean(item.suggestion, 240);
    if (!evidence || !DIRECTIONS.has(direction) || !progressSummary || !sourceExperimentIds.length || !suggestion) return null;
    if (sourceExperimentIds.some((id) => !EXPERIMENTS.some((entry) => entry.id === id))) return null;
    byId.set(dimensionId, {
      dimensionId,
      level: item.level,
      evidence,
      progress: { direction, summary: progressSummary, sourceExperimentIds },
      suggestion
    });
  }
  const student = value.studentReport || {};
  const studentReport = {
    strengths: textArray(student.strengths, 3, 240),
    progress: textArray(student.progress, 3, 240),
    growthAreas: textArray(student.growthAreas, 3, 240),
    nextActions: textArray(student.nextActions, 3, 240)
  };
  if (Object.values(studentReport).some((entry) => !entry)) return null;
  const teacher = value.teacherReport || {};
  const teacherReport = {
    completionSummary: clean(teacher.completionSummary, 500),
    processSummary: clean(teacher.processSummary, 500),
    interventionSummary: clean(teacher.interventionSummary, 500),
    toolUsageSummary: clean(teacher.toolUsageSummary, 500),
    changeSummary: clean(teacher.changeSummary, 500),
    recommendations: textArray(teacher.recommendations, 5, 300)
  };
  if (Object.values(teacherReport).some((entry) => !entry || (Array.isArray(entry) && !entry.length))) return null;
  const recommendations = Array.isArray(value.recommendations) ? value.recommendations.slice(0, 3).map((item) => ({
    action: clean(item && item.action, 240),
    rationale: clean(item && item.rationale, 240),
    dimensionIds: Array.isArray(item && item.dimensionIds)
      ? Array.from(new Set(item.dimensionIds.map((id) => clean(id, 64)))).slice(0, 3)
      : []
  })) : [];
  if (!recommendations.length || recommendations.some((item) => (
    !item.action || !item.rationale || !item.dimensionIds.length ||
    item.dimensionIds.some((id) => !DIMENSION_IDS.includes(id))
  ))) return null;
  return {
    dimensions: DIMENSION_IDS.map((id) => byId.get(id)),
    progressSummary: clean(value.progressSummary, 500),
    studentReport,
    teacherReport: { ...teacherReport, disclaimer: DISCLAIMER },
    recommendations
  };
}

function callAi(input) {
  return new Promise((resolve, reject) => {
    if (!process.env.OPENAI_API_KEY) return reject(Object.assign(new Error("AI unavailable"), { code: "AI_NOT_CONFIGURED" }));
    const system = [
      "你是面向5—9年级学生的学习过程诊断摘要器，只能使用输入中的四次实验事实和结构化记忆。",
      "只描述当前学习表现和支持需要，不评价人格，不进行心理或医学诊断，不判断智力。",
      "不得使用“能力差”“不认真”“依赖AI”等固定标签，不得提供标准答案，不得补猜缺失数据。",
      "AI或语音使用次数少不能解释为工具使用能力不足。所有证据和变化必须列出sourceExperimentIds。",
      `dimensions必须且只能依次覆盖：${DIMENSION_IDS.join("、")}。`,
      "level只能为consistent、developing、support_recommended、insufficient_data。",
      "progress.direction只能为improved、stable、mixed、needs_support、insufficient_data。",
      "studentReport.nextActions最多3条，使用友好、清晰、可执行的中文。只返回JSON，不要Markdown。"
    ].join("\n");
    const body = JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 3000
    });
    const request = https.request({
      hostname: "api.deepseek.com",
      path: "/chat/completions",
      method: "POST",
      timeout: 25000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
        if (responseBody.length > 250000) request.destroy();
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(Object.assign(new Error("AI service error"), { code: `AI_HTTP_${response.statusCode}` }));
        }
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

async function readSources(studentId) {
  const [submissionList, memoryResult, learningList, interventionList] = await Promise.all([
    Promise.all(EXPERIMENTS.map(async (experiment) => [experiment.id, await latestSubmission(studentId, experiment.id)])),
    memoriesCollection.where({ studentId, memoryType: "experiment" }).limit(10).get(),
    Promise.all(EXPERIMENTS.map(async (experiment) => {
      const result = await learningCollection.where({ studentId, experimentId: experiment.id }).limit(100).get();
      return [experiment.id, Array.isArray(result.data) ? result.data : []];
    })),
    Promise.all(EXPERIMENTS.map(async (experiment) => {
      const result = await interventionsCollection.where({ studentId, experimentId: experiment.id }).limit(100).get();
      return [experiment.id, Array.isArray(result.data) ? result.data : []];
    }))
  ]);
  const submissions = Object.fromEntries(submissionList);
  const memoryRecords = Array.isArray(memoryResult.data) ? memoryResult.data : [];
  const memories = Object.fromEntries(memoryRecords.map((record) => [record.experimentId, record]));
  return {
    submissions,
    memories,
    learningByExperiment: Object.fromEntries(learningList),
    interventionsByExperiment: Object.fromEntries(interventionList)
  };
}

function evaluateReadiness(sources) {
  const missingExperimentIds = [];
  const incompleteExperimentIds = [];
  const staleMemoryExperimentIds = [];
  for (const experiment of EXPERIMENTS) {
    const submission = sources.submissions[experiment.id];
    if (!submission) {
      missingExperimentIds.push(experiment.id);
      continue;
    }
    if (!completionFacts(fullState(submission)).completed) incompleteExperimentIds.push(experiment.id);
    const memory = sources.memories[experiment.id];
    if (!memory || memory.sourceSubmissionRecordId !== submission.recordId) staleMemoryExperimentIds.push(experiment.id);
  }
  return {
    eligible: missingExperimentIds.length === 0 && incompleteExperimentIds.length === 0,
    generationReady: missingExperimentIds.length === 0 && incompleteExperimentIds.length === 0 && staleMemoryExperimentIds.length === 0,
    missingExperimentIds,
    incompleteExperimentIds,
    staleMemoryExperimentIds
  };
}

function sourceSignature(sources, objectiveMetrics) {
  const sourceMemoryVersions = {};
  const sourceRecordIds = [];
  for (const experiment of EXPERIMENTS) {
    const memory = sources.memories[experiment.id];
    const submission = sources.submissions[experiment.id];
    sourceMemoryVersions[experiment.id] = {
      recordId: memory.recordId,
      version: Number(memory.version) || 1,
      sourceFactsHash: memory.sourceFactsHash,
      sourceSubmissionRecordId: memory.sourceSubmissionRecordId
    };
    sourceRecordIds.push(memory.recordId, submission.recordId);
    for (const item of sources.learningByExperiment[experiment.id] || []) if (item.recordId) sourceRecordIds.push(item.recordId);
    for (const item of sources.interventionsByExperiment[experiment.id] || []) if (item.recordId) sourceRecordIds.push(item.recordId);
  }
  const uniqueSourceRecordIds = Array.from(new Set(sourceRecordIds.filter(Boolean))).sort().slice(0, 300);
  const sourceFactsHash = hash({ sourceMemoryVersions, objectiveMetrics, sourceRecordIds: uniqueSourceRecordIds });
  return { sourceMemoryVersions, sourceRecordIds: uniqueSourceRecordIds, sourceFactsHash };
}

async function persistVersion(student, pointer, document) {
  const nextPointer = {
    schemaVersion: 1,
    recordId: pointerId(student.studentId),
    recordType: "pointer",
    studentId: student.studentId,
    currentRecordId: document.recordId,
    currentVersion: document.diagnosisVersion,
    currentSourceFactsHash: document.sourceFactsHash,
    noticeShownAt: pointer && pointer.noticeShownAt || "",
    noticeResponse: pointer && pointer.noticeResponse || "",
    noticeRespondedAt: pointer && pointer.noticeRespondedAt || "",
    updatedAt: db.serverDate()
  };
  if (typeof db.startTransaction === "function") {
    const transaction = await db.startTransaction();
    const txCollection = transaction.collection("learning_diagnoses");
    await txCollection.doc(document.recordId).set(document);
    const existingPointer = await readDocument(txCollection, nextPointer.recordId);
    if (existingPointer) await txCollection.doc(nextPointer.recordId).update(nextPointer);
    else {
      nextPointer.createdAt = db.serverDate();
      await txCollection.doc(nextPointer.recordId).set(nextPointer);
    }
    await transaction.commit();
    return;
  }
  await diagnosesCollection.doc(document.recordId).set(document);
  if (pointer) await diagnosesCollection.doc(nextPointer.recordId).update(nextPointer);
  else {
    nextPointer.createdAt = db.serverDate();
    await diagnosesCollection.doc(nextPointer.recordId).set(nextPointer);
  }
}

exports.main = async (event) => {
  const session = verifyStudentSession(event);
  if (!session) return { ok: false, code: "UNAUTHORIZED", message: "登录会话无效或已过期。", retryable: false };
  parsePayload(event);
  const studentId = clean(session.studentId, 100);
  try {
    const studentResult = await studentsCollection.where({ studentId }).limit(1).get();
    const student = Array.isArray(studentResult.data) ? studentResult.data[0] : null;
    if (!student) return { ok: false, code: "STUDENT_NOT_FOUND", message: "学生账号不存在。", retryable: false };
    const sources = await readSources(studentId);
    const readiness = evaluateReadiness(sources);
    if (!readiness.eligible) {
      return { ok: false, code: "EXPERIMENTS_INCOMPLETE", message: "四次实验尚未全部完成。", retryable: false, readiness };
    }
    if (!readiness.generationReady) {
      return { ok: false, code: "MEMORIES_NOT_READY", message: "正在整理四次实验记忆。", retryable: true, readiness };
    }
    const objectiveMetrics = buildObjectiveMetrics(
      sources.submissions,
      sources.memories,
      sources.learningByExperiment,
      sources.interventionsByExperiment
    );
    const signature = sourceSignature(sources, objectiveMetrics);
    const pointer = await readDocument(diagnosesCollection, pointerId(studentId));
    if (pointer && pointer.currentSourceFactsHash === signature.sourceFactsHash) {
      return { ok: true, operation: "unchanged", recordId: pointer.currentRecordId, diagnosisVersion: pointer.currentVersion };
    }
    const aiValue = await callAi({
      completedExperiments: EXPERIMENTS.map((experiment) => ({ experimentId: experiment.id, experimentName: experiment.label })),
      objectiveMetrics,
      experimentMemories: EXPERIMENTS.map((experiment) => {
        const memory = sources.memories[experiment.id];
        return {
          experimentId: experiment.id,
          version: memory.version,
          strengths: memory.summary && memory.summary.strengths || [],
          needsSupport: memory.summary && memory.summary.needsSupport || [],
          inquiryPerformance: memory.summary && memory.summary.inquiryPerformance || {},
          evidenceUse: memory.summary && memory.summary.evidenceUse || {},
          reflectionPerformance: memory.summary && memory.summary.reflectionPerformance || {},
          inputSupport: memory.summary && memory.summary.inputSupport || {},
          interventionResponse: memory.summary && memory.summary.interventionResponse || {},
          changesFromPrevious: memory.summary && memory.summary.changesFromPrevious || []
        };
      })
    });
    const diagnosis = validateDiagnosis(aiValue);
    if (!diagnosis || !diagnosis.progressSummary) {
      return { ok: false, code: "AI_INVALID_STRUCTURE", message: "学习诊断暂时无法生成。", retryable: true };
    }
    const latestSources = await readSources(studentId);
    const latestReadiness = evaluateReadiness(latestSources);
    if (!latestReadiness.generationReady) {
      return { ok: false, code: "SOURCE_CHANGED", message: "学习数据已更新，将重新整理。", retryable: true };
    }
    const latestMetrics = buildObjectiveMetrics(
      latestSources.submissions,
      latestSources.memories,
      latestSources.learningByExperiment,
      latestSources.interventionsByExperiment
    );
    if (sourceSignature(latestSources, latestMetrics).sourceFactsHash !== signature.sourceFactsHash) {
      return { ok: false, code: "SOURCE_CHANGED", message: "学习数据已更新，将重新整理。", retryable: true };
    }
    const diagnosisVersion = Math.max(0, Number(pointer && pointer.currentVersion) || 0) + 1;
    const recordId = versionId(studentId, signature.sourceFactsHash);
    const existingVersion = await readDocument(diagnosesCollection, recordId);
    if (existingVersion) {
      return { ok: true, operation: "unchanged", recordId, diagnosisVersion: existingVersion.diagnosisVersion };
    }
    const document = {
      schemaVersion: 1,
      recordId,
      recordType: "version",
      studentId,
      studentName: clean(student.name, 100),
      className: clean(student.class, 100),
      groupName: clean(student.group, 100),
      diagnosisVersion,
      sourceMemoryVersions: signature.sourceMemoryVersions,
      sourceFactsHash: signature.sourceFactsHash,
      completedExperiments: objectiveMetrics.experiments.map((item) => ({
        experimentId: item.experimentId,
        experimentOrder: item.experimentOrder,
        submittedAt: item.submittedAt,
        knowledgeAvailable: item.knowledge.posttestAvailable
      })),
      objectiveMetrics,
      dimensions: diagnosis.dimensions,
      progressSummary: diagnosis.progressSummary,
      studentReport: diagnosis.studentReport,
      teacherReport: diagnosis.teacherReport,
      recommendations: diagnosis.recommendations,
      sourceRecordIds: signature.sourceRecordIds,
      promptVersion: PROMPT_VERSION,
      generatedAt: db.serverDate(),
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    await persistVersion(student, pointer, document);
    return { ok: true, operation: "created", recordId, diagnosisVersion };
  } catch (error) {
    console.error("generateLearningDiagnosis failed", { code: error.code || error.errCode || "UNKNOWN" });
    return {
      ok: false,
      code: error.code || "DIAGNOSIS_GENERATION_FAILED",
      message: "学习诊断暂时未生成，请稍后重试。",
      retryable: true
    };
  }
};

exports.__test = Object.freeze({
  completionFacts,
  buildObjectiveMetrics,
  evaluateReadiness,
  validateDiagnosis,
  pointerId,
  versionId
});
