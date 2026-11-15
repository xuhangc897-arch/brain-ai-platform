"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const teachers = db.collection("teachers");
const memories = db.collection("student_memories");

function currentUid() {
  const context = typeof cloudbase.getCloudbaseContext === "function"
    ? cloudbase.getCloudbaseContext()
    : {};
  return String(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID || "").trim();
}

async function requireTeacher() {
  const uid = currentUid();
  if (!uid) return null;
  const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get();
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

function normalizeLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(200, Math.floor(number))) : 100;
}

exports.main = async (event) => {
  const teacher = await requireTeacher();
  if (!teacher) return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师查看权限。", records: [] };
  const payload = event && typeof event === "object" ? event : {};
  const condition = {};
  ["experimentId", "memoryType"].forEach((key) => {
    const value = String(payload[key] || "").trim();
    if (value) condition[key] = value;
  });
  const personKeys = ["studentId", "studentName", "className", "groupName"];
  const personFilter = personKeys.some((key) => String(payload[key] || "").trim());
  const skip = Math.max(0, Number(payload.skip) || 0);
  const limit = normalizeLimit(payload.limit);
  if (!personFilter) {
    const result = await memories.where(condition).orderBy("updatedAt", "desc").skip(skip).limit(limit).get();
    return { ok: true, records: Array.isArray(result.data) ? result.data : [] };
  }
  const matched = [];
  for (let offset = 0; matched.length < skip + limit; offset += 100) {
    const result = await memories.where(condition).orderBy("updatedAt", "desc").skip(offset).limit(100).get();
    const page = Array.isArray(result.data) ? result.data : [];
    matched.push(...page.filter((record) => personKeys.every((key) => !String(payload[key] || "").trim() || String(record[key] || "").toLocaleLowerCase().includes(String(payload[key]).trim().toLocaleLowerCase()))));
    if (page.length < 100) break;
  }
  return { ok: true, records: matched.slice(skip, skip + limit) };
};
