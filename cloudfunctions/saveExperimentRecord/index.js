"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const ENV_ID = "memory-detective-platfor-d369a42";
const STUDENTS_COLLECTION = "students";
const RECORDS_COLLECTION = "experimentRecords";
const ALLOWED_MODULES = new Set(["memory", "nback", "interference", "strategies", "poster", "screening", "aiChat"]);
const ALLOWED_RECORD_TYPES = new Set(["experiment", "state", "submission"]);

const app = cloudbase.init({
  env: ENV_ID
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

function getErrorMessage(error) {
  return (error && (error.message || error.errMsg || error.msg)) || String(error);
}

async function findStudent(studentId) {
  if (!studentId) return null;

  const result = await studentsCollection
    .where({ studentId })
    .limit(1)
    .get();

  if (result.code) {
    throw new Error(result.message || "query students failed");
  }

  const students = Array.isArray(result.data) ? result.data : [];
  return students[0] || null;
}

async function hasExistingClientRecord(clientRecordId) {
  if (!clientRecordId) return false;

  const result = await recordsCollection
    .where({ clientRecordId })
    .limit(1)
    .get();

  if (result.code) {
    throw new Error(result.message || "query experimentRecords failed");
  }

  return Array.isArray(result.data) && result.data.length > 0;
}

function buildRecordDocument({ module, recordType, record, student }) {
  const studentId = normalizeText(record.studentId);
  const createdAt = record.createdAt || new Date().toISOString();

  return {
    module,
    recordType,
    studentId,
    studentName: normalizeText((student && student.name) || record.studentName),
    className: normalizeText((student && student.class) || record.className),
    groupName: normalizeText((student && student.group) || record.groupName || record.groupId),
    data: record,
    clientRecordId: normalizeText(record.clientRecordId),
    createdAt,
    uploadedAt: db.serverDate()
  };
}

exports.main = async (event) => {
  const payload = parsePayload(event);
  const module = normalizeText(payload.module);
  const recordType = normalizeText(payload.recordType || "experiment");
  const records = Array.isArray(payload.records) ? payload.records : [];

  console.log("saveExperimentRecord payload:", JSON.stringify({
    module,
    recordType,
    recordCount: records.length
  }));

  if (!ALLOWED_MODULES.has(module)) {
    return {
      ok: false,
      code: "INVALID_MODULE",
      message: "不支持的实验模块"
    };
  }

  if (!ALLOWED_RECORD_TYPES.has(recordType)) {
    return {
      ok: false,
      code: "INVALID_RECORD_TYPE",
      message: "不支持的记录类型"
    };
  }

  if (records.length === 0) {
    return {
      ok: false,
      code: "EMPTY_RECORDS",
      message: "没有收到实验记录"
    };
  }

  const ids = [];
  let inserted = 0;
  let skipped = 0;

  for (const rawRecord of records) {
    const record = rawRecord && typeof rawRecord === "object" ? rawRecord : {};
    const studentId = normalizeText(record.studentId);
    const clientRecordId = normalizeText(record.clientRecordId);

    if (!studentId || !clientRecordId) {
      skipped += 1;
      console.warn("skip invalid record:", JSON.stringify({ studentId, clientRecordId }));
      continue;
    }

    if (await hasExistingClientRecord(clientRecordId)) {
      skipped += 1;
      continue;
    }

    const student = await findStudent(studentId);
    const doc = buildRecordDocument({ module, recordType, record, student });
    const result = await recordsCollection.add(doc);

    if (result.code) {
      throw new Error(result.message || "insert experimentRecords failed");
    }

    inserted += 1;
    ids.push(result.id || result._id || "");
  }

  return {
    ok: true,
    inserted,
    skipped,
    ids
  };
};
