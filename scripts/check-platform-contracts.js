"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const registrySource = fs.readFileSync(
  path.resolve(__dirname, "..", "assets", "experiment-registry.js"),
  "utf8"
);
const coreSource = fs.readFileSync(
  path.resolve(__dirname, "..", "assets", "platform-core.js"),
  "utf8"
);

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

function loadPlatform(initialStorage) {
  const window = {
    localStorage: createStorage(initialStorage)
  };
  vm.runInNewContext(registrySource, { window, console, Date });
  vm.runInNewContext(coreSource, { window, console, Date });
  return window;
}

const legacyStudent = {
  studentId: " 2026001 ",
  name: " 小明 ",
  class: " 七年级一班 ",
  group: " 第一组 ",
  mustChangePassword: true
};
const studentWindow = loadPlatform({
  studentSession: JSON.stringify(legacyStudent)
});
const studentSession = studentWindow.BrainPlatform.identity.readStudentSession();

assert.strictEqual(studentSession.schemaVersion, 1);
assert.strictEqual(studentSession.role, "student");
assert.strictEqual(studentSession.studentId, "2026001");
assert.strictEqual(studentSession.name, "小明");
assert.strictEqual(studentSession.class, "七年级一班");
assert.strictEqual(studentSession.group, "第一组");
assert.strictEqual(studentSession.mustChangePassword, true);

const guestWindow = loadPlatform();
const guestSession = guestWindow.BrainPlatform.identity.writeStudentSession({
  isGuest: true,
  studentId: "guest",
  name: "游客",
  class: "游客模式",
  group: "本地体验"
});
assert.strictEqual(guestSession.role, "guest");
assert.strictEqual(guestWindow.BrainPlatform.identity.isGuestSession(), true);
assert.strictEqual(
  guestWindow.BrainPlatform.identity.getStudentIdentityFields().studentId,
  "guest"
);

const brokenWindow = loadPlatform({ studentSession: "{broken" });
assert.strictEqual(brokenWindow.BrainPlatform.identity.readStudentSession(), null);
assert.strictEqual(brokenWindow.localStorage.getItem("studentSession"), null);

const payload = studentWindow.BrainPlatform.records.buildExperimentRecordPayload({
  module: "memory",
  recordType: "submission",
  records: [{
    runId: "run-1",
    createdAt: "2026-07-28 10:00:00"
  }]
}, studentSession);

assert.strictEqual(payload.schemaVersion, 2);
assert.strictEqual(payload.module, "memory");
assert.strictEqual(payload.recordType, "submission");
assert.strictEqual(payload.records[0].schemaVersion, 2);
assert.strictEqual(payload.records[0].studentId, "2026001");
assert.strictEqual(payload.records[0].studentName, "小明");
assert.strictEqual(
  payload.records[0].clientRecordId,
  "memory|submission|2026001|run-1||||2026-07-28 10:00:00"
);

assert.strictEqual(
  studentWindow.BrainPlatform.config.endpoints.studentLogin,
  "https://memory-detective-platfor-d369a42-1441391469.ap-shanghai.app.tcloudbase.com/studentLogin"
);
assert(studentWindow.BrainPlatform.contracts.modules.includes("aiChat"));
assert(studentWindow.BrainPlatform.contracts.recordTypes.includes("submission"));
assert.strictEqual(studentWindow.BrainPlatform.contracts.identitySchemaVersion, 1);
assert.strictEqual(studentWindow.BrainPlatform.contracts.recordSchemaVersion, 2);
assert.strictEqual(
  studentWindow.BrainPlatform.config.storageKeys.uploadOutbox,
  "experiment-upload-outbox-v1"
);

