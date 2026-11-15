"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const students = db.collection("students");
const teachers = db.collection("teachers");

function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) { if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } } return event && event.body || event || {}; }
function currentUid() { const context = typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {}; return text(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID); }
async function isTeacher() { const uid = currentUid(); if (!uid) return false; const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get(); return Array.isArray(result.data) && Boolean(result.data[0]); }

exports.main = async (event) => {
  try {
    if (!await isTeacher()) return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师编辑权限。" };
    const input = body(event);
    const studentId = text(input.studentId);
    const name = text(input.name);
    const className = text(input.class);
    const group = text(input.group);
    const password = text(input.password);
    if (!studentId || !name || !className || !group || [name, className, group, password].some((value) => value.length > 100)) {
      return { ok: false, code: "INVALID_DATA", message: "请填写有效的姓名、班级和小组（每项不超过 100 字）。" };
    }
    const result = await students.where({ studentId }).limit(2).get();
    const matches = Array.isArray(result.data) ? result.data : [];
    if (!matches.length) return { ok: false, code: "NOT_FOUND", message: "未找到该学生账号。" };
    if (matches.length > 1) return { ok: false, code: "DUPLICATE_STUDENT_ID", message: "检测到重复学号，已停止编辑。" };
    const changes = { name, class: className, group, updatedAt: db.serverDate() };
    if (password) { changes.password = password; changes.mustChangePassword = true; }
    const write = await students.doc(matches[0]._id).update(changes);
    if (write && write.code) return { ok: false, code: "WRITE_FAILED", message: "保存学生账号失败。" };
    return { ok: true, code: "UPDATED", studentId };
  } catch (error) {
    return { ok: false, code: "WRITE_FAILED", message: "保存学生账号失败。" };
  }
};
