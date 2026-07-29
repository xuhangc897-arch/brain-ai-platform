"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");

const SCHEMA_VERSION = 1;
const STUDENTS_COLLECTION = "students";
const INTERVENTIONS_COLLECTION = "agent_interventions";
const EXPERIMENTS = new Set(["memory", "nback", "interference", "strategies"]);
const RESPONSES = new Set(["accepted", "dismissed", "ignored"]);
const REASONS = new Set([
  "no_effective_text",
  "repeated_long_pauses",
  "deletion_pressure",
  "multiple_large_deletions",
  "repeated_focus_without_progress"
]);
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;
const ROOT_FIELDS = new Set([
  "schemaVersion", "studentId", "experimentId", "stageId", "taskId", "pageId",
  "interventionType", "triggerReasons", "triggerMetrics", "studentResponse",
  "voiceInsertSucceeded", "triggeredAt", "supportId", "supportMessage"
]);
const METRIC_FIELDS = [
  "observedDurationMs", "effectiveCharacterCount", "pauseCount", "longestPauseMs",
  "deleteCount", "largeDeleteCount", "focusCount"
];
const RESPONSE_PRIORITY = { ignored: 1, dismissed: 2, accepted: 3 };

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);
const interventionsCollection = db.collection(INTERVENTIONS_COLLECTION);

function result(ok, code, message, retryable, extra) {
  return Object.assign({ ok, code, message, retryable }, extra || {});
}

function parsePayload(event) {
  if (event && typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch (error) {
      return {};
    }
  }
  if (event && event.body && typeof event.body === "object") return event.body;
  return event || {};
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function recordId(intervention) {
  const composite = [
    intervention.studentId,
    intervention.experimentId,
    intervention.stageId,
    intervention.taskId,
    intervention.interventionType
  ].join("|");
  return `intervention_${crypto.createHash("sha256").update(composite).digest("hex")}`;
}

function validate(payload) {
  if (Object.keys(payload).some((key) => key !== "schemaVersion" && key !== "intervention")) {
    return result(false, "UNKNOWN_FIELD", "请求包含未知字段", false);
  }
  if (Number(payload.schemaVersion) !== SCHEMA_VERSION) {
    return result(false, "UNSUPPORTED_SCHEMA_VERSION", "不支持的数据版本", false);
  }
  const intervention = payload.intervention;
  if (!intervention || typeof intervention !== "object" || Array.isArray(intervention)) {
    return result(false, "INVALID_INTERVENTION", "干预记录格式无效", false);
  }
  if (Object.keys(intervention).some((key) => !ROOT_FIELDS.has(key))) {
    return result(false, "UNKNOWN_FIELD", "干预记录包含未知字段", false);
  }
  if (Number(intervention.schemaVersion) !== SCHEMA_VERSION) {
    return result(false, "UNSUPPORTED_SCHEMA_VERSION", "干预记录版本无效", false);
  }
  for (const field of ["studentId", "experimentId", "stageId", "taskId"]) {
    if (!ID_PATTERN.test(text(intervention[field]))) {
      return result(false, "INVALID_IDENTIFIER", `${field} 格式无效`, false);
    }
  }
  if (text(intervention.studentId) === "guest") {
    return result(false, "INVALID_STUDENT", "游客干预记录不会保存", false);
  }
  if (!EXPERIMENTS.has(text(intervention.experimentId))) {
    return result(false, "INVALID_EXPERIMENT", "实验标识无效", false);
  }
  if (!["suggest_voice_input", "memory_support"].includes(intervention.interventionType)) {
    return result(false, "INVALID_INTERVENTION_TYPE", "干预类型无效", false);
  }
  if (!RESPONSES.has(intervention.studentResponse)) {
    return result(false, "INVALID_RESPONSE", "学生响应无效", false);
  }
  if (intervention.interventionType === "memory_support") {
    if (!ID_PATTERN.test(text(intervention.supportId)) || !text(intervention.supportMessage) || text(intervention.supportMessage).length > 240) {
      return result(false, "INVALID_MEMORY_SUPPORT", "长期记忆支持内容无效", false);
    }
    if (!intervention.triggeredAt || Number.isNaN(Date.parse(intervention.triggeredAt))) {
      return result(false, "INVALID_TIMESTAMP", "触发时间格式无效", false);
    }
    return null;
  }
  if (typeof intervention.voiceInsertSucceeded !== "boolean") {
    return result(false, "INVALID_FLAG", "语音写入标记无效", false);
  }
  if (intervention.voiceInsertSucceeded && intervention.studentResponse !== "accepted") {
    return result(false, "INVALID_VOICE_RESULT", "只有接受语音建议后才能记录写入成功", false);
  }
  if (!Array.isArray(intervention.triggerReasons) || intervention.triggerReasons.length === 0 ||
      intervention.triggerReasons.some((reason) => !REASONS.has(reason))) {
    return result(false, "INVALID_TRIGGER_REASON", "触发原因无效", false);
  }
  const metrics = intervention.triggerMetrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics) ||
      Object.keys(metrics).some((key) => !METRIC_FIELDS.includes(key)) ||
      METRIC_FIELDS.some((key) => !Object.prototype.hasOwnProperty.call(metrics, key))) {
    return result(false, "INVALID_TRIGGER_METRICS", "触发指标格式无效", false);
  }
  for (const field of METRIC_FIELDS) {
    if (!Number.isSafeInteger(Number(metrics[field])) || Number(metrics[field]) < 0) {
      return result(false, "INVALID_METRIC", `${field} 必须为非负整数`, false);
    }
  }
  if (text(intervention.pageId).length > 200) {
    return result(false, "PAGE_ID_TOO_LONG", "页面标识过长", false);
  }
  if (!intervention.triggeredAt || Number.isNaN(Date.parse(intervention.triggeredAt))) {
    return result(false, "INVALID_TIMESTAMP", "触发时间格式无效", false);
  }
  return null;
}

