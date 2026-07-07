"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const STUDENTS_COLLECTION = "students";
const ENV_ID = "memory-detective-platfor-d369a42";

const app = cloudbase.init({
  env: ENV_ID
});

const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);

function normalizeCell(value) {
  return String(value == null ? "" : value).trim();
}

function buildStudentSession(student) {
  return {
    studentId: student.studentId || "",
    name: student.name || "",
    class: student.class || "",
    group: student.group || "",
    mustChangePassword: Boolean(student.mustChangePassword)
  };
}

exports.main = async (event) => {
  console.log("===== studentLogin start =====");
  console.log("event:", JSON.stringify(event));

  let payload = event;

  if (event && typeof event.body === "string") {
    try {
      payload = JSON.parse(event.body);
    } catch (error) {
      console.log("body parse failed:", error);
    }
  } else if (event && event.body && typeof event.body === "object") {
    payload = event.body;
  }

  console.log("raw event:", JSON.stringify(event));
  console.log("payload:", JSON.stringify(payload));

  const studentId = normalizeCell(payload && payload.studentId);
  const password = String((payload && payload.password) || "");

  console.log("studentId:", studentId);
  console.log("password:", password);
  console.log("env:", ENV_ID);
  console.log("before database query");
  console.log("query condition:", JSON.stringify({
    studentId
  }));

  let result;

  try {
    result = await studentsCollection
      .where({ studentId })
      .limit(1)
      .get();
    console.log("query result:", JSON.stringify(result));
    console.log("database result:", JSON.stringify(result));
  } catch (error) {
    console.error("database error");
    console.error(error);
    console.error(JSON.stringify(error));
    throw error;
  }

  if (result.code) {
    console.log("database error:", result.code, result.message);
    return {
      ok: false,
      code: result.code,
      message: result.message || "查询学生账号失败"
    };
  }

  const students = Array.isArray(result.data) ? result.data : [];
  console.log("students array:", JSON.stringify(students));
  console.log("students length:", students.length);

  const student = students[0] || null;
  console.log("student:", JSON.stringify(student));

  if (!student) {
    console.log("student not found");
    return {
      ok: false,
      code: "STUDENT_NOT_FOUND",
      message: "未找到学生账号"
    };
  }

  console.log("input password:", password);
  console.log("database password:", student.password);

  if (String(student.password || "") !== password) {
    console.log("password mismatch");
    return {
      ok: false,
      code: "PASSWORD_WRONG",
      message: "密码错误"
    };
  }

  console.log("login success");

  return {
    ok: true,
    student: buildStudentSession(student)
  };
};
