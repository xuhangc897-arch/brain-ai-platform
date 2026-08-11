"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");

const EXPERIMENTS = Object.freeze(["memory", "nback", "interference", "strategies"]);
const DIMENSION_LABELS = Object.freeze({
  memory_knowledge: "记忆知识理解",
  scientific_inquiry: "科学探究",
  evidence_use: "证据使用",
  metacognitive_regulation: "学习检查与调整",
  tool_use: "AI与语音工具使用"
});
const LEVEL_LABELS = Object.freeze({
  consistent: "表现较稳定",
  developing: "正在发展",
  support_recommended: "建议继续练习",
  insufficient_data: "数据不足"
});

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const records = db.collection("experimentRecords");
const submissions = db.collection("experiment_submissions");
const memories = db.collection("student_memories");
const diagnoses = db.collection("learning_diagnoses");
const students = db.collection("students");

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
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function pointerId(studentId) {
  return `diagnosis_pointer_${hash(studentId)}`;
}

function recordData(record) {
  return record && (record.payload || record.data) || {};
}

function fullState(record) {
  if (record && record.experimentResults && typeof record.experimentResults === "object") {
    const quiz = record.knowledgeQuiz || {};
    const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : [];
    return Object.assign({}, record.experimentResults, {
      fields: record.answers || {},
      surveys: { postMeta: record.surveys && record.surveys.meta || {}, cognitiveLoad: record.surveys && record.surveys.cognitiveLoad || {}, inquiryParticipation: record.surveys && record.surveys.inquiryParticipation || {} },
      knowledgeQuiz: Object.assign({}, quiz, { history: attempts, submitted: attempts.length > 0, score: quiz.finalScore })
    });
  }
  const data = recordData(record);
  return data.fullState && typeof data.fullState === "object" ? data.fullState : {};
}

