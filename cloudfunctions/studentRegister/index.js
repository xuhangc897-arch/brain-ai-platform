"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const studentsCollection = app.database().collection("students");

function parsePayload(event) {
  if (event && typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch (error) {
      return {};
    }
  }
  return event && event.body && typeof event.body === "object" ? event.body : event || {};
}

exports.main = async (event) => {
  const payload = parsePayload(event);
  const studentId = String(payload.studentId == null ? "" : payload.studentId).trim();
  const name = String(payload.name == null ? "" : payload.name).trim();
  const className = String(payload.class == null ? "" : payload.class).trim();
  const group = String(payload.group == null ? "" : payload.group).trim();

  if (!/^\d+$/.test(studentId) || !name || !/^\d+$/.test(className) || !/^\d+$/.test(group)) {
    return { ok: false, code: "INVALID_INPUT", message: "请填写姓名；学号、班级和小组只能填写数字。" };
  }

  try {
    const existing = await studentsCollection.where({ studentId }).limit(1).get();
    if (existing.code) throw new Error("查询学生账号失败");
    if (Array.isArray(existing.data) && existing.data.length > 0) {
      return { ok: false, code: "STUDENT_EXISTS", message: "该学号已注册，请返回学生登录。" };
    }

    const now = new Date();
    const result = await studentsCollection.add({
      schemaVersion: 1,
      role: "student",
      studentId,
      name,
      class: className,
      group,
      password: studentId,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now
    });
    if (result.code) throw new Error("写入学生账号失败");
    return { ok: true, message: "注册成功，请使用学号和默认密码登录。" };
  } catch (error) {
    console.error("studentRegister failed", { code: (error && error.code) || "DATABASE_ERROR" });
    return { ok: false, code: "REGISTER_FAILED", message: "注册暂时失败，请稍后重试。" };
  }
};
