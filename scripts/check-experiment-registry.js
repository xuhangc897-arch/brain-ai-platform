"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "assets", "experiment-registry.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "assets", "platform-core.js"), "utf8");
const bridgeSource = fs.readFileSync(path.join(root, "assets", "experiment-bridge.js"), "utf8");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertOrder(relativePath, first, second) {
  const source = read(relativePath);
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0, `${relativePath} 缺少 ${first}`);
  assert(secondIndex >= 0, `${relativePath} 缺少 ${second}`);
  assert(firstIndex < secondIndex, `${relativePath} 必须先加载 ${first}`);
}

const localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};
const window = { localStorage };
const context = { window, console, Date, structuredClone, encodeURIComponent };
vm.runInNewContext(registrySource, context);
vm.runInNewContext(coreSource, context);

const registry = window.BrainExperimentRegistry;
assert.strictEqual(registry.version, 1);
assert.deepStrictEqual(
  Array.from(registry.moduleIds),
  ["memory", "nback", "interference", "strategies", "poster", "screening", "aiChat"]
);
assert.strictEqual(new Set(registry.moduleIds).size, registry.moduleIds.length);
assert.strictEqual(registry.experiments.length, 5);
assert.strictEqual(new Set(registry.experiments.map((entry) => entry.route)).size, 5);
assert.strictEqual(new Set(registry.experiments.map((entry) => entry.storageKey)).size, 5);
assert.strictEqual(registry.get("memory").route, "memory.html");
assert.strictEqual(registry.getReportUrl("poster"), "review.html?activityType=poster");
assert.strictEqual(registry.getReportUrl("screening"), "");
assert.strictEqual(registry.get("unknown"), null);

assert.deepStrictEqual(
  Array.from(window.BrainPlatform.contracts.modules),
  Array.from(registry.moduleIds)
);
for (const entry of registry.experiments) {
  assert.strictEqual(
    window.BrainPlatform.config.storageKeys.experiments[entry.id],
    entry.storageKey
  );
}
assert.strictEqual(
  window.BrainPlatform.config.storageKeys.pretest,
  registry.get("screening").storageKey
);
assert.strictEqual(
  window.BrainPlatform.config.storageKeys.aiChatLogs,
  registry.get("aiChat").storageKey
);

const calls = [];
window.uploadExperimentRecords = (payload) => {
  calls.push({ type: "upload", payload });
  return payload;
};
window.open = (url, target) => {
  calls.push({ type: "open", url, target });
};
vm.runInNewContext(bridgeSource, context);

const state = {
  studentId: "S001",
  studentName: "测试学生",
  className: "七年级",
  groupId: "第一组",
  fields: { synced: false }
};
window.BrainExperimentBridge.submitState({
  moduleId: "memory",
  state,
  submitAction: "generateReport",
  beforeSnapshot() {
    state.fields.synced = true;
  }
});

const upload = calls[0].payload;
const record = upload.records[0];
assert.strictEqual(upload.module, "memory");
assert.strictEqual(upload.recordType, "submission");
assert.strictEqual(record.submitAction, "generateReport");
assert.strictEqual(record.studentId, "S001");
assert.strictEqual(record.studentName, "测试学生");
assert.strictEqual(record.className, "七年级");
assert.strictEqual(record.groupName, "第一组");
assert.strictEqual(record.fullState.fields.synced, true);
assert.notStrictEqual(record.fullState, state);
assert.match(record.createdAt, /^\d{4}-\d{2}-\d{2}T/);
assert.strictEqual(
  record.clientRecordId,
  `memory|submission|S001|generateReport|${record.createdAt}`
);

window.BrainExperimentBridge.finishReport("memory", "submission-1");
assert.deepStrictEqual(
  calls.slice(1).map((call) => call.type),
  ["open"]
);
assert.strictEqual(calls[1].url, "review.html?activityType=memory&submissionId=submission-1");
assert.strictEqual(calls[1].target, "_blank");

const rootPages = [
  "index.html",
  "login.html",
  "review.html",
  "pretest.html",
  "memory.html",
  "nback.html",
  "interference.html",
  "strategies.html",
  "poster.html"
];
for (const page of rootPages) {
  assertOrder(page, "assets/experiment-registry.js", "assets/platform-core.js");
}
for (const page of ["admin/dashboard.html", "admin/initStudents.html"]) {
  assertOrder(page, "../assets/experiment-registry.js", "../assets/platform-core.js");
}
for (const page of [
  "pretest.html",
  "memory.html",
  "nback.html",
  "interference.html",
  "strategies.html",
  "poster.html"
]) {
  assertOrder(page, "assets/experiment-uploader.js", "assets/experiment-bridge.js");
  assert(!read(page).includes("|submission|${snapshot.studentId"), `${page} 仍包含重复提交 ID 拼装`);
}

const cloudFunctionSource = read("cloudfunctions/saveExperimentRecord/index.js");
const allowedModulesMatch = cloudFunctionSource.match(/const ALLOWED_MODULES = new Set\(\[([^\]]+)\]\)/);
assert(allowedModulesMatch, "保存云函数缺少 ALLOWED_MODULES");
const cloudModules = Array.from(allowedModulesMatch[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
assert.deepStrictEqual(cloudModules, Array.from(registry.moduleIds));

console.log("Experiment registry, shared submission and report bridge checks passed.");
