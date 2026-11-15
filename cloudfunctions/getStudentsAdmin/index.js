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

function matchesFilters(record, filters) {
  return Object.entries(filters).every(([key, value]) =>
    !value || text(record && record[key]).toLocaleLowerCase().includes(value.toLocaleLowerCase()));
}

exports.main = async (event) => {
  try {
    if (!await isTeacher()) {
      return { ok: false, code: "FORBIDDEN", message: "当前账号没有教师查看权限。", records: [], hasMore: false };
    }
    const input = body(event);
    const limit = normalizeLimit(input.limit);
    const skip = normalizeSkip(input.skip);
    const filters = {};
    ["studentId", "name", "class", "group"].forEach((key) => {
      if (text(input[key])) filters[key] = text(input[key]);
    });
    let items;
    if (!Object.keys(filters).length) {
      const result = await students.orderBy("studentId", "asc").skip(skip).limit(limit + 1).get();
      if (result && result.code) throw new Error("QUERY_FAILED");
      items = Array.isArray(result.data) ? result.data : [];
    } else {
      items = [];
      for (let offset = 0; items.length <= skip + limit; offset += 100) {
        const result = await students.orderBy("studentId", "asc").skip(offset).limit(100).get();
        if (result && result.code) throw new Error("QUERY_FAILED");
        const page = Array.isArray(result.data) ? result.data : [];
        items.push(...page.filter((record) => matchesFilters(record, filters)));
        if (page.length < 100) break;
      }
    }
    const pageItems = Object.keys(filters).length ? items.slice(skip) : items;
    return {
      ok: true,
      records: pageItems.slice(0, limit).map(publicStudent),
      hasMore: pageItems.length > limit,
      skip,
      limit
    };
  } catch (error) {
    return { ok: false, code: "QUERY_FAILED", message: "读取学生名单失败。", records: [], hasMore: false };
  }
};

exports.__test = { normalizeLimit, normalizeSkip, publicStudent, matchesFilters };
