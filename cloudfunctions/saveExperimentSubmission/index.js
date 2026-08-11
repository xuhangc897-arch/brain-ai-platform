"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const submissions = db.collection("experiment_submissions");
const students = db.collection("students");
const EXPERIMENTS = new Set(["memory", "nback", "interference", "strategies", "poster", "screening"]);
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) {
  if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } }
  return event && event.body && typeof event.body === "object" ? event.body : event || {};
}
function header(event, name) {
  const headers = event && event.headers || {};
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? text(headers[key]) : "";
}
function decode(value) { return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }
function session(event) {
  const secret = text(process.env.STUDENT_SESSION_SECRET);
  const token = header(event, "authorization").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (secret.length < 32 || parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const left = Buffer.from(parts[1]); const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(decode(parts[0]));
    const now = Math.floor(Date.now() / 1000);
    if (value.version !== 1 || !ID_PATTERN.test(text(value.studentId))) return null;
    if (!Number.isFinite(value.issuedAt) || !Number.isFinite(value.expiresAt) || value.issuedAt > now + 300 || value.expiresAt <= now) return null;
    return value;
  } catch (error) { return null; }
}
function recordId(submissionId) { return `submission_${crypto.createHash("sha256").update(submissionId).digest("hex")}`; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function validKnowledgeAssessment(value) {
  const timeline = object(value);
  if (Number(timeline.schemaVersion) !== 2) return false;
  return ["T0", "T1", "T2", "T3", "T4", "T5"].every((stage) => {
    const record = timeline[stage];
    if (record == null) return true;
    const expectedTotal = stage === "T0" || stage === "T5" ? 20 : 5;
    return object(record) === record
      && record.stage === stage
      && Boolean(text(record.assessmentId))
      && Boolean(text(record.questionSetVersion))
      && Boolean(text(record.timestamp))
      && Array.isArray(record.questionOrder)
      && record.questionOrder.length === expectedTotal
      && new Set(record.questionOrder.map(text)).size === expectedTotal
      && object(record.answers) === record.answers
      && Number.isFinite(Number(record.score))
      && Number.isFinite(Number(record.correctCount))
      && Number(record.totalCount) === expectedTotal
      && object(record.categoryScores) === record.categoryScores;
  });
}
function validSubmission(value, studentId) {
  const submission = object(value);
  if (text(submission.studentId) !== studentId || !EXPERIMENTS.has(text(submission.experimentId))) return false;
  if (!text(submission.submissionId) || !text(submission.experimentName) || !text(submission.submissionTime)) return false;
  if (!submission.knowledgeQuiz || !Array.isArray(submission.knowledgeQuiz.attempts) || submission.knowledgeQuiz.attempts.length > 1) return false;
  if (Number(submission.schemaVersion) >= 2 && !validKnowledgeAssessment(submission.knowledgeAssessment)) return false;
  return [submission.answers, submission.experimentResults, submission.surveys, submission.reflections, submission.aiSummary].every((item) => item && typeof item === "object" && !Array.isArray(item));
}

exports.main = async (event) => {
  const auth = session(event);
  if (!auth) return { ok: false, code: "UNAUTHORIZED", retryable: false };
  const incoming = body(event).submission;
  if (!validSubmission(incoming, text(auth.studentId))) return { ok: false, code: "INVALID_SUBMISSION", retryable: false };
  const studentResult = await students.where({ studentId: text(auth.studentId) }).limit(1).get();
  const student = Array.isArray(studentResult.data) ? studentResult.data[0] : null;
  if (!student) return { ok: false, code: "UNKNOWN_STUDENT", retryable: false };
  const id = recordId(text(incoming.submissionId));
  try {
    const existing = await submissions.doc(id).get();
    if (Array.isArray(existing.data) && existing.data.length) return { ok: true, code: "DUPLICATE", submissionId: incoming.submissionId, recordId: id };
  } catch (error) { /* A missing document is expected. */ }
  const document = Object.assign({}, incoming, {
    recordId: id,
    schemaVersion: Number(incoming.schemaVersion) >= 2 ? 2 : 1,
    studentId: text(auth.studentId),
    studentName: text(student.name),
    className: text(student.class),
    groupName: text(student.group),
    uploadedAt: db.serverDate()
  });
  try {
    const result = await submissions.doc(id).set(document);
    if (result && result.code) throw Object.assign(new Error("write failed"), { code: result.code });
    return { ok: true, code: "STORED", submissionId: incoming.submissionId, recordId: id };
  } catch (error) {
    return { ok: false, code: error.code || "WRITE_FAILED", retryable: true };
  }
};

exports.__test = { validSubmission, validKnowledgeAssessment, recordId };
