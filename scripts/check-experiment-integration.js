"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "assets", "experiment-registry.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "assets", "platform-core.js"), "utf8");
const integrationSource = fs.readFileSync(path.join(root, "assets", "experiment-integration.js"), "utf8");

const localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};
const window = { localStorage };
const context = { window, console, Date, structuredClone, encodeURIComponent };
vm.runInNewContext(registrySource, context);
vm.runInNewContext(coreSource, context);
vm.runInNewContext(integrationSource, context);

const integration = window.BrainExperimentIntegration;

assert.strictEqual(integration.getModule("memory").route, "memory.html");
assert.strictEqual(integration.getModuleLabel("nback"), "N-back 工作记忆");
assert.strictEqual(integration.getModuleLabel("unknown"), "unknown");
assert.strictEqual(integration.getModuleFromPath("/platform/memory.html").id, "memory");
assert.strictEqual(integration.getModuleFromPath("\\platform\\poster.html?preview=1").id, "poster");
assert.strictEqual(integration.getModuleFromPath("/platform/unknown.html"), null);

assert.strictEqual(
  integration.resolveSourceModule("strategies", "/platform/memory.html"),
  "strategies"
);
assert.strictEqual(
  integration.resolveSourceModule("", "/platform/interference.html"),
  "interference"
);
assert.strictEqual(
  integration.resolveSourceModule("aiChat", "/platform/pretest.html"),
  "screening"
);
assert.strictEqual(
  integration.resolveSourceModule("unknown", "/platform/unknown.html"),
  ""
);

assert.strictEqual(integration.resolveReportActivity("poster", "memory").id, "poster");
assert.strictEqual(integration.resolveReportActivity("screening", "memory").id, "memory");
assert.strictEqual(integration.resolveReportActivity("unknown", "memory").id, "memory");

const record = {
  data: {
    sourceModule: "memory",
    fullState: { currentStep: 3 }
  }
};
assert.strictEqual(integration.getRecordPayload(record).sourceModule, "memory");
assert.strictEqual(integration.getRecordState(record).currentStep, 3);
assert.strictEqual(JSON.stringify(integration.getRecordPayload(null)), "{}");
assert.strictEqual(JSON.stringify(integration.getRecordState({ data: { value: 1 } })), '{"value":1}');

const dispatcher = integration.createModuleDispatcher({
  memory(value) {
    return `memory:${value}`;
  },
  aiChat(value) {
    return `ai:${value}`;
  }
}, (value) => `fallback:${value}`);
assert.strictEqual(dispatcher.has("memory"), true);
assert.strictEqual(dispatcher.has("poster"), false);
assert.strictEqual(dispatcher.dispatch("memory", "one"), "memory:one");
assert.strictEqual(dispatcher.dispatch("aiChat", "two"), "ai:two");
assert.strictEqual(dispatcher.dispatch("unknown", "three"), "fallback:three");

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

assertOrder("review.html", "assets/experiment-integration.js", "assets/review.js");
assertOrder("admin/dashboard.html", "../assets/experiment-integration.js", "../cloudbase.js");
for (const page of [
  "memory.html",
  "nback.html",
  "interference.html",
  "strategies.html",
  "poster.html"
]) {
  assertOrder(page, "assets/experiment-integration.js", "assets/ai-assistant.js");
}

const pretestPage = read("pretest.html");
assert(!pretestPage.includes('id="studentAge"'), "pretest.html 不应显示学生年龄输入框");
assert(!pretestPage.includes('id="exportBtn"'), "pretest.html 不应显示导出 Excel 按钮");
for (const assistantAsset of [
  "assets/ai-assistant.css",
  "assets/voice-assistant.css",
  "assets/ai-assistant.js",
  "assets/voice-recorder.js",
  "assets/asr-client.js",
  "assets/voice-assistant.js"
]) {
  assert(!pretestPage.includes(assistantAsset), `pretest.html 不应加载 ${assistantAsset}`);
}

assert(read("assets/review.js").includes("integration.resolveReportActivity"));
assert(read("assets/ai-assistant.js").includes("integration.resolveSourceModule"));
assert(read("admin/dashboard.html").includes("stateSheetDispatcher.dispatch"));
assert(!read("admin/dashboard.html").includes('if (record.module === "nback") return buildNbackStateSheets(record)'));

console.log("Teacher dashboard, report and AI integration checks passed.");