function completed(state) {
  const surveys = state.surveys || {};
  const counts = { postMeta: 5, cognitiveLoad: 2, inquiryParticipation: 9 };
  const surveyComplete = Object.entries(counts).every(([key, count]) => {
    const values = surveys[key] || {};
    return Array.from({ length: count }, (_, index) => Number(values[`q${index + 1}`]) > 0).every(Boolean);
  });
  return Number(state.maxUnlockedStep) >= 7 && surveyComplete;
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

async function latestSubmission(studentId, experimentId) {
  const current = await submissions.where({ studentId, experimentId }).orderBy("uploadedAt", "desc").limit(1).get();
  if (Array.isArray(current.data) && current.data[0]) return current.data[0];
  const result = await records
    .where({ studentId, module: experimentId, recordType: "submission" })
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

async function readiness(studentId) {
  const [submissions, memoryResult] = await Promise.all([
    Promise.all(EXPERIMENTS.map((experimentId) => latestSubmission(studentId, experimentId))),
    memories.where({ studentId, memoryType: "experiment" }).limit(10).get()
  ]);
  const memoryMap = Object.fromEntries((Array.isArray(memoryResult.data) ? memoryResult.data : []).map((item) => [item.experimentId, item]));
  const missingExperimentIds = [];
  const incompleteExperimentIds = [];
  const staleMemoryExperimentIds = [];
  EXPERIMENTS.forEach((experimentId, index) => {
    const submission = submissions[index];
    if (!submission) {
      missingExperimentIds.push(experimentId);
      return;
    }
    if (!completed(fullState(submission))) incompleteExperimentIds.push(experimentId);
    if (!memoryMap[experimentId] || memoryMap[experimentId].sourceSubmissionRecordId !== submission.recordId) {
      staleMemoryExperimentIds.push(experimentId);
    }
  });
  return {
    eligible: !missingExperimentIds.length && !incompleteExperimentIds.length,
    generationReady: !missingExperimentIds.length && !incompleteExperimentIds.length && !staleMemoryExperimentIds.length,
    missingExperimentIds,
    incompleteExperimentIds,
    staleMemoryExperimentIds
  };
}

function studentView(document) {
  if (!document) return null;
  return {
    diagnosisVersion: Number(document.diagnosisVersion) || 1,
    generatedAt: document.generatedAt || "",
    progressSummary: clean(document.progressSummary, 500),
    completedExperiments: Array.isArray(document.completedExperiments)
      ? document.completedExperiments.map((item) => ({
          experimentId: clean(item.experimentId, 32),
          submittedAt: item.submittedAt || "",
          knowledgeAvailable: Boolean(item.knowledgeAvailable)
        }))
      : [],
    dimensions: Array.isArray(document.dimensions)
      ? document.dimensions.map((item) => ({
          title: DIMENSION_LABELS[item.dimensionId] || "学习表现",
          level: LEVEL_LABELS[item.level] || "正在发展",
          evidence: Array.isArray(item.evidence) ? item.evidence.map((entry) => clean(entry.summary, 240)).filter(Boolean).slice(0, 3) : [],
          progress: clean(item.progress && item.progress.summary, 240),
          suggestion: clean(item.suggestion, 240)
        }))
      : [],
    report: {
      strengths: Array.isArray(document.studentReport && document.studentReport.strengths) ? document.studentReport.strengths.slice(0, 3) : [],
      progress: Array.isArray(document.studentReport && document.studentReport.progress) ? document.studentReport.progress.slice(0, 3) : [],
      growthAreas: Array.isArray(document.studentReport && document.studentReport.growthAreas) ? document.studentReport.growthAreas.slice(0, 3) : [],
      nextActions: Array.isArray(document.studentReport && document.studentReport.nextActions) ? document.studentReport.nextActions.slice(0, 3) : []
    }
  };
}

exports.main = async (event) => {
  const session = verifyStudentSession(event);
  if (!session) return { ok: false, code: "UNAUTHORIZED", message: "登录会话无效或已过期。", retryable: false };
  const studentId = clean(session.studentId, 100);
  try {
    const studentResult = await students.where({ studentId }).limit(1).get();
    if (!Array.isArray(studentResult.data) || !studentResult.data[0]) {
      return { ok: false, code: "STUDENT_NOT_FOUND", message: "学生账号不存在。", retryable: false };
    }
    const payload = parsePayload(event);
    const action = clean(payload.action || "read", 32);
    let pointer = await readDocument(diagnoses, pointerId(studentId));
    if (action === "notice") {
      const response = clean(payload.response, 20);
      if (!pointer || !["shown", "viewed", "later"].includes(response)) {
        return { ok: false, code: "INVALID_NOTICE", message: "诊断提示状态无效。", retryable: false };
      }
      const update = {
        noticeShownAt: pointer.noticeShownAt || db.serverDate(),
        noticeResponse: response === "shown" ? (pointer.noticeResponse || "") : response,
        noticeRespondedAt: response === "shown" ? (pointer.noticeRespondedAt || "") : db.serverDate(),
        updatedAt: db.serverDate()
      };
      await diagnoses.doc(pointer.recordId).update(update);
      pointer = { ...pointer, ...update };
    } else if (action !== "read") {
      return { ok: false, code: "INVALID_ACTION", message: "请求操作无效。", retryable: false };
    }
    const status = await readiness(studentId);
    const document = pointer && pointer.currentRecordId
      ? await readDocument(diagnoses, pointer.currentRecordId)
      : null;
    return {
      ok: true,
      eligibility: status,
      diagnosis: studentView(document),
      notice: {
        shouldNotify: Boolean(document && !pointer.noticeShownAt),
        response: clean(pointer && pointer.noticeResponse, 20)
      },
      canRetry: status.eligible && !document
    };
  } catch (error) {
    console.error("getLearningDiagnosis failed", { code: error.code || error.errCode || "UNKNOWN" });
    return { ok: false, code: "DIAGNOSIS_READ_FAILED", message: "学习诊断暂时无法读取。", retryable: true };
  }
};

exports.__test = Object.freeze({ completed, studentView, pointerId });
