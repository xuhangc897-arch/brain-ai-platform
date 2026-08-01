"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");

const STUDENTS_COLLECTION = "students";
const RECORDS_COLLECTION = "experimentRecords";
const LEGACY_SCHEMA_VERSION = 1;
const CURRENT_SCHEMA_VERSION = 2;
const SUPPORTED_SCHEMA_VERSIONS = new Set([LEGACY_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION]);
const ALLOWED_MODULES = new Set(["memory", "nback", "interference", "strategies", "poster", "screening", "aiChat"]);
const ALLOWED_RECORD_TYPES = new Set(["experiment", "state", "submission"]);
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);
const recordsCollection = db.collection(RECORDS_COLLECTION);

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
    if (payload.version !== 1 || !ID_PATTERN.test(normalizeText(payload.studentId))) return null;
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.issuedAt > now + 300 || payload.expiresAt <= now) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function getErrorCode(error) {
  return (error && (error.code || error.errCode || error.errorCode)) || "UNKNOWN";
}

function createRecordId(clientRecordId) {
  return `record_${crypto.createHash("sha256").update(clientRecordId).digest("hex")}`;
}

async function findStudent(studentId) {
  if (!studentId) return null;

  const result = await studentsCollection
    .where({ studentId })
    .limit(1)
    .get();

  if (result.code) {
    throw new Error("query students failed");
  }

  const students = Array.isArray(result.data) ? result.data : [];
  return students[0] || null;
}

async function hasExistingClientRecord(clientRecordId) {
  const result = await recordsCollection
    .where({ clientRecordId })
    .limit(1)
    .get();

  if (result.code) {
    throw new Error("query experimentRecords failed");
  }

  return Array.isArray(result.data) && result.data.length > 0;
}

function buildRecordDocument({
  sourceSchemaVersion,
  recordId,
  module,
  recordType,
  record,
  student
}) {
  const studentId = normalizeText(record.studentId);
  const studentName = normalizeText((student && student.name) || record.studentName);
  const className = normalizeText((student && student.class) || record.className);
  const groupName = normalizeText((student && student.group) || record.groupName || record.groupId);
  const clientCreatedAt = record.createdAt || new Date().toISOString();
  const receivedAt = db.serverDate();
  const payload = Object.assign({}, record, {
    schemaVersion: CURRENT_SCHEMA_VERSION
  });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sourceSchemaVersion,
    recordId,
    owner: {
      studentId,
      studentName,
      className,
      groupName,
      verifiedByStudentCollection: Boolean(student)
    },
    activity: {
      module,
      recordType,
      sourceModule: normalizeText(record.sourceModule)
    },
    timestamps: {
      clientCreatedAt,
      receivedAt
    },
    payload,

    // v1 兼容字段：教师后台完成 v2 读取适配前继续使用。
    module,
    recordType,
    studentId,
    studentName,
    className,
    groupName,
    data: payload,
    clientRecordId: normalizeText(record.clientRecordId),
    createdAt: clientCreatedAt,
    uploadedAt: receivedAt
  };
}

exports.main = async (event) => {
  const session = verifyStudentSession(event);
  if (!session) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "登录会话无效或已过期",
      retryable: false,
      results: []
    };
  }
  const incoming = parsePayload(event);
  const incomingRecords = Array.isArray(incoming.records) ? incoming.records : [];
  if (incomingRecords.some((record) => (
    record && normalizeText(record.studentId) && normalizeText(record.studentId) !== session.studentId
  ))) {
    return {
      ok: false,
      code: "STUDENT_MISMATCH",
      message: "记录所属学生与登录会话不一致",
      retryable: false,
      results: []
    };
  }
  const payload = Object.assign({}, incoming, {
    records: incomingRecords.map((record) => Object.assign({}, record, { studentId: session.studentId }))
  });
  const sourceSchemaVersion = Number(payload.schemaVersion) || LEGACY_SCHEMA_VERSION;
  const module = normalizeText(payload.module);
  const recordType = normalizeText(payload.recordType || "experiment");
  const records = Array.isArray(payload.records) ? payload.records : [];

  if (!SUPPORTED_SCHEMA_VERSIONS.has(sourceSchemaVersion)) {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA_VERSION",
      message: "不支持的数据版本",
      retryable: false,
      results: []
    };
  }

  if (!ALLOWED_MODULES.has(module)) {
    return {
      ok: false,
      code: "INVALID_MODULE",
      message: "不支持的实验模块",
      retryable: false,
      results: []
    };
  }

  if (!ALLOWED_RECORD_TYPES.has(recordType)) {
    return {
      ok: false,
      code: "INVALID_RECORD_TYPE",
      message: "不支持的记录类型",
      retryable: false,
      results: []
    };
  }

  if (records.length === 0) {
    return {
      ok: false,
      code: "EMPTY_RECORDS",
      message: "没有收到实验记录",
      retryable: false,
      results: []
    };
  }

  let verifiedStudent;
  try {
    verifiedStudent = await findStudent(session.studentId);
  } catch (error) {
    return {
      ok: false,
      code: "STUDENT_LOOKUP_FAILED",
      message: "学生身份核验暂时失败",
      retryable: true,
      results: []
    };
  }
  if (!verifiedStudent) {
    return {
      ok: false,
      code: "UNKNOWN_STUDENT",
      message: "未找到有效学生账号",
      retryable: false,
      results: []
    };
  }

  const ids = [];
  const results = [];
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const rawRecord of records) {
    const record = rawRecord && typeof rawRecord === "object" ? rawRecord : {};
    const studentId = normalizeText(record.studentId);
    const clientRecordId = normalizeText(record.clientRecordId);

    if (!studentId || !clientRecordId) {
      skipped += 1;
      results.push({
        clientRecordId,
        status: "skipped",
        code: "INVALID_RECORD",
        retryable: false
      });
      console.warn("skip invalid experiment record:", {
        module,
        recordType,
        missingStudentId: !studentId,
        missingClientRecordId: !clientRecordId
      });
      continue;
    }

    const recordId = createRecordId(clientRecordId);

    try {
      if (await hasExistingClientRecord(clientRecordId)) {
        skipped += 1;
        results.push({
          clientRecordId,
          recordId,
          status: "duplicate",
          code: "",
          retryable: false
        });
        continue;
      }

      const document = buildRecordDocument({
        sourceSchemaVersion,
        recordId,
        module,
        recordType,
        record,
        student: verifiedStudent
      });
      const result = await recordsCollection.doc(recordId).set(document);

      if (result && result.code) {
        throw Object.assign(new Error("write experimentRecords failed"), {
          code: result.code
        });
      }

      inserted += 1;
      ids.push(recordId);
      results.push({
        clientRecordId,
        recordId,
        status: "stored",
        code: "",
        retryable: false
      });
    } catch (error) {
      failed += 1;
      results.push({
        clientRecordId,
        recordId,
        status: "failed",
        code: getErrorCode(error),
        retryable: true
      });
      console.error("save experiment record failed:", {
        module,
        recordType,
        code: getErrorCode(error)
      });
    }
  }

  return {
    ok: true,
    inserted,
    skipped,
    failed,
    ids,
    results
  };
};
