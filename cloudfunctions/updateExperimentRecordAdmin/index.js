"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const teachers = db.collection("teachers");
const COLLECTIONS = new Set(["experiment_submissions", "experimentRecords"]);
const DATA_KEYS = ["answers", "experimentResults", "knowledgeQuiz", "surveys", "reflections", "aiSummary"];

function text(value) { return String(value == null ? "" : value).trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
function body(event) { if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } } return event && event.body || event || {}; }
function currentUid() { const context = typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {}; return text(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID); }
async function isTeacher() { const uid = currentUid(); if (!uid) return false; const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get(); return Array.isArray(result.data) && Boolean(result.data[0]); }
function validData(value, collectionName) {
  if (!object(value)) return false;
  if (collectionName === "experimentRecords") return true;
  return DATA_KEYS.every((key) => object(value[key])) &&
    Array.isArray(value.knowledgeQuiz.attempts) && value.knowledgeQuiz.attempts.length <= 1 &&
    (value.knowledgeAssessment == null || object(value.knowledgeAssessment));
}

exports.main = async (event) => {
  try {
    if (!await isTeacher()) return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师编辑权限。" };
    const input = body(event);
    const sourceCollection = text(input.sourceCollection);
    const recordId = text(input.recordId);
    if (!COLLECTIONS.has(sourceCollection) || !/^[A-Za-z0-9_.:-]{1,200}$/.test(recordId)) return { ok: false, code: "INVALID_RECORD", message: "记录标识无效。" };
    if (!validData(input.data, sourceCollection)) return { ok: false, code: "INVALID_DATA", message: "实验数据 JSON 结构无效。" };
    const document = db.collection(sourceCollection).doc(recordId);
    const result = await document.get();
    const record = Array.isArray(result.data) ? result.data[0] : null;
    if (!record) return { ok: false, code: "NOT_FOUND", message: "记录不存在。" };
    if (sourceCollection === "experiment_submissions" ? !text(record.experimentId) || record.experimentId === "aiChat" : record.recordType !== "submission" || record.module === "aiChat") {
      return { ok: false, code: "NOT_FORMAL_SUBMISSION", message: "只能编辑正式实验提交。" };
    }
    const changes = sourceCollection === "experiment_submissions"
      ? Object.fromEntries([...DATA_KEYS, "knowledgeAssessment"].map((key) => [key, input.data[key] ?? null]))
      : { [record.payload ? "payload" : "data"]: input.data };
    changes.adminEditedAt = db.serverDate();
    changes.adminEditedByUid = currentUid();
    const write = await document.update(changes);
    if (write && write.code) return { ok: false, code: "WRITE_FAILED", message: "保存失败。" };
    return { ok: true, code: "UPDATED", recordId };
  } catch (error) {
    return { ok: false, code: "WRITE_FAILED", message: "保存失败。" };
  }
};

exports.__test = { validData };
