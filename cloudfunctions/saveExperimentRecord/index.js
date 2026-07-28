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
  const payload = parsePayload(event);
  const sourceSchemaVersion = Number(payload.schemaVersion) || LEGACY_SCHEMA_VERSION;
  const module = normalizeText(payload.module);
  const recordType = normalizeText(payload.recordType || "experiment");
  const records = Array.isArray(payload.records) ? payload.records : [];

  console.log("saveExperimentRecord payload:", JSON.stringify({
    sourceSchemaVersion,
    targetSchemaVersion: CURRENT_SCHEMA_VERSION,
    module,
    recordType,
    recordCount: records.length
  }));

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

  const ids = [];
  const results = [];
  const studentCache = new Map();
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

      let student = studentCache.get(studentId);
      if (student === undefined) {
        student = await findStudent(studentId);
        studentCache.set(studentId, student || null);
      }

      const document = buildRecordDocument({
        sourceSchemaVersion,
        recordId,
        module,
        recordType,
        record,
        student
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
