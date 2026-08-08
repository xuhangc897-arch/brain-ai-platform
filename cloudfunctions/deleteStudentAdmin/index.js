"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const students = db.collection("students");
const teachers = db.collection("teachers");

function text(value) {
  return String(value == null ? "" : value).trim();
}

function body(event) {
  if (event && typeof event.body === "string") {
    try { return JSON.parse(event.body); } catch (error) { return {}; }
  }
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

exports.main = async (event) => {
  try {
    if (!await isTeacher()) return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师删除权限。" };
    const studentId = text(body(event).studentId);
    if (!studentId) return { ok: false, code: "INVALID_STUDENT_ID", message: "缺少要删除的学号。" };
    const result = await students.where({ studentId }).limit(2).get();
    const matches = Array.isArray(result.data) ? result.data : [];
    if (!matches.length) return { ok: false, code: "NOT_FOUND", message: "未找到该学生账号。" };
    if (matches.length > 1) return { ok: false, code: "DUPLICATE_STUDENT_ID", message: "检测到重复学号，已停止删除。" };
    const documentId = text(matches[0]._id);
    if (!documentId) return { ok: false, code: "INVALID_DOCUMENT", message: "学生账号缺少文档标识，已停止删除。" };
    const deleteResult = await students.doc(documentId).remove();
    if (deleteResult && deleteResult.code) return { ok: false, code: "DELETE_FAILED", message: "删除学生账号失败。" };
    return { ok: true, code: "DELETED", studentId, message: "学生账号已删除，历史研究数据保持不变。" };
  } catch (error) {
    return { ok: false, code: "DELETE_FAILED", message: "删除学生账号失败。" };
  }
};