async function findStudent(studentId) {
  const response = await studentsCollection.where({ studentId }).limit(1).get();
  if (response.code) throw new Error("student lookup failed");
  return Array.isArray(response.data) ? response.data[0] || null : null;
}

async function readExisting(id) {
  try {
    const response = await interventionsCollection.doc(id).get();
    return response && Array.isArray(response.data) ? response.data[0] || null : null;
  } catch (error) {
    const code = error && (error.code || error.errCode);
    if (code === "DATABASE_DOCUMENT_NOT_EXIST" || code === -502005) return null;
    throw error;
  }
}

function mergeResponse(existing, incoming) {
  const previous = existing && existing.studentResponse;
  if (!previous) return incoming;
  return RESPONSE_PRIORITY[incoming] > RESPONSE_PRIORITY[previous] ? incoming : previous;
}

function buildDocument(intervention, student, existing, id) {
  const serverNow = db.serverDate();
  if (intervention.interventionType === "memory_support") {
    const memoryDocument = {
      schemaVersion: SCHEMA_VERSION,
      recordId: id,
      studentId: text(intervention.studentId),
      studentName: text(student.name),
      className: text(student.class),
      groupName: text(student.group),
      experimentId: text(intervention.experimentId),
      stageId: text(intervention.stageId),
      taskId: text(intervention.taskId),
      pageId: text(intervention.pageId),
      interventionType: "memory_support",
      supportId: text(intervention.supportId),
      supportMessage: text(intervention.supportMessage).slice(0, 240),
      studentResponse: mergeResponse(existing, intervention.studentResponse),
      triggeredAt: existing?.triggeredAt || intervention.triggeredAt,
      updatedAt: serverNow
    };
    if (!existing) memoryDocument.createdAt = serverNow;
    return memoryDocument;
  }
  const document = {
    schemaVersion: SCHEMA_VERSION,
    recordId: id,
    studentId: text(intervention.studentId),
    studentName: text(student.name),
    className: text(student.class),
    groupName: text(student.group),
    experimentId: text(intervention.experimentId),
    stageId: text(intervention.stageId),
    taskId: text(intervention.taskId),
    pageId: text(intervention.pageId),
    interventionType: "suggest_voice_input",
    triggerReasons: existing?.triggerReasons || intervention.triggerReasons.slice(),
    triggerMetrics: existing?.triggerMetrics || Object.fromEntries(
      METRIC_FIELDS.map((field) => [field, Number(intervention.triggerMetrics[field])])
    ),
    studentResponse: mergeResponse(existing, intervention.studentResponse),
    voiceInsertSucceeded: Boolean(intervention.voiceInsertSucceeded || existing?.voiceInsertSucceeded),
    triggeredAt: existing?.triggeredAt || intervention.triggeredAt,
    updatedAt: serverNow
  };
  if (!existing) document.createdAt = serverNow;
  return document;
}

exports.main = async (event) => {
  const payload = parsePayload(event);
  const validationError = validate(payload);
  if (validationError) return validationError;

  const intervention = payload.intervention;
  const id = recordId(intervention);
  try {
    const student = await findStudent(text(intervention.studentId));
    if (!student) {
      return result(false, "STUDENT_NOT_FOUND", "未找到有效学生账号", false);
    }
    const existing = await readExisting(id);
    const document = buildDocument(intervention, student, existing, id);
    if (existing) {
      await interventionsCollection.doc(id).update(document);
    } else {
      await interventionsCollection.doc(id).set(document);
    }
    return result(true, "", "", false, {
      recordId: id,
      operation: existing ? "updated" : "created"
    });
  } catch (error) {
    console.error("saveAgentIntervention failed", {
      code: (error && (error.code || error.errCode || error.errorCode)) || "UNKNOWN"
    });
    return result(false, "DATABASE_ERROR", "干预记录暂未保存，将稍后重试", true);
  }
};
