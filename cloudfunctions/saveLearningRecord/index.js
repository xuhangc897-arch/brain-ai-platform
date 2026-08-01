"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");

const SCHEMA_VERSION = 1;
const STUDENTS_COLLECTION = "students";
const RECORDS_COLLECTION = "learning_records";
const EXPERIMENTS = new Set(["memory", "nback", "interference", "strategies"]);
const INPUT_METHODS = new Set(["", "keyboard", "voice", "mixed"]);
const TASK_STATUSES = new Set(["in_progress", "saved", "submitted"]);
const MAX_TEXT_CHARACTERS = 10000;
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;
const RECORD_FIELDS = new Set([
  "schemaVersion", "studentId", "experimentId", "stageId", "taskId",
  "inputText", "inputMethod", "typingDurationMs", "activeTypingDurationMs",
  "effectiveCharacterCount", "keyboardInputCharacterCount", "deleteCount",
  "largeDeleteCount", "pauseCount", "longestPauseMs", "aiUsed", "voiceUsed",
  "taskStatus", "firstFocusedAt", "firstInputAt", "lastInputAt", "pageId"
]);
const COUNTER_FIELDS = [
  "typingDurationMs", "activeTypingDurationMs", "effectiveCharacterCount",
  "keyboardInputCharacterCount", "deleteCount", "largeDeleteCount",
  "pauseCount", "longestPauseMs"
];

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);
const recordsCollection = db.collection(RECORDS_COLLECTION);

function response(ok, code, message, retryable, extra) {
  return Object.assign({ ok, code, message, retryable }, extra || {});
}

function parsePayload(event) {
  if (event && typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch (error) {
      return {};
    }
  }
  if (event && event.body && typeof event.body === "object") return event.body;
  return event || {};
}

function getHeader(event, name) {
  const headers = event && event.headers && typeof event.headers === "object" ? event.headers : {};
  const expected = String(name).toLowerCase();
  const key = Object.keys(headers).find((item) => String(item).toLowerCase() === expected);
  return key ? String(headers[key] || "") : "";
}

