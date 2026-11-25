"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

const root = path.resolve(__dirname, "..");
const secret = "test-session-secret-with-at-least-thirty-two-characters";
const values = new Map();
let modelCalls = 0;
let sawPending = false;
const database = {
  collection(name) {
    if (name === "students") return { where() { return { limit() { return { async get() { return { data: [{ name: "学生", class: "一班", group: "一组" }] }; } }; } }; } };
    return { where(condition) { return { limit() { return { async get() { return { data: [...values.values()].filter((value) => value.recordId === condition.recordId) }; } }; } }; }, doc(id) { return {
      async get() { return { data: values.has(id) ? [values.get(id)] : [] }; },
      async set(value) { values.set(id, value); return {}; },
      async update(value) { values.set(id, { ...values.get(id), ...value }); return {}; }
    }; } };
  },
  serverDate() { return "server-time"; }
};
const https = {
  request(_options, callback) {
    modelCalls += 1;
    sawPending = [...values.values()].some((value) => value.status === "pending");
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      setImmediate(() => {
        response.emit("data", JSON.stringify({ choices: [{ message: { content: "请比较两组实验数据。" } }] }));
        response.emit("end");
      });
    };
    return request;
  }
};
const exportsObject = {};
function loadFunction(file, output) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), {
  require(name) {
    if (name === "@cloudbase/node-sdk") return { SYMBOL_CURRENT_ENV: "test", init: () => ({ database: () => database }) };
    if (name === "https") return https;
    return require(name);
  },
  exports: output, process: { env: { STUDENT_SESSION_SECRET: secret, OPENAI_API_KEY: "test-key" } },
  Buffer, Date, JSON, Number, String, Set, Object, Promise, console, setImmediate
  }, { filename: file });
}
loadFunction("cloudfunctions/askAiChat/index.js", exportsObject);
const payload = { version: 1, studentId: "S001", issuedAt: Math.floor(Date.now() / 1000) - 10, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const token = `${encoded}.${crypto.createHmac("sha256", secret).update(encoded).digest("base64url")}`;
const event = { headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({
  turnId: "turn-1", question: "为什么要比较两组数据？", experimentId: "memory", page: "/memory.html", step: "分析数据", timestamp: new Date().toISOString(), promptSource: "reminder"
}) };

(async () => {
  const first = await exportsObject.main(event);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.answer, "请比较两组实验数据。");
  assert.strictEqual(sawPending, true, "question must be saved before calling the model");
  assert.strictEqual([...values.values()][0].status, "answered");
  assert.strictEqual([...values.values()][0].promptSource, "reminder");
  const duplicate = await exportsObject.main(event);
  assert.strictEqual(duplicate.code, "DUPLICATE");
  assert.strictEqual(modelCalls, 1, "retry must not call the model again");
  const blocked = await exportsObject.main({ ...event, body: JSON.stringify({ ...JSON.parse(event.body), turnId: "turn-2", step: "侦探小结" }) });
  assert.strictEqual(blocked.code, "ASSESSMENT_LOCKED");
  assert.strictEqual(modelCalls, 1);
  const promptFunction = {};
  loadFunction("cloudfunctions/saveAiChatRecord/index.js", promptFunction);
  const prompt = await promptFunction.main({ headers: event.headers, body: JSON.stringify({ action: "prompt_event", promptEvent: {
    eventId: "prompt-1", experimentId: "memory", step: "memory:2", type: "dismissed", timestamp: new Date().toISOString()
  } }) });
  assert.strictEqual(prompt.ok, true);
  assert([...values.values()].some((value) => value.type === "dismissed" && value.studentId === "S001"));
  const assistant = fs.readFileSync(path.join(root, "assets/ai-assistant.js"), "utf8");
  assert.match(assistant, /stepState\.count \|\| 0\) >= 3/);
  assert.match(assistant, /state\.lastShownAt \|\| 0\) < 180000/);
  assert.match(assistant, /dismissed: true/);
  console.log("AI question persistence, idempotency and assessment lock checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
