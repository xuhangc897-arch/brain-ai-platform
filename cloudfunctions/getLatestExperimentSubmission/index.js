"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const submissions = db.collection("experiment_submissions");
const legacyRecords = db.collection("experimentRecords");
const EXPERIMENT_NAMES = { memory: "记忆容量", nback: "N-back 工作记忆", interference: "长时记忆干扰", strategies: "长时记忆策略", poster: "海报制作" };
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) { if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } } return event && event.body || event || {}; }
function header(event, name) { const headers = event && event.headers || {}; const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase()); return key ? text(headers[key]) : ""; }
function session(event) {
  const secret = text(process.env.STUDENT_SESSION_SECRET); const token = header(event, "authorization").replace(/^Bearer\s+/i, ""); const parts = token.split(".");
  if (secret.length < 32 || parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const a = Buffer.from(parts[1]); const b = Buffer.from(expected); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const value = JSON.parse(Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); const now = Math.floor(Date.now() / 1000); return value.version === 1 && ID_PATTERN.test(text(value.studentId)) && Number.isFinite(value.issuedAt) && Number.isFinite(value.expiresAt) && value.issuedAt <= now + 300 && value.expiresAt > now ? value : null; } catch (error) { return null; }
}
function quiz(source) {
  const value = source || {}; const history = Array.isArray(value.attempts) ? value.attempts : Array.isArray(value.history) ? value.history : [];
  const attempts = history.map((item, index) => ({ attemptNumber: Number(item.attemptNumber) || index + 1, score: Number(item.score) || 0, answers: item.answers || {}, correctCount: Number(item.correctCount) || 0, totalCount: Number(item.totalCount) || 0, accuracy: Number(item.accuracy) || 0, timestamp: item.timestamp || item.submittedAt || "", wrongQuestions: item.wrongQuestions || [] }));
  const scores = attempts.map((item) => item.score); return { attempts, firstScore: scores.length ? scores[0] : null, bestScore: scores.length ? Math.max(...scores) : null, finalScore: scores.length ? scores[scores.length - 1] : null };
}
function surveys(source) { const value = source && source.current || source || {}; return { meta: value.meta || value.postMeta || {}, cognitiveLoad: value.cognitiveLoad || {}, inquiryParticipation: value.inquiryParticipation || {} }; }
function fromLegacy(record) {
  const data = record && (record.payload || record.data) || {}; const state = data.fullState || data; const fields = state.fields || {}; const experimentId = record.module || data.sourceModule || "";
  const results = {}; Object.keys(state).forEach((key) => { if (!["fields", "surveys", "knowledgeQuiz", "studentId", "studentName", "studentAge", "className", "groupName", "groupId", "savedAt", "createdAt", "currentStep", "maxUnlockedStep", "flowVersion"].includes(key)) results[key] = state[key]; });
  const reflections = {}; Object.keys(fields).forEach((key) => { if (/(reflection|improve|strength|teamwork|insight|surprise|applicability|persuasiveness)/i.test(key)) reflections[key] = fields[key]; });
  return { schemaVersion: 1, submissionId: data.clientRecordId || record.clientRecordId || record.recordId || record._id, clientRecordId: data.clientRecordId || record.clientRecordId || "", studentId: record.studentId || state.studentId || "", experimentId, experimentName: EXPERIMENT_NAMES[experimentId] || experimentId, submissionTime: data.createdAt || record.createdAt || "", answers: fields, experimentResults: results, knowledgeQuiz: quiz(state.knowledgeQuiz), surveys: surveys(state.surveys), reflections, aiSummary: { usageCount: 0 }, legacy: true };
}
function stateFromSubmission(submission) {
  const quizValue = submission.knowledgeQuiz || {}; const attempts = Array.isArray(quizValue.attempts) ? quizValue.attempts : []; const last = attempts[attempts.length - 1] || {};
  return Object.assign({}, submission.experimentResults || {}, { studentId: submission.studentId, studentName: submission.studentName || "", className: submission.className || "", groupName: submission.groupName || "", fields: submission.answers || {}, surveys: { postMeta: submission.surveys && submission.surveys.meta || {}, cognitiveLoad: submission.surveys && submission.surveys.cognitiveLoad || {}, inquiryParticipation: submission.surveys && submission.surveys.inquiryParticipation || {} }, knowledgeQuiz: Object.assign({}, quizValue, { history: attempts.map((item) => Object.assign({}, item, { submittedAt: item.timestamp || item.submittedAt || "" })), submitted: attempts.length > 0, answers: last.answers || {}, score: quizValue.finalScore, correctCount: last.correctCount || 0, submittedAt: last.timestamp || last.submittedAt || "", wrongQuestions: last.wrongQuestions || [] }) });
}
async function newest(collection, condition, orderField) { const result = await collection.where(condition).orderBy(orderField, "desc").limit(1).get(); return Array.isArray(result.data) ? result.data[0] : null; }

exports.main = async (event) => {
  const auth = session(event); if (!auth) return { ok: false, code: "UNAUTHORIZED" };
  const input = body(event); const experimentId = text(input.experimentId); if (!EXPERIMENT_NAMES[experimentId]) return { ok: false, code: "INVALID_EXPERIMENT" };
  let submission = input.submissionId ? await newest(submissions, { studentId: text(auth.studentId), experimentId, submissionId: text(input.submissionId) }, "uploadedAt") : await newest(submissions, { studentId: text(auth.studentId), experimentId }, "uploadedAt");
  if (!submission) { const legacy = await newest(legacyRecords, { studentId: text(auth.studentId), module: experimentId, recordType: "submission" }, "uploadedAt"); if (legacy) submission = fromLegacy(legacy); }
  if (!submission) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, submission, state: stateFromSubmission(submission) };
};

exports.__test = { fromLegacy, stateFromSubmission, quiz, surveys };
