"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const students = db.collection("students");
const teachers = db.collection("teachers");

function text(value) {
  return String(value == null ? "" : value).trim();
}

function body(event) {
  if (event && typeof event.body === "string") {
    try { return JSON.parse(event.body); } catch (error) { return {}; }
  }
  return event && event.body && typeof event.body === "object" ? event.body : event || {};
}

function currentUid() {
  const context = typeof cloudbase.getCloudbaseContext === "function" ? cloudbase.getCloudbaseContext() : {};
  return text(context.TCB_UUID || context.UID || context.OPENID || context.WX_OPENID);
}

async function isTeacher() {
  const uid = currentUid();
  if (!uid) return false;
  const result = await teachers.where({ uid, active: true, role: "teacher" }).limit(1).get();
  return Array.isArray(result.data) && Boolean(result.data[0]);
}

function normalizeLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(100, Math.floor(number))) : 100;
}

function normalizeSkip(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function publicStudent(record) {
  return {
    studentId: text(record && record.studentId),
    name: text(record && record.name),
    class: text(record && record.class),
    group: text(record && record.group),
    createdAt: record && record.createdAt || null,
    updatedAt: record && record.updatedAt || null
  };
}

exports.main = async (event) => {
  try {
    if (!await isTeacher()) {
      return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师查看权限。", records: [], hasMore: false };
    }
    const input = body(event);
    const limit = normalizeLimit(input.limit);
    const skip = normalizeSkip(input.skip);
    const result = await students.orderBy("studentId", "asc").skip(skip).limit(limit + 1).get();
    if (result && result.code) {
      return { ok: false, code: "QUERY_FAILED", message: "读取学生名单失败。", records: [], hasMore: false };
    }
    const items = Array.isArray(result.data) ? result.data : [];
    return {
      ok: true,
      records: items.slice(0, limit).map(publicStudent),
      hasMore: items.length > limit,
      skip,
      limit
    };
  } catch (error) {
    return { ok: false, code: "QUERY_FAILED", message: "读取学生名单失败。", records: [], hasMore: false };
  }
};

exports.__test = { normalizeLimit, normalizeSkip, publicStudent };
