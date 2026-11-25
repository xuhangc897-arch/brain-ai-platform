"use strict";

const crypto = require("crypto");
const https = require("https");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const records = db.collection("ai_chat_records");
const students = db.collection("students");
const ROUTES = { memory: "memory.html", nback: "nback.html", interference: "interference.html", strategies: "strategies.html", poster: "poster.html" };
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;
const systemPrompt = "你是一个科学探究学习助手。只负责启发、提示和帮助学生梳理思路，不直接给出实验答案。不得回答知识后测、知识验证或调查问卷中的题目。回答尽量简洁，控制在100字以内。";
function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) { if (typeof event?.body === "string") { try { return JSON.parse(event.body); } catch (_) { return {}; } } return event?.body || event || {}; }
function header(event, name) { const headers = event?.headers || {}; const key = Object.keys(headers).find((item) => item.toLowerCase() === name); return key ? text(headers[key]) : ""; }
function session(event) {
  const secret = text(process.env.STUDENT_SESSION_SECRET);
  const parts = header(event, "authorization").replace(/^Bearer\s+/i, "").split(".");
  if (secret.length < 32 || parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64url");
  const left = Buffer.from(parts[1]); const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return value.version === 1 && ID_PATTERN.test(text(value.studentId)) && Number.isFinite(value.issuedAt) && Number.isFinite(value.expiresAt) && value.issuedAt <= now + 300 && value.expiresAt > now ? value : null;
  } catch (_) { return null; }
}
function recordId(turnId) { return `ai_${crypto.createHash("sha256").update(turnId).digest("hex")}`; }
function blocked(step) { return /(?:^|\s)posttest(?:\s|$)|侦探小结|知识后测|知识验证|调查问卷/.test(step); }
function askModel(input) {
  const requestBody = JSON.stringify({ model: "deepseek-flash", messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: `当前页面：${input.page}\n当前阶段：${input.step}\n学生问题：${input.question}` }
  ], max_tokens: 220, temperature: 0.4 });
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: "api.deepseek.com", path: "/chat/completions", method: "POST", timeout: 25000,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(requestBody), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }, (response) => {
      let raw = "";
      response.on("data", (chunk) => { raw += chunk; if (raw.length > 100000) request.destroy(new Error("RESPONSE_TOO_LARGE")); });
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`MODEL_HTTP_${response.statusCode}`));
        try { resolve(text(JSON.parse(raw).choices?.[0]?.message?.content).slice(0, 1200)); }
        catch (_) { reject(new Error("MODEL_INVALID_RESPONSE")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("MODEL_TIMEOUT")));
    request.on("error", reject);
    request.end(requestBody);
  });
}
async function readRecord(id) {
  const result = await records.where({ recordId: id }).limit(1).get();
  return Array.isArray(result.data) ? result.data[0] || null : null;
}
exports.main = async (event) => {
  const auth = session(event);
  if (!auth) return { ok: false, code: "UNAUTHORIZED", retryable: true };
  const input = body(event);
  const turnId = text(input.turnId); const question = text(input.question); const page = text(input.page);
  const step = text(input.step); const experimentId = text(input.experimentId);
  if (!ID_PATTERN.test(turnId) || !question || question.length > 500 || !step || !ROUTES[experimentId] || !page.endsWith(`/${ROUTES[experimentId]}`)) return { ok: false, code: "INVALID_RECORD", retryable: false };
  if (blocked(step)) return { ok: false, code: "ASSESSMENT_LOCKED", retryable: false };
  const id = recordId(`${auth.studentId}:${turnId}`);
  let existing;
  try { existing = await readRecord(id); }
  catch (_) { return { ok: false, code: "READ_FAILED", retryable: true }; }
  if (existing && (existing.studentId !== auth.studentId || existing.question !== question)) return { ok: false, code: "TURN_CONFLICT", retryable: false };
  if (existing?.status === "answered") return { ok: true, code: "DUPLICATE", answer: existing.answer, turnId };
  if (existing?.status === "pending" && Date.now() - Date.parse(existing.startedAt || 0) < 55000) return { ok: false, code: "IN_PROGRESS", retryable: true };
  const studentResult = await students.where({ studentId: auth.studentId }).limit(1).get();
  const student = studentResult.data?.[0];
  if (!student) return { ok: false, code: "UNKNOWN_STUDENT", retryable: false };
  try {
    const now = new Date().toISOString();
    const record = { recordId: id, schemaVersion: 2, clientRecordId: turnId, studentId: auth.studentId,
      studentName: text(student.name), className: text(student.class), groupName: text(student.group),
      experimentId, page, step, question, answer: "", timestamp: text(input.timestamp) || now,
      promptSource: input.promptSource === "reminder" ? "reminder" : "student", status: "pending", startedAt: now, uploadedAt: db.serverDate() };
    const saved = await records.doc(id).set(record);
    if (saved?.code) throw new Error("WRITE_FAILED");
  } catch (_) { return { ok: false, code: "WRITE_FAILED", retryable: true }; }
  if (!process.env.OPENAI_API_KEY) return { ok: false, code: "AI_NOT_CONFIGURED", retryable: true };
  try {
    const answer = await askModel({ question, page, step });
    if (!answer) throw new Error("EMPTY_ANSWER");
    const saved = await records.doc(id).update({ answer, status: "answered", answeredAt: db.serverDate() });
    if (saved?.code) throw new Error("WRITE_FAILED");
    return { ok: true, code: "STORED", answer, turnId };
  } catch (error) {
    const code = error.message === "WRITE_FAILED" ? "WRITE_FAILED" : "AI_FAILED";
    if (code === "AI_FAILED") {
      try { await records.doc(id).update({ status: "failed", failureCode: text(error.message).slice(0, 80) }); } catch (_) { /* The pending question remains visible. */ }
    }
    return { ok: false, code, retryable: code === "WRITE_FAILED" };
  }
};
exports.__test = { recordId, blocked };
