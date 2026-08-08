"use strict";

const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function matches(document, condition) {
  return Object.entries(condition || {}).every(([key, value]) => document[key] === value);
}

function createMock(initial, currentUid = "teacher-1") {
  const stores = Object.fromEntries(Object.entries(initial).map(([name, values]) => [name, new Map(values.map((value) => [value._id, clone(value)]))]));
  let uid = currentUid;
  function collection(name) {
    if (!stores[name]) stores[name] = new Map();
    const store = stores[name];
    function query(condition = {}) {
      let offset = 0;
      let maximum = Infinity;
      let order = null;
      return {
        orderBy(key, direction) { order = { key, direction }; return this; },
        skip(value) { offset = Number(value) || 0; return this; },
        limit(value) { maximum = Number(value) || 0; return this; },
        async get() {
          let values = Array.from(store.values()).filter((item) => matches(item, condition));
          if (order) values.sort((left, right) => String(left[order.key] || "").localeCompare(String(right[order.key] || "")) * (order.direction === "desc" ? -1 : 1));
          return { data: clone(values.slice(offset, offset + maximum)) };
        }
      };
    }
    return {
      where(condition) { return query(condition); },
      orderBy(key, direction) { return query().orderBy(key, direction); },
      doc(id) {
        return {
          async get() { return { data: store.has(id) ? [clone(store.get(id))] : [] }; },
          async set(document) { store.set(id, Object.assign({ _id: id }, clone(document))); return {}; },
          async remove() { store.delete(id); return {}; }
        };
      }
    };
  }
  const sdk = {
    SYMBOL_CURRENT_ENV: "test",
    getCloudbaseContext: () => ({ TCB_UUID: uid }),
    init: () => ({ database: () => ({ collection, serverDate: () => ({ $date: "2026-08-08T00:00:00.000Z" }) }) })
  };
  return { sdk, stores, setUid(value) { uid = value; } };
}

function load(relativePath, sdk) {
  const filename = path.join(root, relativePath);
  delete require.cache[require.resolve(filename)];
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === "@cloudbase/node-sdk") return sdk;
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(filename); } finally { Module._load = originalLoad; }
}

function baseData() {
  return {
    answers: {},
    experimentResults: {},
    knowledgeQuiz: { attempts: [] },
    surveys: {},
    reflections: {},
    aiSummary: { usageCount: 0 }
  };
}

(async () => {
  const mock = createMock({
    teachers: [{ _id: "t1", uid: "teacher-1", active: true, role: "teacher" }],
    students: [
      { _id: "s2", studentId: "002", name: "李同学", class: "一班", group: "2组", password: "secret-2" },
      { _id: "s1", studentId: "001", name: "王同学", class: "一班", group: "1组", password: "secret-1" }
    ],
    experiment_submissions: [],
    experimentRecords: [
      { _id: "legacy-good", recordType: "submission", module: "memory" },
      { _id: "legacy-ai", recordType: "submission", module: "aiChat" }
    ]
  });

  const getStudents = load("cloudfunctions/getStudentsAdmin/index.js", mock.sdk);
  mock.setUid("");
  assert.strictEqual((await getStudents.main({ limit: 1 })).code, "FORBIDDEN");
  mock.setUid("teacher-1");
  const firstPage = await getStudents.main({ limit: 1, skip: 0 });
  assert.strictEqual(firstPage.ok, true);
  assert.strictEqual(firstPage.records[0].studentId, "001");
  assert.strictEqual(firstPage.hasMore, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(firstPage.records[0], "password"), false);

  const deleteStudent = load("cloudfunctions/deleteStudentAdmin/index.js", mock.sdk);
  assert.strictEqual((await deleteStudent.main({ studentId: "missing" })).code, "NOT_FOUND");
  assert.strictEqual((await deleteStudent.main({ studentId: "002" })).code, "DELETED");
  assert.strictEqual(mock.stores.students.has("s2"), false);
  mock.stores.students.set("duplicate-a", { _id: "duplicate-a", studentId: "001" });
  assert.strictEqual((await deleteStudent.main({ studentId: "001" })).code, "DUPLICATE_STUDENT_ID");
  mock.stores.students.delete("duplicate-a");

  const createRecord = load("cloudfunctions/createExperimentRecordAdmin/index.js", mock.sdk);
  assert.strictEqual((await createRecord.main({ studentId: "001", experimentId: "memory", submissionTime: "bad", data: baseData() })).code, "INVALID_SUBMISSION_TIME");
  const created = await createRecord.main({ studentId: "001", experimentId: "memory", submissionTime: "2026-08-08T10:30", data: baseData() });
  assert.strictEqual(created.code, "CREATED");
  const stored = mock.stores.experiment_submissions.get(created.recordId);
  assert.strictEqual(stored.studentName, "王同学");
  assert.strictEqual(stored.adminCreated, true);
  assert.strictEqual(stored.createdByUid, "teacher-1");

  const deleteRecord = load("cloudfunctions/deleteExperimentRecordAdmin/index.js", mock.sdk);
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "student_memories", recordId: "x" })).code, "INVALID_COLLECTION");
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "experimentRecords", recordId: "legacy-ai" })).code, "NOT_FORMAL_SUBMISSION");
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "experimentRecords", recordId: "legacy-good" })).code, "DELETED");
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "experiment_submissions", recordId: created.recordId })).code, "DELETED");

  const submissionAdmin = load("cloudfunctions/getExperimentSubmissionsAdmin/index.js", mock.sdk);
  const legacyView = submissionAdmin.__test.asLegacyDashboardRecord({ _id: "legacy-id", recordType: "submission", module: "memory" });
  assert.strictEqual(legacyView.recordId, "legacy-id");
  assert.strictEqual(legacyView.sourceCollection, "experimentRecords");

  const initStudentsSource = fs.readFileSync(path.join(root, "admin/initStudents.html"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(root, "admin/dashboard.html"), "utf8");
  assert(initStudentsSource.includes('href="../index.html"'));
  assert(initStudentsSource.includes('name: "getStudentsAdmin"'));
  assert(initStudentsSource.includes('name: "deleteStudentAdmin"'));
  assert(dashboardSource.includes('name: "createExperimentRecordAdmin"'));
  assert(dashboardSource.includes('name: "deleteExperimentRecordAdmin"'));
  assert(!initStudentsSource.includes('window.db.collection("students")'));
  assert(!dashboardSource.includes('window.db.collection("experiment_submissions")'));

  const cloudbaseConfig = JSON.parse(fs.readFileSync(path.join(root, "cloudbase.json"), "utf8"));
  const configuredFunctions = new Set(cloudbaseConfig.functions.map((item) => item.name));
  ["getStudentsAdmin", "deleteStudentAdmin", "createExperimentRecordAdmin", "deleteExperimentRecordAdmin"].forEach((name) => assert(configuredFunctions.has(name)));

  console.log("Teacher student and experiment record management checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
