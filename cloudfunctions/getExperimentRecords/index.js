"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const RECORDS_COLLECTION = "experimentRecords";
const TEACHERS_COLLECTION = "teachers";

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();
const recordsCollection = db.collection(RECORDS_COLLECTION);
const teachersCollection = db.collection(TEACHERS_COLLECTION);

function currentUid() {
  const context = typeof cloudbase.getCloudbaseContext === "function"
    ? cloudbase.getCloudbaseContext()
    : {};
  return String(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID || "").trim();
}

async function isTeacher() {
  const uid = currentUid();
  if (!uid) return false;
  const result = await teachersCollection.where({ uid, active: true, role: "teacher" }).limit(1).get();
  return Array.isArray(result.data) && Boolean(result.data[0]);
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

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(1, Math.min(500, Math.floor(number)));
}

function normalizeSkip(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function parseDateStart(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00.000+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(`${text}T23:59:59.999+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRecordTime(record) {
  const value = record.uploadedAt || record.createdAt || (record.data && record.data.createdAt);
  if (!value) return null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value.$date) {
    const date = new Date(value.$date);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value.seconds) {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function matchesExtraFilters(record, filters) {
  if (filters.sourceModule && (!record.data || record.data.sourceModule !== filters.sourceModule)) {
    return false;
  }

  const recordTime = getRecordTime(record);
  if (filters.dateFrom && (!recordTime || recordTime < filters.dateFrom)) return false;
  if (filters.dateTo && (!recordTime || recordTime > filters.dateTo)) return false;
  return true;
}

exports.main = async (event) => {
  if (!await isTeacher()) {
    return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师查看权限。", records: [] };
  }
  const payload = parsePayload(event);
  const condition = {};

  ["module", "recordType", "studentId", "className", "groupName"].forEach((key) => {
    const value = normalizeText(payload[key]);
    if (value) condition[key] = value;
  });

  const limit = normalizeLimit(payload.limit);
  const skip = normalizeSkip(payload.skip);
  const extraFilters = {
    dateFrom: parseDateStart(payload.dateFrom),
    dateTo: parseDateEnd(payload.dateTo),
    sourceModule: normalizeText(payload.sourceModule)
  };
  const queryLimit = (extraFilters.dateFrom || extraFilters.dateTo || extraFilters.sourceModule)
    ? Math.min(500, Math.max(limit + skip, 500))
    : limit;

  console.log("getExperimentRecords query:", JSON.stringify({
    filterKeys: Object.keys(condition),
    limit,
    skip,
    hasDateFrom: Boolean(extraFilters.dateFrom),
    hasDateTo: Boolean(extraFilters.dateTo),
    hasSourceModule: Boolean(extraFilters.sourceModule)
  }));

  const result = await recordsCollection
    .where(condition)
    .orderBy("uploadedAt", "desc")
    .skip(extraFilters.dateFrom || extraFilters.dateTo || extraFilters.sourceModule ? 0 : skip)
    .limit(queryLimit)
    .get();

  if (result.code) {
    return {
      ok: false,
      code: result.code,
      message: "读取实验记录失败",
      records: []
    };
  }

  return {
    ok: true,
    records: (Array.isArray(result.data) ? result.data : [])
      .filter((record) => matchesExtraFilters(record, extraFilters))
      .slice(skip, skip + limit)
  };
};
