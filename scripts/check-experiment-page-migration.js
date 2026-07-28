"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "assets", "experiment-registry.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "assets", "platform-core.js"), "utf8");
const runtimeSource = fs.readFileSync(path.join(root, "assets", "experiment-page-runtime.js"), "utf8");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createRuntime(initialStorage = {}) {
  const window = {
    localStorage: createStorage(initialStorage),
    getStudentIdentityFields() {
      return {
        studentId: "LOGIN-001",
        studentName: "登录学生",
        className: "七年级一班",
        groupName: "第一组",
        createdAt: "identity-created-at"
      };
    }
  };
  const context = { window, console, Date, structuredClone, encodeURIComponent };
  vm.runInNewContext(registrySource, context);
  vm.runInNewContext(coreSource, context);
  vm.runInNewContext(runtimeSource, context);
  return window;
}

function mergeState(base, incoming) {
  const merged = structuredClone(base);
  Object.assign(merged, incoming);
  merged.fields = Object.assign({}, base.fields, incoming.fields || {});
  return merged;
}

const memoryKey = "memory-capacity-state-v1";
const contextKey = "science-inquiry-context-v1";
const validWindow = createRuntime({
  [memoryKey]: JSON.stringify({
    currentStep: 2,
    studentId: "SAVED-001",
    fields: { answer: "历史答案" }
  }),
  [contextKey]: JSON.stringify({
    studentId: "CONTEXT-001",
    studentName: "上下文学生",
    groupId: "上下文小组"
  })
});
const memoryRuntime = validWindow.BrainExperimentPageRuntime.create("memory");
const defaultState = {
  currentStep: 0,
  studentId: "",
  studentName: "",
  groupId: "",
  fields: { answer: "", untouched: "默认值" }
};
const loaded = memoryRuntime.loadState({
  defaultState,
  mergeState,
  applyContext(state, inquiryContext) {
    state.studentId = inquiryContext.studentId || state.studentId;
    state.studentName = inquiryContext.studentName || state.studentName;
    state.groupId = inquiryContext.groupId || state.groupId;
  }
});

assert.strictEqual(memoryRuntime.storageKey, memoryKey);
assert.strictEqual(memoryRuntime.contextKey, contextKey);
assert.strictEqual(loaded.currentStep, 2);
assert.strictEqual(loaded.fields.answer, "历史答案");
assert.strictEqual(loaded.fields.untouched, "默认值");
assert.strictEqual(loaded.studentId, "LOGIN-001");
assert.strictEqual(loaded.studentName, "登录学生");
assert.strictEqual(loaded.groupId, "上下文小组");
assert.strictEqual(loaded.className, "七年级一班");
assert.strictEqual(loaded.groupName, "第一组");

const brokenStateWindow = createRuntime({
  [memoryKey]: "{broken",
  [contextKey]: JSON.stringify({ groupId: "保留上下文" })
});
const recovered = brokenStateWindow.BrainExperimentPageRuntime.create("memory").loadState({
  defaultState,
  mergeState,
  applyContext(state, inquiryContext) {
    state.groupId = inquiryContext.groupId;
  }
});
assert.strictEqual(brokenStateWindow.localStorage.getItem(memoryKey), null);
assert.strictEqual(recovered.groupId, "保留上下文");
assert.strictEqual(recovered.studentId, "LOGIN-001");

const brokenContextWindow = createRuntime({
  [memoryKey]: JSON.stringify({ currentStep: 3 }),
  [contextKey]: "{broken"
});
const recoveredContext = brokenContextWindow.BrainExperimentPageRuntime.create("memory").loadState({
  defaultState,
  mergeState,
  applyContext() {}
});
assert.strictEqual(brokenContextWindow.localStorage.getItem(contextKey), null);
assert.strictEqual(recoveredContext.currentStep, 3);
assert.strictEqual(recoveredContext.studentId, "LOGIN-001");

const nbackKey = "nback-inquiry-state-v1";
const fallbackWindow = createRuntime({
  [nbackKey]: JSON.stringify({ currentStep: 4 }),
  [contextKey]: "{broken"
});
const fallbackDefault = {
  currentStep: 0,
  studentId: "",
  fields: { answer: "默认值" }
};
const fallback = fallbackWindow.BrainExperimentPageRuntime.create("nback").loadState({
  defaultState: fallbackDefault,
  mergeState,
  errorMode: "fallback",
  applyContext() {}
});
assert.strictEqual(fallbackWindow.localStorage.getItem(contextKey), "{broken");
assert.deepStrictEqual(fallback, fallbackDefault);
assert.notStrictEqual(fallback, fallbackDefault);
assert.strictEqual(fallback.studentId, "");

const saveWindow = createRuntime();
const savedState = {
  studentId: "OLD",
  fields: { synced: false }
};
saveWindow.BrainExperimentPageRuntime.create("poster").saveState(savedState, {
  beforeSave() {
    savedState.fields.synced = true;
  }
});
const persisted = JSON.parse(saveWindow.localStorage.getItem("poster-making-state-v1"));
assert.strictEqual(persisted.fields.synced, true);
assert.strictEqual(persisted.studentId, "LOGIN-001");
assert.strictEqual(persisted.studentName, "登录学生");
assert.match(persisted.savedAt, /^\d{4}-\d{2}-\d{2}T/);
assert.strictEqual(savedState.savedAt, persisted.savedAt);

assert.throws(
  () => saveWindow.BrainExperimentPageRuntime.create("screening"),
  /未知实验页面模块/
);

const pages = {
  "memory.html": "memory",
  "nback.html": "nback",
  "interference.html": "interference",
  "strategies.html": "strategies",
  "poster.html": "poster"
};
for (const [page, moduleId] of Object.entries(pages)) {
  const source = fs.readFileSync(path.join(root, page), "utf8");
  const bridgeIndex = source.indexOf("assets/experiment-bridge.js");
  const runtimeIndex = source.indexOf("assets/experiment-page-runtime.js");
  assert(bridgeIndex >= 0, `${page} 缺少实验桥接`);
  assert(runtimeIndex > bridgeIndex, `${page} 必须在实验桥接后加载页面运行时`);
  assert(
    source.includes(`BrainExperimentPageRuntime.create("${moduleId}")`),
    `${page} 未绑定正确的实验模块`
  );
  assert(!/JSON\.parse\(localStorage\.getItem\(STORAGE_KEY\)/.test(source), `${page} 仍直接解析状态`);
  assert(!/localStorage\.setItem\(STORAGE_KEY/.test(source), `${page} 仍直接保存状态`);
}

console.log("Five experiment page state lifecycle migration checks passed.");
