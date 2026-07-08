"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const STUDENTS_COLLECTION = "students";

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);

function normalizeCell(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeStudent(rawStudent) {
  const studentId = normalizeCell(rawStudent && rawStudent.studentId);
  const explicitPassword = normalizeCell(rawStudent && rawStudent.password);

  return {
    studentId,
    name: normalizeCell(rawStudent && rawStudent.name),
    class: normalizeCell(rawStudent && (rawStudent.class || rawStudent.className)),
    group: normalizeCell(rawStudent && (rawStudent.group || rawStudent.groupName)),
    password: explicitPassword || getDefaultPassword(studentId)
  };
}

function getDefaultPassword(studentId) {
  const normalizedStudentId = normalizeCell(studentId);
  return normalizedStudentId.length > 6
    ? normalizedStudentId.slice(-6)
    : normalizedStudentId;
}

function getErrorMessage(error) {
  return (error && (error.message || error.errMsg || error.msg)) || "未知错误";
}

function getErrorCode(error) {
  return (error && (error.code || error.errCode || error.errorCode || error.category)) || "";
}

function serializeError(error) {
  try {
    return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
  } catch (event) {
    return {
      message: String(error)
    };
  }
}

async function findStudentByStudentId(studentId) {
  const result = await studentsCollection
    .where({ studentId })
    .limit(1)
    .get();

  if (result.code) {
    throw new Error(result.message || "查询 students 集合失败。");
  }

  const records = Array.isArray(result.data) ? result.data : [];
  return records[0] || null;
}

async function createStudentProfile(student) {
  const now = new Date();
  const result = await studentsCollection.add({
    studentId: student.studentId,
    name: student.name,
    class: student.class,
    group: student.group,
    password: student.password,
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now
  });

  if (result.code) {
    throw new Error(result.message || "写入 students 集合失败。");
  }

  return result;
}

async function createOneStudent(rawStudent) {
  const student = normalizeStudent(rawStudent);

  if (!student.studentId || !student.name || !student.class || !student.group) {
    return {
      status: "failed",
      studentId: student.studentId,
      name: student.name,
      class: student.class,
      group: student.group,
      reason: "缺少学号、姓名、班级或小组。"
    };
  }

  try {
    const existingStudent = await findStudentByStudentId(student.studentId);

    if (existingStudent) {
      return {
        status: "skipped",
        studentId: student.studentId,
        name: student.name,
        class: student.class,
        group: student.group,
        reason: "studentId 已存在，已跳过，未覆盖密码。"
      };
    }

    await createStudentProfile(student);

    return {
      status: "success",
      studentId: student.studentId,
      name: student.name,
      class: student.class,
      group: student.group,
      reason: "学生资料已导入。"
    };
  } catch (error) {
    return {
      status: "failed",
      studentId: student.studentId,
      name: student.name,
      class: student.class,
      group: student.group,
      reason: getErrorMessage(error),
      code: getErrorCode(error),
      error: serializeError(error)
    };
  }
}

function parsePayload(event) {
  if (event && typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch (error) {
      return {};
    }
  }

  if (event && event.body && typeof event.body === "object") {
    return event.body;
  }

  return event || {};
}

exports.main = async (event) => {
  const payload = parsePayload(event);
  const students = Array.isArray(payload && payload.students) ? payload.students : [];

  if (students.length === 0) {
    return {
      ok: false,
      code: "EMPTY_STUDENTS",
      message: "没有收到可导入的学生数据。",
      results: []
    };
  }

  const results = [];

  for (const student of students) {
    results.push(await createOneStudent(student));
  }

  const success = results.filter((item) => item.status === "success").length;
  const skipped = results.filter((item) => item.status === "skipped").length;
  const failed = results.filter((item) => item.status === "failed").length;

  return {
    ok: true,
    success,
    skipped,
    failed,
    message: "学生资料已导入，可使用学号和默认密码登录。",
    results
  };
};
