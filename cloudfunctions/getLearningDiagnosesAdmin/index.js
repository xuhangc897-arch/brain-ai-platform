"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const teachers = db.collection("teachers");
const diagnoses = db.collection("learning_diagnoses");

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
  const condition = { recordType: "version" };
  ["studentId", "className"].forEach((key) => {
    const value = String(payload[key] || "").trim();
    if (value) condition[key] = value;
  });
  try {
    const result = await diagnoses
      .where(condition)
      .orderBy("generatedAt", "desc")
      .limit(normalizeLimit(payload.limit))
      .get();
    let records = Array.isArray(result.data) ? result.data : [];
    if (payload.latestOnly !== false) {
      const seen = new Set();
      records = records.filter((record) => {
        if (seen.has(record.studentId)) return false;
        seen.add(record.studentId);
        return true;
      });
    }
    return { ok: true, records };
  } catch (error) {
    console.error("getLearningDiagnosesAdmin failed", { code: error.code || error.errCode || "UNKNOWN" });
    return { ok: false, code: "QUERY_FAILED", message: "读取学习诊断失败。", records: [] };
  }
};
