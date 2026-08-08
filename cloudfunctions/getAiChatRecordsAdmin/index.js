"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const records = db.collection("ai_chat_records");
const legacyRecords = db.collection("experimentRecords");
const teachers = db.collection("teachers");
function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) { return event && typeof event.body === "string" ? (() => { try { return JSON.parse(event.body); } catch (error) { return {}; } })() : event && event.body || event || {}; }
function currentUid() { const context = typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {}; return text(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID); }
async function isTeacher() { const uid = currentUid(); if (!uid) return false; const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get(); return Array.isArray(result.data) && Boolean(result.data[0]); }
function fingerprint(log) { return crypto.createHash("sha256").update([log.studentId, log.experimentId, log.page, log.step, log.timestamp, log.question, log.answer].map(text).join("|")).digest("hex"); }
function timeValue(value) { if (!value) return 0; if (typeof value === "string") return Date.parse(value) || 0; if (value.$date) return Date.parse(value.$date) || 0; if (value.seconds) return Number(value.seconds) * 1000; return 0; }
function wrapper(log, sourceCollection) { return { module: "aiChat", recordType: "submission", studentId: log.studentId || "", studentName: log.studentName || "", className: log.className || "", groupName: log.groupName || "", createdAt: log.timestamp || "", uploadedAt: log.uploadedAt || log.timestamp || "", clientRecordId: log.clientRecordId || `legacy-ai-${fingerprint(log)}`, sourceCollection, data: { sourceModule: log.experimentId || "", path: log.page || "", logs: [{ studentId: log.studentId || "", studentName: log.studentName || "", className: log.className || "", groupName: log.groupName || "", experimentId: log.experimentId || "", path: log.page || "", currentStep: log.step || "", timestamp: log.timestamp || "", question: log.question || "", answer: log.answer || "" }], logCount: 1 } }; }
function flattenLegacy(record) { const data = record && (record.payload || record.data) || {}; return (Array.isArray(data.logs) ? data.logs : []).map((log) => wrapper({ studentId: log.studentId || record.studentId, studentName: log.studentName || record.studentName, className: log.className || record.className, groupName: log.groupName || log.groupId || record.groupName, experimentId: data.sourceModule || log.experimentId || "", page: log.path || data.path || "", step: log.currentStep || "", timestamp: log.timestamp || record.createdAt || "", question: log.question || "", answer: log.answer || "" }, "experimentRecords")); }
async function readAll(collection, condition) { const items = []; const pageSize = 500; while (true) { const result = await collection.where(condition).orderBy("uploadedAt", "desc").skip(items.length).limit(pageSize).get(); const batch = Array.isArray(result.data) ? result.data : []; items.push(...batch); if (batch.length < pageSize) return items; } }

exports.main = async (event) => {
  if (!await isTeacher()) return { ok: false, code: "FORBIDDEN", records: [] };
  const input = body(event); const limit = Math.max(1, Math.min(500, Number(input.limit) || 100)); const condition = {};
  ["studentId", "className", "groupName"].forEach((key) => { if (text(input[key])) condition[key] = text(input[key]); }); if (text(input.sourceModule)) condition.experimentId = text(input.sourceModule);
  const legacyCondition = { module: "aiChat", recordType: "submission" }; if (condition.studentId) legacyCondition.studentId = condition.studentId;
  const exportAll = Boolean(input.exportAll);
  const [currentItems, legacyItems] = exportAll
    ? await Promise.all([readAll(records, condition), readAll(legacyRecords, legacyCondition)])
    : await Promise.all([
      records.where(condition).orderBy("uploadedAt", "desc").limit(limit).get().then((result) => Array.isArray(result.data) ? result.data : []),
      legacyRecords.where(legacyCondition).orderBy("uploadedAt", "desc").limit(limit).get().then((result) => Array.isArray(result.data) ? result.data : [])
    ]);
  const combined = currentItems.map((item) => wrapper(item, "ai_chat_records")).concat(legacyItems.flatMap(flattenLegacy));
  const seen = new Set(); const deduped = combined.filter((item) => { const key = fingerprint(item.data.logs[0]); if (seen.has(key)) return false; seen.add(key); return true; });
  const from = text(input.dateFrom) ? Date.parse(`${text(input.dateFrom)}T00:00:00+08:00`) : 0; const to = text(input.dateTo) ? Date.parse(`${text(input.dateTo)}T23:59:59.999+08:00`) : Number.MAX_SAFE_INTEGER; const skip = Math.max(0, Number(input.skip) || 0);
  deduped.sort((left, right) => timeValue(right.uploadedAt || right.createdAt) - timeValue(left.uploadedAt || left.createdAt));
  const filtered = deduped.filter((record) => { const value = timeValue(record.uploadedAt || record.createdAt); return value >= from && value <= to; });
  return { ok: true, records: exportAll ? filtered : filtered.slice(skip, skip + limit) };
};

exports.__test = { wrapper, flattenLegacy, fingerprint, readAll };
