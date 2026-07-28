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

console.log("Platform identity, configuration and data contract checks passed.");
