"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");

const STUDENTS_COLLECTION = "students";
const CURRENT_SCHEMA_VERSION = 1;
const SESSION_VERSION = 1;
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);

function normalizeCell(value) {
  return String(value == null ? "" : value).trim();
}

function base64url(value) {
  return Buffer.from(value).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createSessionToken(studentId, nowSeconds) {
  const secret = String(process.env.STUDENT_SESSION_SECRET || "");
  if (secret.length < 32) {
    const error = new Error("STUDENT_SESSION_SECRET must contain at least 32 characters");
    error.code = "SESSION_SECRET_NOT_CONFIGURED";
    throw error;
  }
  const payload = {
    version: SESSION_VERSION,
    studentId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + SESSION_TTL_SECONDS
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = base64url(crypto.createHmac("sha256", secret).update(encoded).digest());
  return {
    token: `${encoded}.${signature}`,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString()
  };
}

function buildStudentSession(student) {
  const issued = createSessionToken(student.studentId || "", Math.floor(Date.now() / 1000));
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    role: "student",
    studentId: student.studentId || "",
    name: student.name || "",
    class: student.class || "",
    group: student.group || "",
    mustChangePassword: Boolean(student.mustChangePassword),
    sessionToken: issued.token,
    sessionExpiresAt: issued.expiresAt
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

  try {
    return {
      ok: true,
      student: buildStudentSession(student)
    };
  } catch (error) {
    console.error("studentLogin session signing failed", {
      code: error.code || "SESSION_SIGNING_FAILED"
    });
    return {
      ok: false,
      code: error.code || "SESSION_SIGNING_FAILED",
      message: "登录会话暂时无法建立，请联系管理员。"
    };
  }
};
