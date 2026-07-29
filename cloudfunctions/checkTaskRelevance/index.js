"use strict";

const crypto = require("crypto");
const https = require("https");
const cloudbase = require("@cloudbase/node-sdk");
const taskConfigs = require("./task-config");

const SCHEMA_VERSION = 1;
const STUDENTS_COLLECTION = "students";
const INTERVENTIONS_COLLECTION = "agent_interventions";
const INTERVENTION_TYPE = "task_relevance";
const MAX_TEXT_LENGTH = 2000;
const MAX_CHECKS = 5;
const MAX_SEEN_HASHES = 50;
const MAX_PROMPTS = 2;
const DEEPSEEK_HOST = "api.deepseek.com";
const DEEPSEEK_PATH = "/chat/completions";
const MODEL = "deepseek-v4-flash";
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ACTIONS = new Set(["check", "interaction", "submit"]);
const INTERACTIONS = new Set(["view_task", "return_modify", "keep", "closed"]);
const TRIGGERS = new Set(["blur", "stage_complete", "stage_submit", "final_report", "prompt_shown"]);
const STATUSES = new Set([
  "relevant", "partially_relevant", "off_topic",
  "insufficient", "inappropriate", "uncertain"
]);
const REASON_CODES = new Set([
  "addresses_task", "partially_addresses_task", "unrelated_content",
  "too_little_content", "inappropriate_content", "uncertain",
  "empty_text", "below_minimum_length", "repeated_text", "invalid_text"
]);
const AI_REASON_BY_STATUS = Object.freeze({
  relevant: "addresses_task",
  partially_relevant: "partially_addresses_task",
  off_topic: "unrelated_content",
  insufficient: "too_little_content",
  inappropriate: "inappropriate_content",
  uncertain: "uncertain"
});
const INVALID_TEXTS = new Set([
  "不会", "不知道", "不懂", "随便", "没想法", "无", "没有", "不知道怎么写", "不会写"
]);
const taskMap = new Map(taskConfigs.map((task) => [`${task.experimentId}:${task.taskId}`, task]));

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const studentsCollection = db.collection(STUDENTS_COLLECTION);
const interventionsCollection = db.collection(INTERVENTIONS_COLLECTION);
let aiCaller = callDeepSeek;

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

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeText(value) {
  return clean(value).normalize("NFC").replace(/\s+/gu, " ");
}

function unicodeLength(value) {
  return Array.from(value || "").length;
}

function textHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function recordId(payload) {
  const composite = [
    payload.studentId,
    payload.experimentId,
    payload.stageId,
    payload.taskId,
    INTERVENTION_TYPE
  ].join("|");
  return `intervention_${crypto.createHash("sha256").update(composite).digest("hex")}`;
}

function taskFor(payload) {
  const task = taskMap.get(`${clean(payload.experimentId)}:${clean(payload.taskId)}`) || null;
  return task && task.stageId === clean(payload.stageId) ? task : null;
}

function allowedFields(action) {
  const common = ["schemaVersion", "action", "studentId", "experimentId", "stageId", "taskId", "pageId"];
  if (action === "check") return new Set([...common, "inputText", "trigger", "prompted"]);
  if (action === "interaction") return new Set([...common, "textHash", "interaction"]);
  if (action === "submit") return new Set([...common, "finalText", "trigger"]);
  return new Set(common);
}

function validate(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return result(false, "INVALID_REQUEST", "请求格式无效", false);
  }
  if (Number(payload.schemaVersion) !== SCHEMA_VERSION) {
    return result(false, "UNSUPPORTED_SCHEMA_VERSION", "不支持的数据版本", false);
  }
  if (!ACTIONS.has(payload.action)) {
    return result(false, "INVALID_ACTION", "操作类型无效", false);
  }
  if (Object.keys(payload).some((field) => !allowedFields(payload.action).has(field))) {
    return result(false, "UNKNOWN_FIELD", "请求包含未知字段", false);
  }
  for (const field of ["studentId", "experimentId", "stageId", "taskId"]) {
    if (!ID_PATTERN.test(clean(payload[field]))) {
      return result(false, "INVALID_IDENTIFIER", `${field} 格式无效`, false);
    }
  }
  if (clean(payload.studentId) === "guest") {
    return result(false, "INVALID_STUDENT", "游客记录不会保存", false);
  }
  if (!taskFor(payload)) {
    return result(false, "UNKNOWN_TASK", "任务配置不存在或与实验阶段不匹配", false);
  }
  if (clean(payload.pageId).length > 200) {
    return result(false, "PAGE_ID_TOO_LONG", "页面标识过长", false);
  }
  if (payload.action === "interaction") {
    if (!HASH_PATTERN.test(clean(payload.textHash))) {
      return result(false, "INVALID_HASH", "文本哈希无效", false);
    }
    if (!INTERACTIONS.has(payload.interaction)) {
      return result(false, "INVALID_INTERACTION", "交互类型无效", false);
    }
    return null;
  }
  const field = payload.action === "submit" ? "finalText" : "inputText";
  if (typeof payload[field] !== "string" || unicodeLength(payload[field]) > MAX_TEXT_LENGTH) {
    return result(false, "INVALID_TEXT", `文本必须是不超过 ${MAX_TEXT_LENGTH} 字的字符串`, false);
  }
  if (!TRIGGERS.has(payload.trigger)) {
    return result(false, "INVALID_TRIGGER", "检查触发位置无效", false);
  }
  if (payload.action === "check" && payload.prompted !== undefined && typeof payload.prompted !== "boolean") {
    return result(false, "INVALID_PROMPT_FLAG", "提示标记无效", false);
  }
  return null;
}

