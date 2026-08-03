"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const records = db.collection("ai_chat_records");
const students = db.collection("students");
const EXPERIMENTS = new Set(["memory", "nback", "interference", "strategies", "poster"]);
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;
function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) { if (event && typeof event.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } } return event && event.body || event || {}; }
function header(event, name) { const headers = event && event.headers || {}; const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase()); return key ? text(headers[key]) : ""; }
function session(event) {
  const secret = text(process.env.STUDENT_SESSION_SECRET); const token = header(event, "authorization").replace(/^Bearer\s+/i, ""); const parts = token.split(".");
  if (secret.length < 32 || parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); const a = Buffer.from(parts[1]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const value = JSON.parse(Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); const now = Math.floor(Date.now() / 1000); return value.version === 1 && ID_PATTERN.test(text(value.studentId)) && Number.isFinite(value.issuedAt) && Number.isFinite(value.expiresAt) && value.issuedAt <= now + 300 && value.expiresAt > now ? value : null; } catch (error) { return null; }
}
function id(value) { return `ai_${crypto.createHash("sha256").update(value).digest("hex")}`; }
function valid(record, studentId) { return record && text(record.studentId) === studentId && EXPERIMENTS.has(text(record.experimentId)) && text(record.clientRecordId) && text(record.page) && text(record.step) && text(record.question) && text(record.answer) && text(record.timestamp); }

exports.main = async (event) => {
  const auth = session(event); if (!auth) return { ok: false, code: "UNAUTHORIZED", retryable: false };
  const record = body(event).record; if (!valid(record, text(auth.studentId))) return { ok: false, code: "INVALID_RECORD", retryable: false };
  const studentResult = await students.where({ studentId: text(auth.studentId) }).limit(1).get(); const student = Array.isArray(studentResult.data) ? studentResult.data[0] : null;
  if (!student) return { ok: false, code: "UNKNOWN_STUDENT", retryable: false };
  const recordId = id(text(record.clientRecordId));
  try { const existing = await records.doc(recordId).get(); if (Array.isArray(existing.data) && existing.data.length) return { ok: true, code: "DUPLICATE", recordId }; } catch (error) { /* Missing is expected. */ }
  try {
    const result = await records.doc(recordId).set({ recordId, schemaVersion: 1, clientRecordId: text(record.clientRecordId), studentId: text(auth.studentId), studentName: text(student.name), className: text(student.class), groupName: text(student.group), experimentId: text(record.experimentId), page: text(record.page), step: text(record.step), question: text(record.question), answer: text(record.answer), timestamp: text(record.timestamp), uploadedAt: db.serverDate() });
    if (result && result.code) throw Object.assign(new Error("write failed"), { code: result.code });
    return { ok: true, code: "STORED", recordId };
  } catch (error) { return { ok: false, code: error.code || "WRITE_FAILED", retryable: true }; }
};

exports.__test = { id, valid };