function decodeBase64url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function verifyStudentSession(event) {
  const secret = String(process.env.STUDENT_SESSION_SECRET || "");
  if (secret.length < 32) return null;
  const authorization = getHeader(event, "authorization");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const actualBuffer = Buffer.from(parts[1]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(decodeBase64url(parts[0]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.version !== 1 || !ID_PATTERN.test(text(payload.studentId))) return null;
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.issuedAt > now + 300 || payload.expiresAt <= now) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function unicodeLength(value) {
  return Array.from(String(value == null ? "" : value)).length;
}

function effectiveCount(value) {
  return Array.from(String(value == null ? "" : value))
    .filter((character) => !/\s/u.test(character)).length;
}

function recordId(record) {
  const composite = [record.studentId, record.experimentId, record.stageId, record.taskId].join("|");
  return `learning_${crypto.createHash("sha256").update(composite).digest("hex")}`;
}

function validTimestamp(value) {
  return value == null || value === "" || !Number.isNaN(Date.parse(value));
}

function earliest(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function latest(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function mergeMethod(left, right) {
  if (!left) return right || "";
  if (!right || left === right) return left;
  return "mixed";
}

function validate(payload) {
  const envelopeFields = Object.keys(payload);
  if (envelopeFields.some((key) => key !== "schemaVersion" && key !== "record")) {
    return response(false, "UNKNOWN_FIELD", "请求包含未知字段", false);
  }
  if (Number(payload.schemaVersion) !== SCHEMA_VERSION) {
    return response(false, "UNSUPPORTED_SCHEMA_VERSION", "不支持的数据版本", false);
  }
  const record = payload.record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return response(false, "INVALID_RECORD", "学习记录格式无效", false);
  }
  if (Object.keys(record).some((key) => !RECORD_FIELDS.has(key))) {
    return response(false, "UNKNOWN_FIELD", "学习记录包含未知字段", false);
  }
  for (const field of ["studentId", "experimentId", "stageId", "taskId"]) {
    if (!ID_PATTERN.test(text(record[field]))) {
      return response(false, "INVALID_IDENTIFIER", `${field} 格式无效`, false);
    }
  }
  if (text(record.studentId) === "guest") {
    return response(false, "INVALID_STUDENT", "游客记录不会保存", false);
  }
  if (!EXPERIMENTS.has(text(record.experimentId))) {
    return response(false, "INVALID_EXPERIMENT", "实验标识无效", false);
  }
  if (!INPUT_METHODS.has(text(record.inputMethod)) || !TASK_STATUSES.has(text(record.taskStatus))) {
    return response(false, "INVALID_ENUM", "记录状态或输入方式无效", false);
  }
  if (unicodeLength(record.inputText) > MAX_TEXT_CHARACTERS) {
    return response(false, "TEXT_TOO_LONG", "文本超过 10000 个字符", false);
  }
  if (unicodeLength(record.pageId) > 200) {
    return response(false, "PAGE_ID_TOO_LONG", "页面标识过长", false);
  }
  for (const field of COUNTER_FIELDS) {
    const value = Number(record[field]);
    if (!Number.isSafeInteger(value) || value < 0) {
      return response(false, "INVALID_METRIC", `${field} 必须为非负整数`, false);
    }
  }
  if (typeof record.aiUsed !== "boolean" || typeof record.voiceUsed !== "boolean") {
    return response(false, "INVALID_FLAG", "使用标记格式无效", false);
  }
  for (const field of ["firstFocusedAt", "firstInputAt", "lastInputAt"]) {
    if (!validTimestamp(record[field])) {
      return response(false, "INVALID_TIMESTAMP", `${field} 格式无效`, false);
    }
  }
  return null;
}

async function findStudent(studentId) {
  const result = await studentsCollection.where({ studentId }).limit(1).get();
  if (result.code) throw new Error("student lookup failed");
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

async function readExisting(id) {
  try {
    const result = await recordsCollection.doc(id).get();
    return result && Array.isArray(result.data) ? result.data[0] || null : null;
  } catch (error) {
    const code = error && (error.code || error.errCode);
    if (code === "DATABASE_DOCUMENT_NOT_EXIST" || code === -502005) return null;
    throw error;
  }
}

function buildDocument(record, student, existing, id) {
  const serverNow = db.serverDate();
  const status = existing && existing.taskStatus === "submitted"
    ? "submitted"
    : text(record.taskStatus);
  const document = {
    schemaVersion: SCHEMA_VERSION,
    recordId: id,
    studentId: text(record.studentId),
    studentName: text(student.name),
    className: text(student.class),
    groupName: text(student.group),
    experimentId: text(record.experimentId),
    stageId: text(record.stageId),
    taskId: text(record.taskId),
    inputText: String(record.inputText == null ? "" : record.inputText),
    inputMethod: mergeMethod(existing && existing.inputMethod, text(record.inputMethod)),
    effectiveCharacterCount: effectiveCount(record.inputText),
    aiUsed: Boolean(record.aiUsed || (existing && existing.aiUsed)),
    voiceUsed: Boolean(record.voiceUsed || (existing && existing.voiceUsed)),
    taskStatus: status,
    firstFocusedAt: earliest(existing && existing.firstFocusedAt, record.firstFocusedAt),
    firstInputAt: earliest(existing && existing.firstInputAt, record.firstInputAt),
    lastInputAt: latest(existing && existing.lastInputAt, record.lastInputAt),
    pageId: text(record.pageId),
    savedAt: serverNow,
    submittedAt: existing && existing.submittedAt ? existing.submittedAt : null,
    updatedAt: serverNow
  };
  for (const field of COUNTER_FIELDS) {
    if (field === "effectiveCharacterCount") continue;
    document[field] = Math.max(Number(record[field]), Number(existing && existing[field]) || 0);
  }
  if (record.taskStatus === "submitted") document.submittedAt = serverNow;
  if (!existing) document.createdAt = serverNow;
  return document;
}

exports.main = async (event) => {
  const session = verifyStudentSession(event);
  if (!session) return response(false, "UNAUTHORIZED", "登录会话无效或已过期", false);
  const incoming = parsePayload(event);
  const incomingRecord = incoming && incoming.record && typeof incoming.record === "object"
    ? incoming.record
    : null;
  if (incomingRecord && text(incomingRecord.studentId) && text(incomingRecord.studentId) !== session.studentId) {
    return response(false, "STUDENT_MISMATCH", "记录所属学生与登录会话不一致", false);
  }
  const payload = incomingRecord
    ? Object.assign({}, incoming, { record: Object.assign({}, incomingRecord, { studentId: session.studentId }) })
    : incoming;
  const validationError = validate(payload);
  if (validationError) return validationError;

  const record = payload.record;
  const id = recordId(record);
  try {
    const student = await findStudent(text(record.studentId));
    if (!student) {
      return response(false, "STUDENT_NOT_FOUND", "未找到有效学生账号", false);
    }
    const existing = await readExisting(id);
    const document = buildDocument(record, student, existing, id);
    if (existing) {
      await recordsCollection.doc(id).update(document);
    } else {
      await recordsCollection.doc(id).set(document);
    }
    return response(true, "", "", false, {
      recordId: id,
      operation: existing ? "updated" : "created"
    });
  } catch (error) {
    console.error("saveLearningRecord failed", {
      code: (error && (error.code || error.errCode || error.errorCode)) || "UNKNOWN"
    });
    return response(false, "DATABASE_ERROR", "学习记录暂未保存，将稍后重试", true);
  }
};