function localScreen(inputText, task) {
  const normalized = normalizeText(inputText);
  const compact = normalized.replace(/[\s，。！？、,.!?；;：:"'“”‘’（）()【】[\]{}]/gu, "");
  if (!compact) {
    return structuredResult("insufficient", 1, "empty_text", "尚未填写有效内容", "");
  }
  if (unicodeLength(compact) < task.minimumLength) {
    return structuredResult("insufficient", 1, "below_minimum_length", "内容还不足以进行相关性判断", "");
  }
  if (/^(.{1,3})\1{2,}$/u.test(compact)) {
    return structuredResult("insufficient", 1, "repeated_text", "内容主要由重复字符组成", "");
  }
  const invalidCandidate = compact.toLowerCase();
  if (INVALID_TEXTS.has(invalidCandidate)) {
    return structuredResult("insufficient", 1, "invalid_text", "内容暂时没有表达与任务有关的想法", "");
  }
  const meaningful = Array.from(compact).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
  if (unicodeLength(compact) >= task.minimumLength && meaningful / unicodeLength(compact) < 0.35) {
    return structuredResult("insufficient", 1, "invalid_text", "内容包含较多无法识别的符号", "");
  }
  return null;
}

function structuredResult(status, confidence, reasonCode, briefReason, supportHint) {
  return { status, confidence, reasonCode, briefReason, supportHint };
}

function validateAiResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some((field) =>
    !["status", "confidence", "reasonCode", "briefReason", "supportHint"].includes(field)
  )) return null;
  if (!STATUSES.has(value.status) || !REASON_CODES.has(value.reasonCode)) return null;
  if (AI_REASON_BY_STATUS[value.status] !== value.reasonCode) return null;
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (typeof value.briefReason !== "string" || unicodeLength(value.briefReason) > 120) return null;
  if (typeof value.supportHint !== "string" || unicodeLength(value.supportHint) > 200) return null;
  if (value.status === "partially_relevant" && !clean(value.supportHint)) return null;
  return structuredResult(
    value.status,
    Math.round(confidence * 100) / 100,
    value.reasonCode,
    clean(value.briefReason),
    clean(value.supportHint)
  );
}

