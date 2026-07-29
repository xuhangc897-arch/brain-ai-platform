"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const memories = db.collection("student_memories");
const students = db.collection("students");
const EXPERIMENT_ORDER = Object.freeze({ memory: 1, nback: 2, interference: 3, strategies: 4 });

function parsePayload(event) {
  if (event && typeof event.body === "string") {
    try { return JSON.parse(event.body); } catch (error) { return {}; }
  }
  return event && event.body && typeof event.body === "object" ? event.body : (event || {});
}

function getHeader(event, name) {
  const headers = event && event.headers && typeof event.headers === "object" ? event.headers : {};
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === target);
  return key ? String(headers[key] || "") : "";
}

function decodeBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

function verifyStudentSession(event) {
  const authorization = getHeader(event, "authorization");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const secret = String(process.env.STUDENT_SESSION_SECRET || "");
  if (!token || secret.length < 32) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let actual;
  try { actual = decodeBase64url(parts[1]); } catch (error) { return null; }
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  let payload;
  try { payload = JSON.parse(decodeBase64url(parts[0]).toString("utf8")); } catch (error) { return null; }
  if (
    payload.version !== 1 ||
    !String(payload.studentId || "").trim() ||
    Number(payload.expiresAt) <= Math.floor(Date.now() / 1000)
  ) return null;
  return payload;
}

function text(value, maxLength = 240) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function simplifyItem(item) {
  const evidence = Array.isArray(item && item.evidence)
    ? item.evidence.map((entry) => entry && entry.evidence).filter(Boolean).slice(-1)[0]
    : item && item.evidence;
  return {
    message: text(item && (item.message || evidence || item.summary)),
    stageId: text(item && item.stageId, 64),
    supportType: text(item && item.supportType, 64)
  };
}

exports.main = async (event) => {
  const session = verifyStudentSession(event);
  if (!session) {
    return { ok: false, code: "UNAUTHORIZED", message: "登录会话无效或已过期。", retryable: false };
  }

  const studentId = String(session.studentId).trim();
  const studentResult = await students.where({ studentId }).limit(1).get();
  if (!Array.isArray(studentResult.data) || !studentResult.data[0]) {
    return { ok: false, code: "STUDENT_NOT_FOUND", message: "学生账号不存在。", retryable: false };
  }

  const payload = parsePayload(event);
  const experimentId = text(payload.experimentId, 32);
  const result = await memories.where({ studentId }).limit(10).get();
  const records = Array.isArray(result.data) ? result.data : [];
  const experimentMemories = records
    .filter((record) => record.memoryType === "experiment")
    .sort((left, right) => Number(left.experimentOrder) - Number(right.experimentOrder));
  const overall = records.find((record) => record.memoryType === "overall") || {};
  const latest = experimentMemories[experimentMemories.length - 1] || {};
  const strengths = Array.isArray(overall.stableStrengths) && overall.stableStrengths.length
    ? overall.stableStrengths
    : (latest.summary && Array.isArray(latest.summary.strengths) ? latest.summary.strengths : []);
  const nextSupport = Array.isArray(overall.nextSupport) ? overall.nextSupport : [];

  return {
    ok: true,
    view: {
      completedExperiments: experimentMemories.map((record) => ({
        experimentId: record.experimentId,
        experimentOrder: record.experimentOrder,
        completedAt: record.completedAt
      })),
      strengths: strengths.slice(0, 3).map(simplifyItem),
      nextSuggestions: nextSupport.slice(0, 3).map(simplifyItem),
      contextualSupport: experimentId
        ? nextSupport.filter((item) => (
            (!item.targetExperimentId || item.targetExperimentId === experimentId) &&
            Number(EXPERIMENT_ORDER[item.sourceExperimentId] || 0) < Number(EXPERIMENT_ORDER[experimentId] || 0)
          )).slice(0, 4).map(simplifyItem)
        : []
    }
  };
};
