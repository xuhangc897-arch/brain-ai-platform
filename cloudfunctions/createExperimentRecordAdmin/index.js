"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const submissions = db.collection("experiment_submissions");
const students = db.collection("students");
const teachers = db.collection("teachers");
const EXPERIMENT_NAMES = Object.freeze({
  memory: "记忆容量",
  nback: "工作记忆",
  interference: "记忆干扰",
  strategies: "记忆策略",
  poster: "成果展示",
  screening: "资格审查"
});
const DATA_KEYS = ["answers", "experimentResults", "knowledgeQuiz", "surveys", "reflections", "aiSummary"];

function text(value) { return String(value == null ? "" : value).trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
function body(event) {
  if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } }
  return event && event.body && typeof event.body === "object" ? event.body : event || {};
}
function currentUid() {
  const context = typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {};
  return text(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID);
}
async function requireTeacher() {
  const uid = currentUid();
  if (!uid) return null;
  const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get();
  return Array.isArray(result.data) && result.data[0] ? { uid, teacher: result.data[0] } : null;
}
function validData(value) {
  const data = object(value);
  if (!data || !DATA_KEYS.every((key) => object(data[key]))) return false;
  return Array.isArray(data.knowledgeQuiz.attempts) && data.knowledgeQuiz.attempts.length <= 1;
}
function normalizeTime(value) {
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
function buildIds(studentId, experimentId, submissionTime) {
  const submissionId = `admin:${studentId}:${experimentId}:${submissionTime}:${crypto.randomBytes(12).toString("hex")}`;
  return { submissionId, recordId: `submission_${crypto.createHash("sha256").update(submissionId).digest("hex")}` };
}

exports.main = async (event) => {
  try {
    const teacher = await requireTeacher();
    if (!teacher) return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师新增权限。" };
    const input = body(event);
    const studentId = text(input.studentId);
    const experimentId = text(input.experimentId);
    const submissionTime = normalizeTime(input.submissionTime);
    if (!studentId) return { ok: false, code: "INVALID_STUDENT_ID", message: "请选择学生账号。" };
    if (!Object.prototype.hasOwnProperty.call(EXPERIMENT_NAMES, experimentId)) return { ok: false, code: "INVALID_EXPERIMENT", message: "实验模块无效。" };
    if (!submissionTime) return { ok: false, code: "INVALID_SUBMISSION_TIME", message: "提交时间无效。" };
    if (!validData(input.data)) return { ok: false, code: "INVALID_RECORD_DATA", message: "实验明细 JSON 结构无效。" };
    const studentResult = await students.where({ studentId }).limit(2).get();
    const matches = Array.isArray(studentResult.data) ? studentResult.data : [];
    if (!matches.length) return { ok: false, code: "UNKNOWN_STUDENT", message: "未找到该学生账号。" };
    if (matches.length > 1) return { ok: false, code: "DUPLICATE_STUDENT_ID", message: "检测到重复学号，已停止新增。" };
    const ids = buildIds(studentId, experimentId, submissionTime);
    const data = input.data;
    const document = {
      schemaVersion: 1,
      submissionId: ids.submissionId,
      clientRecordId: ids.submissionId,
      recordId: ids.recordId,
      studentId,
      studentName: text(matches[0].name),
      className: text(matches[0].class),
      groupName: text(matches[0].group),
      experimentId,
      experimentName: EXPERIMENT_NAMES[experimentId],
      submissionTime,
      answers: data.answers,
      experimentResults: data.experimentResults,
      knowledgeQuiz: data.knowledgeQuiz,
      surveys: data.surveys,
      reflections: data.reflections,
      aiSummary: data.aiSummary,
      adminCreated: true,
      createdByUid: teacher.uid,
      uploadedAt: db.serverDate()
    };
    const writeResult = await submissions.doc(ids.recordId).set(document);
    if (writeResult && writeResult.code) return { ok: false, code: "WRITE_FAILED", message: "新增实验记录失败。" };
    return { ok: true, code: "CREATED", recordId: ids.recordId, submissionId: ids.submissionId, message: "实验记录已新增。" };
  } catch (error) {
    return { ok: false, code: "WRITE_FAILED", message: "新增实验记录失败。" };
  }
};

exports.__test = { validData, normalizeTime, buildIds, EXPERIMENT_NAMES };
