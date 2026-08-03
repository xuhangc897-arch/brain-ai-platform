"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const submissions = db.collection("experiment_submissions");
const legacyRecords = db.collection("experimentRecords");
const teachers = db.collection("teachers");

function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) { if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } } return event && event.body || event || {}; }
function currentUid() { const context = typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {}; return text(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID); }
async function isTeacher() { const uid = currentUid(); if (!uid) return false; const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get(); return Array.isArray(result.data) && Boolean(result.data[0]); }
function timeValue(value) { if (!value) return 0; if (typeof value === "string") return Date.parse(value) || 0; if (value.$date) return Date.parse(value.$date) || 0; if (value.seconds) return Number(value.seconds) * 1000; return 0; }
function asDashboardRecord(item) {
  const quiz = item.knowledgeQuiz || {}; const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : []; const last = attempts[attempts.length - 1] || {};
  const state = Object.assign({}, item.experimentResults || {}, { studentId: item.studentId, studentName: item.studentName || "", className: item.className || "", groupName: item.groupName || "", fields: item.answers || {}, surveys: { postMeta: item.surveys && item.surveys.meta || {}, cognitiveLoad: item.surveys && item.surveys.cognitiveLoad || {}, inquiryParticipation: item.surveys && item.surveys.inquiryParticipation || {} }, knowledgeQuiz: Object.assign({}, quiz, { history: attempts.map((entry) => Object.assign({}, entry, { submittedAt: entry.timestamp || entry.submittedAt || "" })), submitted: attempts.length > 0, answers: last.answers || {}, score: quiz.finalScore, correctCount: last.correctCount || 0, submittedAt: last.timestamp || last.submittedAt || "", wrongQuestions: last.wrongQuestions || [] }) });
  return { schemaVersion: item.schemaVersion || 1, recordId: item._id || item.submissionId, module: item.experimentId, recordType: "submission", studentId: item.studentId, studentName: item.studentName || "", className: item.className || "", groupName: item.groupName || "", data: Object.assign({}, item, { fullState: state }), payload: Object.assign({}, item, { fullState: state }), clientRecordId: item.clientRecordId || item.submissionId, createdAt: item.submissionTime, uploadedAt: item.uploadedAt, sourceCollection: "experiment_submissions" };
}

exports.main = async (event) => {
  if (!await isTeacher()) return { ok: false, code: "FORBIDDEN", records: [] };
  const input = body(event); const limit = Math.max(1, Math.min(500, Number(input.limit) || 100));
  const newCondition = {}; const legacyCondition = { recordType: "submission" };
  if (text(input.studentId)) { newCondition.studentId = text(input.studentId); legacyCondition.studentId = text(input.studentId); }
  if (text(input.module)) { newCondition.experimentId = text(input.module); legacyCondition.module = text(input.module); }
  ["className", "groupName"].forEach((key) => { if (text(input[key])) { newCondition[key] = text(input[key]); legacyCondition[key] = text(input[key]); } });
  const [newResult, legacyResult] = await Promise.all([
    submissions.where(newCondition).orderBy("uploadedAt", "desc").limit(limit).get(),
    legacyRecords.where(legacyCondition).orderBy("uploadedAt", "desc").limit(limit).get()
  ]);
  const records = (Array.isArray(newResult.data) ? newResult.data.map(asDashboardRecord) : []).concat(Array.isArray(legacyResult.data) ? legacyResult.data : []);
  records.sort((left, right) => timeValue(right.uploadedAt || right.createdAt) - timeValue(left.uploadedAt || left.createdAt));
  const from = text(input.dateFrom) ? Date.parse(`${text(input.dateFrom)}T00:00:00+08:00`) : 0;
  const to = text(input.dateTo) ? Date.parse(`${text(input.dateTo)}T23:59:59.999+08:00`) : Number.MAX_SAFE_INTEGER;
  const skip = Math.max(0, Number(input.skip) || 0);
  return { ok: true, records: records.filter((record) => { const value = timeValue(record.uploadedAt || record.createdAt); return value >= from && value <= to; }).slice(skip, skip + limit) };
};

exports.__test = { asDashboardRecord, timeValue };
