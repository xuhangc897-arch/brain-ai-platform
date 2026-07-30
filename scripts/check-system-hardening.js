"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const experimentPages = ["memory.html", "nback.html", "interference.html", "strategies.html"];
const sharedScripts = [
  "assets/ai-assistant.js",
  "assets/voice-assistant.js",
  "assets/learning-behavior-tracker.js",
  "assets/memory-partner.js",
  "assets/typing-support.js",
  "assets/task-relevance.js",
  "assets/student-memory.js",
  "assets/learning-diagnosis.js"
];

for (const page of experimentPages) {
  const source = read(page);
  for (const script of sharedScripts) {
    assert.strictEqual(
      (source.match(new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length,
      1,
      `${page}: ${script} must load exactly once`
    );
  }
  for (const initializer of [
    "LearningBehaviorTracker.init",
    "VirtualAgent.init",
    "TypingSupport.init",
    "TaskRelevance.init",
    "StudentMemory.init",
    "LearningDiagnosis.init"
  ]) {
    assert.strictEqual(
      (source.match(new RegExp(initializer.replace(".", "\\."), "g")) || []).length,
      1,
      `${page}: ${initializer} must run exactly once`
    );
  }
}

for (const file of [
  "assets/learning-behavior-tracker.js",
  "assets/typing-support.js",
  "assets/task-relevance.js",
  "assets/student-memory.js",
  "assets/learning-diagnosis.js"
]) {
  assert(!read(file).includes("setInterval("), `${file}: recurring intervals are not allowed`);
}

for (const file of [
  "assets/experiment-uploader.js",
  "assets/learning-behavior-tracker.js",
  "assets/typing-support.js",
  "assets/task-relevance.js"
]) {
  const source = read(file);
  assert(source.includes("Authorization:"), `${file}: signed student session header missing`);
  assert(!source.includes("XMLHttpRequest"), `${file}: synchronous XHR is not allowed`);
}

for (const file of [
  "cloudfunctions/saveExperimentRecord/index.js",
  "cloudfunctions/saveLearningRecord/index.js",
  "cloudfunctions/saveAgentIntervention/index.js",
  "cloudfunctions/checkTaskRelevance/index.js"
]) {
  const source = read(file);
  assert(source.includes("verifyStudentSession(event)"), `${file}: signed session validation missing`);
  assert(source.includes("STUDENT_MISMATCH"), `${file}: cross-student payload rejection missing`);
  assert(source.includes("crypto.timingSafeEqual"), `${file}: signature comparison must be timing safe`);
}

assert(read("assets/task-relevance.js").includes('digest("SHA-256"'));
assert(read("cloudfunctions/checkTaskRelevance/index.js").includes("cachedCheck(existing, hash)"));
assert(read("cloudfunctions/checkTaskRelevance/index.js").includes("MAX_CHECKS = 5"));
assert(read("cloudfunctions/saveLearningRecord/index.js").includes("recordId(record)"));
assert(read("cloudfunctions/saveAgentIntervention/index.js").includes("recordId(intervention)"));
assert(read("cloudfunctions/generateExperimentMemory/index.js").includes("total >= 4000"));
assert(read("cloudfunctions/generateExperimentMemory/index.js").includes("Math.min(800, 4000 - total)"));
assert(!read("cloudfunctions/generateLearningDiagnosis/index.js").includes("inputText:"),
  "final diagnosis must not send raw learning record text to AI");

for (const file of [
  "assets/ai-assistant.js",
  "assets/experiment-uploader.js",
  "cloudfunctions/saveExperimentRecord/index.js",
  "cloudfunctions/getExperimentRecords/index.js"
]) {
  const source = read(file);
  assert(!/console\.(?:log|info)\s*\(/.test(source), `${file}: production info/debug logging must be disabled`);
}

const secretPattern = /(?:(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}|OPENAI_API_KEY\s*[:=]\s*["'][^"']+["'])/;
for (const file of [
  "assets/platform-core.js",
  "assets/ai-assistant.js",
  "cloudfunctions/checkTaskRelevance/index.js",
  "cloudfunctions/generateExperimentMemory/index.js",
  "cloudfunctions/generateLearningDiagnosis/index.js"
]) {
  assert(!secretPattern.test(read(file)), `${file}: possible plaintext API key detected`);
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

const storage = createStorage();
const sandbox = {
  window: {
    localStorage: storage
  },
  structuredClone,
  encodeURIComponent,
  Date,
  JSON,
  Object,
  String,
  Array
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(read("assets/experiment-registry.js"), sandbox);
vm.runInNewContext(read("assets/platform-core.js"), sandbox);

const platform = sandbox.window.BrainPlatform;
platform.identity.writeStudentSession({
  studentId: "S001",
  name: "Student A",
  sessionToken: "token-a"
});
const keyA = platform.storage.scopedKey("memory-capacity-state-v1");
storage.setItem(keyA, JSON.stringify({ studentId: "S001", answer: "A draft" }));

platform.identity.writeStudentSession({
  studentId: "S002",
  name: "Student B",
  sessionToken: "token-b"
});
const keyB = platform.storage.scopedKey("memory-capacity-state-v1");
assert.notStrictEqual(keyA, keyB, "different students must have different browser storage keys");
assert.strictEqual(storage.getItem(keyB), null, "student B must not read student A local draft");

storage.setItem("pretestData", JSON.stringify({ studentId: "S001", completed: true }));
assert.strictEqual(
  storage.getItem(platform.storage.migrateScopedJson("pretestData")),
  null,
  "legacy state belonging to student A must not migrate into student B storage"
);

platform.identity.writeStudentSession({
  studentId: "S001",
  name: "Student A",
  sessionToken: "token-a"
});
assert.strictEqual(
  JSON.parse(storage.getItem(platform.storage.migrateScopedJson("pretestData"))).studentId,
  "S001",
  "legacy state may migrate only to the matching student"
);

console.log("System hardening, isolation, performance and privacy contracts passed.");