function buildMessages(task, inputText) {
  const system = [
    "你是中学科学探究活动的任务相关性检查器。",
    "你只能判断学生输入是否回应当前任务，不能评价观点或结论是否科学正确，不能评分。",
    "不要给出标准答案，不要改写或替换学生回答。",
    "没有出现参考概念不等于偏题；必须根据整体语义判断。",
    "只有内容与任务明显无关时才返回 off_topic。拿不准时返回 uncertain。",
    "partially_relevant 的 supportHint 只能提出一个启发方向，不能泄露答案。",
    "只返回一个严格 JSON 对象，不要使用 Markdown 或附加文字。",
    '字段固定为 status、confidence、reasonCode、briefReason、supportHint。',
    'status 只能是 relevant、partially_relevant、off_topic、insufficient、inappropriate、uncertain。',
    "reasonCode 只能是 addresses_task、partially_addresses_task、unrelated_content、too_little_content、inappropriate_content、uncertain。"
  ].join("\n");
  const user = JSON.stringify({
    experiment: task.activityTopic,
    stage: task.stageId,
    taskTitle: task.taskTitle,
    taskInstruction: task.taskInstruction,
    activityTopic: task.activityTopic,
    referenceConcepts: task.referenceConcepts,
    studentInput: inputText,
    judgingStandard: "只识别明显偏题、无效输入或内容不足，不判断答案是否正确。"
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function callDeepSeek(task, inputText) {
  return new Promise((resolve, reject) => {
    if (!process.env.OPENAI_API_KEY) {
      reject(Object.assign(new Error("AI key unavailable"), { code: "AI_NOT_CONFIGURED" }));
      return;
    }
    const body = JSON.stringify({
      model: MODEL,
      messages: buildMessages(task, inputText),
      response_format: { type: "json_object" },
      max_tokens: 320,
      temperature: 0.1
    });
    const request = https.request({
      hostname: DEEPSEEK_HOST,
      path: DEEPSEEK_PATH,
      method: "POST",
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
        if (responseBody.length > 100000) request.destroy(new Error("AI response too large"));
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(Object.assign(new Error("AI service error"), { code: `AI_HTTP_${response.statusCode}` }));
          return;
        }
        try {
          const envelope = JSON.parse(responseBody);
          const content = envelope?.choices?.[0]?.message?.content;
          resolve(JSON.parse(content));
        } catch (error) {
          reject(Object.assign(new Error("AI response invalid"), { code: "AI_INVALID_JSON" }));
        }
      });
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("AI timeout"), { code: "AI_TIMEOUT" })));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
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

function cachedCheck(existing, hash) {
  return (existing?.checks || []).find((check) => check.textHash === hash) || null;
}

function checkResultFromRecord(check) {
  if (!check) return null;
  return structuredResult(
    check.status,
    check.confidence,
    check.reasonCode,
    check.briefReason,
    check.supportHint
  );
}

function interactionUpdates(interaction) {
  if (interaction === "view_task") return { taskRequirementViewed: true };
  if (interaction === "return_modify") return { returnedToModify: true };
  if (interaction === "keep") return { studentKeptAnswer: true };
  return { promptClosed: true };
}

function buildDocument(payload, task, student, existing, id, checkData) {
  const now = db.serverDate();
  const document = {
    schemaVersion: SCHEMA_VERSION,
    recordId: id,
    studentId: clean(payload.studentId),
    studentName: clean(student.name),
    className: clean(student.class),
    groupName: clean(student.group),
    experimentId: task.experimentId,
    stageId: task.stageId,
    taskId: task.taskId,
    pageId: clean(payload.pageId),
    interventionType: INTERVENTION_TYPE,
    checks: Array.isArray(existing?.checks) ? existing.checks.slice(-MAX_CHECKS) : [],
    checkedHashes: Array.isArray(existing?.checkedHashes) ? existing.checkedHashes.slice(-MAX_SEEN_HASHES) : [],
    initialText: clean(existing?.initialText),
    promptedText: clean(existing?.promptedText),
    modifiedText: clean(existing?.modifiedText),
    finalSubmittedText: clean(existing?.finalSubmittedText),
    promptCount: Math.min(MAX_PROMPTS, Number(existing?.promptCount || 0)),
    promptedHashes: Array.isArray(existing?.promptedHashes) ? existing.promptedHashes.slice(-MAX_PROMPTS) : [],
    taskRequirementViewed: Boolean(existing?.taskRequirementViewed),
    returnedToModify: Boolean(existing?.returnedToModify),
    studentKeptAnswer: Boolean(existing?.studentKeptAnswer),
    promptClosed: Boolean(existing?.promptClosed),
    modifiedAfterPrompt: Boolean(existing?.modifiedAfterPrompt),
    recheckedAfterModification: Boolean(existing?.recheckedAfterModification),
    finalStatus: clean(existing?.finalStatus),
    updatedAt: now
  };
  if (!existing) document.createdAt = now;

  if (payload.action === "interaction") {
    if (!document.promptedHashes.includes(clean(payload.textHash)) && document.promptCount < MAX_PROMPTS) {
      document.promptedHashes = [...document.promptedHashes, clean(payload.textHash)].slice(-MAX_PROMPTS);
      document.promptCount += 1;
      const promptText = [document.modifiedText, document.initialText].find((value) =>
        value && textHash(normalizeText(value)) === clean(payload.textHash)
      );
      if (!document.promptedText && promptText) document.promptedText = promptText;
    }
    Object.assign(document, interactionUpdates(payload.interaction));
    return document;
  }

  const sourceText = normalizeText(payload.action === "submit" ? payload.finalText : payload.inputText);
  if (!existing || !Object.prototype.hasOwnProperty.call(existing, "initialText")) {
    document.initialText = sourceText;
  }
  if (document.promptedText && sourceText !== document.promptedText && !document.modifiedText) {
    document.modifiedText = sourceText;
    document.modifiedAfterPrompt = true;
  }
  if (payload.action === "submit") document.finalSubmittedText = sourceText;

  if (checkData && !checkData.cached) {
    document.checks = [...document.checks, {
      textHash: checkData.hash,
      status: checkData.result.status,
      confidence: checkData.result.confidence,
      reasonCode: checkData.result.reasonCode,
      briefReason: checkData.result.briefReason,
      supportHint: checkData.result.supportHint,
      trigger: payload.trigger,
      checkedAt: now
    }].slice(-MAX_CHECKS);
  }
  if (checkData) {
    document.checkedHashes = Array.from(new Set([...document.checkedHashes, checkData.hash]))
      .slice(-MAX_SEEN_HASHES);
    document.finalStatus = checkData.result.status;
    if (document.modifiedAfterPrompt) document.recheckedAfterModification = true;
  }
  if (payload.action === "check" && payload.prompted === true &&
      document.promptCount < MAX_PROMPTS &&
      !document.promptedHashes.includes(checkData.hash)) {
    document.promptedText = sourceText;
    document.promptCount += 1;
    document.promptedHashes = [...document.promptedHashes, checkData.hash].slice(-MAX_PROMPTS);
  }
  return document;
}

async function evaluate(payload, task, existing) {
  const sourceText = normalizeText(payload.action === "submit" ? payload.finalText : payload.inputText);
  const hash = textHash(sourceText);
  const previous = cachedCheck(existing, hash);
  if (previous) return { hash, result: checkResultFromRecord(previous), cached: true };
  if ((existing?.checkedHashes || []).includes(hash)) {
    return {
      hash,
      result: structuredResult("uncertain", 0, "uncertain", "相同文本已经检查过", ""),
      cached: true
    };
  }

  const localResult = localScreen(sourceText, task);
  if (localResult) return { hash, result: localResult, cached: false };
  try {
    const raw = await aiCaller(task, sourceText);
    const validated = validateAiResult(raw);
    return {
      hash,
      result: validated || structuredResult("uncertain", 0, "uncertain", "AI 返回格式无效", ""),
      cached: false
    };
  } catch (error) {
    console.error("checkTaskRelevance AI call failed", { code: error?.code || "AI_ERROR" });
    return {
      hash,
      result: structuredResult("uncertain", 0, "uncertain", "AI 服务暂时不可用", ""),
      cached: false
    };
  }
}

function promptEligible(checkData, existing) {
  if (!checkData || Number(existing?.promptCount || 0) >= MAX_PROMPTS) return false;
  if ((existing?.promptedHashes || []).includes(checkData.hash)) return false;
  const value = checkData.result;
  return (value.status === "off_topic" && value.confidence >= 0.85) ||
    (value.status === "partially_relevant" && value.confidence >= 0.70 && Boolean(value.supportHint)) ||
    value.status === "insufficient";
}

exports.main = async (event) => {
  const payload = parsePayload(event);
  const validationError = validate(payload);
  if (validationError) return validationError;
  const task = taskFor(payload);
  const id = recordId(payload);

  try {
    const student = await findStudent(clean(payload.studentId));
    if (!student) return result(false, "STUDENT_NOT_FOUND", "未找到有效学生账号", false);
    const existing = await readExisting(id);
    if (payload.action === "interaction" && (
      !existing ||
      !(existing.checks || []).some((check) => check.textHash === clean(payload.textHash))
    )) {
      return result(false, "INTERVENTION_NOT_FOUND", "未找到对应的相关性提示记录", false);
    }
    const checkData = payload.action === "interaction" ? null : await evaluate(payload, task, existing);
    const eligible = promptEligible(checkData, existing);
    const document = buildDocument(payload, task, student, existing, id, checkData);
    if (existing) await interventionsCollection.doc(id).update(document);
    else await interventionsCollection.doc(id).set(document);
    return result(true, "", "", false, {
      recordId: id,
      operation: existing ? "updated" : "created",
      textHash: checkData?.hash || clean(payload.textHash),
      cached: Boolean(checkData?.cached),
      result: checkData?.result || undefined,
      promptEligible: eligible,
      promptCount: document.promptCount
    });
  } catch (error) {
    console.error("checkTaskRelevance failed", {
      code: error && (error.code || error.errCode || error.errorCode) || "UNKNOWN"
    });
    return result(false, "DATABASE_ERROR", "相关性记录暂未保存，学生可以继续完成任务", true);
  }
};

exports.__test = Object.freeze({
  normalizeText,
  unicodeLength,
  textHash,
  localScreen,
  validateAiResult,
  buildMessages,
  taskFor,
  setAiCaller(caller) {
    aiCaller = caller;
  },
  resetAiCaller() {
    aiCaller = callDeepSeek;
  }
});
