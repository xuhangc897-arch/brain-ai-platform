"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const STUDENTS_COLLECTION = "students";
const CURRENT_SCHEMA_VERSION = 1;
const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);

function normalizeCell(value) {
  return String(value == null ? "" : value).trim();
}

function buildStudentSession(student) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    role: "student",
    studentId: student.studentId || "",
    name: student.name || "",
    class: student.class || "",
    group: student.group || "",
    mustChangePassword: Boolean(student.mustChangePassword)
  };
}

exports.main = async (event) => {
  let payload = event;

  if (event && typeof event.body === "string") {
    try {
      payload = JSON.parse(event.body);
    } catch (error) {
      console.warn("studentLogin request body parse failed");
    }
  } else if (event && event.body && typeof event.body === "object") {
    payload = event.body;
  }

  const studentId = normalizeCell(payload && payload.studentId);
  const password = String((payload && payload.password) || "");

  let result;

  try {
    result = await studentsCollection
      .where({ studentId })
      .limit(1)
      .get();
  } catch (error) {
    console.error("studentLogin database query failed", {
      code: (error && (error.code || error.errCode || error.errorCode)) || "UNKNOWN"
    });
    throw error;
  }

  if (result.code) {
    return {
      ok: false,
      code: result.code,
      message: "查询学生账号失败"
    };
  }

  const students = Array.isArray(result.data) ? result.data : [];
  const student = students[0] || null;

  if (!student) {
    return {
      ok: false,
      code: "STUDENT_NOT_FOUND",
      message: "未找到学生账号"
    };
  }

  if (String(student.password || "") !== password) {
    return {
      ok: false,
      code: "PASSWORD_WRONG",
      message: "密码错误"
    };
  }

  return {
    ok: true,
    student: buildStudentSession(student)
  };
};
