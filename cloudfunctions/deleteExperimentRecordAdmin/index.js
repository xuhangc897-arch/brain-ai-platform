"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const teachers = db.collection("teachers");
const ALLOWED_COLLECTIONS = new Set(["experiment_submissions", "experimentRecords"]);
const RECORD_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;

function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) {
  if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } }
  return event && event.body && typeof event.body === "object" ? event.body : event || {};
}
function currentUid() {
  const context = typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {};
  return text(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID);
}
async function isTeacher() {
  const uid = currentUid();
  if (!uid) return false;
  const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get();
  return Array.isArray(result.data) && Boolean(result.data[0]);
}
function isFormalRecord(collectionName, record) {
  if (!record) return false;
  if (collectionName === "experiment_submissions") return Boolean(text(record.experimentId)) && text(record.experimentId) !== "aiChat";
  return text(record.recordType) === "submission" && text(record.module) !== "aiChat";
}

exports.main = async (event) => {
  try {
    if (!await isTeacher()) return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师删除权限。" };
    const input = body(event);
    const sourceCollection = text(input.sourceCollection);
    const recordId = text(input.recordId);
    if (!ALLOWED_COLLECTIONS.has(sourceCollection)) return { ok: false, code: "INVALID_COLLECTION", message: "不允许删除该数据类型。" };
    if (!RECORD_ID_PATTERN.test(recordId)) return { ok: false, code: "INVALID_RECORD_ID", message: "记录标识无效。" };
    const collection = db.collection(sourceCollection);
    const result = await collection.doc(recordId).get();
    const record = Array.isArray(result.data) ? result.data[0] || null : null;
    if (!record) return { ok: false, code: "NOT_FOUND", message: "未找到该实验记录。" };
    if (!isFormalRecord(sourceCollection, record)) return { ok: false, code: "NOT_FORMAL_SUBMISSION", message: "该记录不是可删除的正式实验提交。" };
    const deleteResult = await collection.doc(recordId).remove();
    if (deleteResult && deleteResult.code) return { ok: false, code: "DELETE_FAILED", message: "删除实验记录失败。" };
    return { ok: true, code: "DELETED", recordId, sourceCollection, message: "实验记录已删除，既有学习记忆和诊断保持不变。" };
  } catch (error) {
    return { ok: false, code: "DELETE_FAILED", message: "删除实验记录失败。" };
  }
};

exports.__test = { isFormalRecord, ALLOWED_COLLECTIONS, RECORD_ID_PATTERN };