const loaderSource = fs.readFileSync(path.join(__dirname, "..", "assets", "cloudbase-loader.js"), "utf8");
const loadedScripts = [];
const teacherWindow = { setTimeout: () => 1, clearTimeout() {} };
const teacherDocument = {
  createElement() { return { remove() {} }; },
  head: {
    appendChild(script) {
      loadedScripts.push(script.src);
      if (script.src === "cloudbase.js") teacherWindow.BrainCloudBase = { loginTeacher() {} };
      script.onload();
    }
  }
};
vm.runInNewContext(loaderSource, { window: teacherWindow, document: teacherDocument, Promise });
assert.strictEqual(loadedScripts.length, 0, "CloudBase SDK must not load before teacher access");
teacherWindow.BrainCloudBaseLoader.load().then(async () => {
  assert.deepStrictEqual(loadedScripts, [
    "https://static.cloudbase.net/cloudbase-js-sdk/3.0.0/cloudbase.full.js",
    "cloudbase.js"
  ]);
  for (const page of ["index.html", "login.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert(!html.includes('<script src="https://static.cloudbase.net/'), `${page} still blocks on CloudBase SDK`);
    assert(html.includes('src="assets/cloudbase-loader.js"'));
  }
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const loginSource = fs.readFileSync(path.join(__dirname, "..", "login.html"), "utf8");
  const entrySource = indexSource.match(/\(async \(\) => \{[\s\S]*?(?=      const experience = document\.getElementById\("experience"\);)/)[0] + "})()";
  async function checkEntry(search, student) {
    let teacherChecks = 0;
    let redirect = "";
    const entryWindow = {
      location: { search, replace: (url) => { redirect = url; } },
      BrainPlatform: { identity: { readStudentSession: () => student, clearStudentSession() {} } },
      BrainCloudBaseLoader: { load: async () => {
        teacherChecks += 1;
        return { getTeacherLoginState: async () => ({ username: "教师" }) };
      } }
    };
    await vm.runInNewContext(entrySource, { window: entryWindow, URLSearchParams, checkLogin() {} });
    return { teacherChecks, redirect };
  }
  assert.deepStrictEqual(await checkEntry("", null), { teacherChecks: 0, redirect: "login.html" });
  assert.deepStrictEqual(await checkEntry("", { isGuest: true }), { teacherChecks: 0, redirect: "" });
  assert.deepStrictEqual(await checkEntry("?role=teacher", null), { teacherChecks: 1, redirect: "" });
  assert(loginSource.includes('window.location.href = "index.html?role=teacher"'));

  const authSource = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
  let guest = true;
  let dialog;
  const guestWindow = { BrainPlatform: { identity: { readStudentSession: () => ({ isGuest: guest }) } } };
  const guestDocument = {
    body: { appendChild(element) { dialog = element; } },
    createElement() {
      const buttons = { yes: { addEventListener(type, handler) { this.click = handler; }, focus() {} }, no: { addEventListener(type, handler) { this.click = handler; }, focus() {} } };
      return { style: {}, setAttribute() {}, innerHTML: "", buttons, querySelector(selector) { return buttons[selector.includes('"yes"') ? "yes" : "no"]; }, addEventListener() {}, showModal() {}, close() {}, remove() {} };
    }
  };
  vm.runInNewContext(authSource, { window: guestWindow, document: guestDocument, Promise });
  let decision = guestWindow.confirmGuestNextStep();
  dialog.buttons.no.click();
  assert.strictEqual(await decision, false);
  decision = guestWindow.confirmGuestNextStep();
  dialog.buttons.yes.click();
  assert.strictEqual(await decision, true);
  guest = false;
  assert.strictEqual(await guestWindow.confirmGuestNextStep(), true);

  for (const page of ["memory.html", "nback.html", "interference.html", "strategies.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const jumpSource = html.match(/async function goToStep\(targetStep\) \{[\s\S]*?\r?\n    \}(?=\r?\n\r?\n    async function goNextStep)/)?.[0];
    const nextStepSource = html.match(/async function goNextStep\(\) \{[\s\S]*?\r?\n    \}(?=\r?\n\r?\n    function hasText)/)?.[0];
    assert(jumpSource, `${page} 缺少阶段导航入口`);
    assert(nextStepSource, `${page} 缺少阶段切换入口`);
    for (const confirmed of [false, true]) {
      const state = { currentStep: 0, maxUnlockedStep: 0 };
      let saves = 0;
      const context = {
        state, steps: [{ id: "question" }, { id: "hypothesis" }],
        validateStep: () => true, isDeveloperMode: () => false,
        saveState: () => { saves += 1; }, renderApp() {}, showStepMessage() {},
        window: { isGuestSession: () => true, confirmGuestNextStep: async () => confirmed, LearningBehaviorTracker: { markStageSubmitted() {} } }
      };
      await vm.runInNewContext(`${nextStepSource}; goNextStep()`, context);
      assert.strictEqual(state.currentStep, confirmed ? 1 : 0, `${page} 的游客选择未生效`);
      assert.strictEqual(saves, confirmed ? 1 : 0, `${page} 在拒绝后仍保存了阶段`);

      const jumpState = { currentStep: 0, maxUnlockedStep: 1 };
      let jumpSaves = 0;
      const jumpContext = {
        state: jumpState, clampStepIndex: (step) => step, isDeveloperMode: () => false,
        preparePagedInputLifecycle() {}, saveState: () => { jumpSaves += 1; },
        renderApp() {}, showStepMessage() {},
        window: { isGuestSession: () => true, confirmGuestNextStep: async () => confirmed }
      };
      await vm.runInNewContext(`${jumpSource}; goToStep(1)`, jumpContext);
      assert.strictEqual(jumpState.currentStep, confirmed ? 1 : 0, `${page} 的阶段导航未遵守选择`);
      assert.strictEqual(jumpSaves, confirmed ? 1 : 0);
    }
    const studentState = { currentStep: 0, maxUnlockedStep: 0 };
    const studentContext = {
      state: studentState, steps: [{ id: "question" }, { id: "hypothesis" }],
      validateStep: () => true, isDeveloperMode: () => false,
      saveState() {}, renderApp() {}, showStepMessage() {},
      window: { isGuestSession: () => false, confirmGuestNextStep: () => { throw new Error("学生不应看到游客弹窗"); }, LearningBehaviorTracker: { markStageSubmitted() {} } }
    };
    await vm.runInNewContext(`${nextStepSource}; goNextStep()`, studentContext);
    assert.strictEqual(studentState.currentStep, 1, `${page} 的学生前进受阻`);
  }
  console.log("Platform identity, configuration and data contract checks passed.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
