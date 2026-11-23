"use strict";

const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
          async update(changes) { store.set(id, Object.assign({}, store.get(id), clone(changes))); return {}; },
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
    ai_chat_records: [
      { _id: "ai-1", studentId: "001", studentName: "王同学", className: "一班", groupName: "1组", experimentId: "memory", question: "测试", answer: "回答", timestamp: "2026-08-08T10:30:00.000Z" }
    ],
    student_memories: [
      { _id: "memory-1", studentId: "001", studentName: "王同学", className: "一班", groupName: "1组", experimentId: "memory", updatedAt: "2026-08-08T10:30:00.000Z" }
    ],
    learning_diagnoses: [
      { _id: "diagnosis-1", recordType: "version", studentId: "001", studentName: "王同学", className: "一班", groupName: "1组", generatedAt: "2026-08-08T10:30:00.000Z" }
    ],
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
  const filteredStudents = await getStudents.main({ studentId: "002", name: "李同学", class: "一班", group: "2组" });
  assert.strictEqual(filteredStudents.records.length, 1);
  assert.strictEqual(filteredStudents.records[0].studentId, "002");
  assert.strictEqual((await getStudents.main({ name: "不存在" })).records.length, 0);
  assert.strictEqual((await getStudents.main({ studentId: "00" })).records.length, 2);
  assert.strictEqual((await getStudents.main({ name: "李" })).records[0].studentId, "002");
  assert.strictEqual((await getStudents.main({ class: "一" })).records.length, 2);
  assert.strictEqual((await getStudents.main({ group: "2" })).records[0].studentId, "002");

  const updateStudent = load("cloudfunctions/updateStudentAdmin/index.js", mock.sdk);
  mock.setUid("");
  assert.strictEqual((await updateStudent.main({ studentId: "002", name: "李同学", class: "二班", group: "2组" })).code, "FORBIDDEN");
  mock.setUid("teacher-1");
  assert.strictEqual((await updateStudent.main({ studentId: "002", name: "李同学", class: "二班", group: "2组" })).code, "UPDATED");
  assert.strictEqual(mock.stores.students.get("s2").class, "二班");
  assert.strictEqual(mock.stores.students.get("s2").password, "secret-2");
  assert.strictEqual((await updateStudent.main({ studentId: "002", name: "李同学", class: "二班", group: "2组", password: "new-secret" })).code, "UPDATED");
  assert.strictEqual(mock.stores.students.get("s2").password, "new-secret");

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
  const updateRecord = load("cloudfunctions/updateExperimentRecordAdmin/index.js", mock.sdk);
  const edited = baseData();
  edited.answers = { question: "修正答案" };
  mock.setUid("");
  assert.strictEqual((await updateRecord.main({ sourceCollection: "experiment_submissions", recordId: created.recordId, data: edited })).code, "FORBIDDEN");
  mock.setUid("teacher-1");
  assert.strictEqual((await updateRecord.main({ sourceCollection: "experiment_submissions", recordId: created.recordId, data: edited })).code, "UPDATED");
  assert.strictEqual(mock.stores.experiment_submissions.get(created.recordId).answers.question, "修正答案");
  assert.strictEqual(mock.stores.experiment_submissions.get(created.recordId).studentId, "001");

  const submissionAdmin = load("cloudfunctions/getExperimentSubmissionsAdmin/index.js", mock.sdk);
  assert.strictEqual((await submissionAdmin.main({ studentName: "王同学", groupName: "1组" })).records.length, 1);
  assert.strictEqual((await submissionAdmin.main({ studentName: "王" })).records.length, 1);
  assert.strictEqual((await submissionAdmin.main({ studentId: "00" })).records.length, 1);
  assert.strictEqual((await submissionAdmin.main({ studentName: "其他同学" })).records.length, 0);
  const bulkMock = createMock({
    teachers: [{ _id: "t1", uid: "teacher-1", active: true, role: "teacher" }],
    experiment_submissions: Array.from({ length: 501 }, (_, index) => ({ _id: `bulk-${index}`, studentId: "001", studentName: index === 500 ? "目标学生" : "普通学生", experimentId: "screening", uploadedAt: "2026-08-08T10:30:00.000Z" })),
    experimentRecords: []
  });
  const bulkAdmin = load("cloudfunctions/getExperimentSubmissionsAdmin/index.js", bulkMock.sdk);
  assert.strictEqual((await bulkAdmin.main({ exportAll: true })).records.length, 501);
  assert.strictEqual((await bulkAdmin.main({ studentName: "目标" })).records.length, 1);
  const aiAdmin = load("cloudfunctions/getAiChatRecordsAdmin/index.js", mock.sdk);
  assert.strictEqual((await aiAdmin.main({ studentName: "王同学", sourceModule: "memory" })).records.length, 1);
  assert.strictEqual((await aiAdmin.main({ groupName: "1" })).records.length, 1);
  assert.strictEqual((await aiAdmin.main({ studentName: "王同学", sourceModule: "nback" })).records.length, 0);
  const memoryAdmin = load("cloudfunctions/getStudentMemoriesAdmin/index.js", mock.sdk);
  assert.strictEqual((await memoryAdmin.main({ studentName: "王同学", groupName: "1组" })).records.length, 1);
  assert.strictEqual((await memoryAdmin.main({ className: "一" })).records.length, 1);
  const diagnosisAdmin = load("cloudfunctions/getLearningDiagnosesAdmin/index.js", mock.sdk);
  assert.strictEqual((await diagnosisAdmin.main({ studentName: "王同学", groupName: "1组" })).records.length, 1);
  assert.strictEqual((await diagnosisAdmin.main({ studentId: "00" })).records.length, 1);
  Object.assign(mock.stores.experimentRecords.get("legacy-good"), { studentId: "001", studentName: "王同学", className: "一班", groupName: "1组" });
  const legacyRecordsAdmin = load("cloudfunctions/getExperimentRecords/index.js", mock.sdk);
  assert.strictEqual((await legacyRecordsAdmin.main({ studentId: "00" })).records.length, 1);
  const deleteRecord = load("cloudfunctions/deleteExperimentRecordAdmin/index.js", mock.sdk);
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "student_memories", recordId: "x" })).code, "INVALID_COLLECTION");
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "experimentRecords", recordId: "legacy-ai" })).code, "NOT_FORMAL_SUBMISSION");
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "experimentRecords", recordId: "legacy-good" })).code, "DELETED");
  assert.strictEqual((await deleteRecord.main({ sourceCollection: "experiment_submissions", recordId: created.recordId })).code, "DELETED");
  const legacyView = submissionAdmin.__test.asLegacyDashboardRecord({ _id: "legacy-id", recordType: "submission", module: "memory" });
  assert.strictEqual(legacyView.recordId, "legacy-id");
  assert.strictEqual(legacyView.sourceCollection, "experimentRecords");

  const initStudentsSource = fs.readFileSync(path.join(root, "admin/initStudents.html"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(root, "admin/dashboard.html"), "utf8");
  assert(initStudentsSource.includes('href="../index.html"'));
  assert(initStudentsSource.includes('name: "getStudentsAdmin"'));
  assert(initStudentsSource.includes('id="studentIdFilter"'));
  assert(initStudentsSource.includes('id="exportStudentsBtn"'));
  assert(initStudentsSource.includes('id="openExcelImportBtn"'));
  assert(initStudentsSource.includes('"导入成功！"'));
  assert(initStudentsSource.includes('name: "deleteStudentAdmin"'));
  assert(initStudentsSource.includes('name: "updateStudentAdmin"'));
  assert(dashboardSource.includes('name: "createExperimentRecordAdmin"'));
  assert(dashboardSource.includes('name: "deleteExperimentRecordAdmin"'));
  assert(dashboardSource.includes('name: "updateExperimentRecordAdmin"'));
  assert(!initStudentsSource.includes('window.db.collection("students")'));
  assert(!dashboardSource.includes('window.db.collection("experiment_submissions")'));

  const loadStudentsCode = initStudentsSource.slice(initStudentsSource.indexOf("    async function loadStudents()"), initStudentsSource.indexOf("    function openDeleteStudentDialog"));
  const accountRows = Array.from({ length: 105 }, (_, index) => ({ studentId: String(index + 1).padStart(3, "0"), name: index === 104 ? "新姓名" : "其他", class: "三班", group: "2组" }));
  let exportedWorkbook = null;
  const studentPage = { isLoggedIn: true, studentPrevBtn: {}, studentNextBtn: {}, exportStudentsBtn: {}, studentListStatus: {}, STUDENT_PAGE_SIZE: 100,
    studentPageSkip: 0, studentHasMore: false, currentStudents: [], filteredStudents: [], renderStudentList() {}, getErrorMessage: (error) => error.message,
    assertXlsxLoaded() {}, XLSX: { utils: { aoa_to_sheet: (rows) => ({ rows }), book_new: () => ({}), book_append_sheet: (workbook, sheet) => { workbook.sheet = sheet; } },
      writeFile: (workbook, filename) => { exportedWorkbook = { workbook, filename }; } },
    studentFilters: { studentId: { value: "" }, name: { value: "新姓" }, class: { value: "" }, group: { value: "" } },
    window: { app: { async callFunction({ data }) { return { result: { ok: true, records: accountRows.slice(data.skip, data.skip + data.limit), hasMore: data.skip + data.limit < accountRows.length } }; } } } };
  vm.createContext(studentPage);
  await vm.runInContext(`${loadStudentsCode}\nloadStudents()`, studentPage);
  assert.strictEqual(studentPage.currentStudents.length, 1);
  assert.strictEqual(studentPage.currentStudents[0].studentId, "105");
  assert.strictEqual(studentPage.studentListStatus.textContent, "共找到 1 个学生账号。");
  vm.runInContext("exportStudents()", studentPage);
  assert.strictEqual(exportedWorkbook.filename, "学生名单.xlsx");
  assert.deepStrictEqual(Array.from(exportedWorkbook.workbook.sheet.rows[0]), ["学号", "姓名", "班级", "小组"]);
  assert.strictEqual(exportedWorkbook.workbook.sheet.rows.length, 2);
  assert.deepStrictEqual(Array.from(exportedWorkbook.workbook.sheet.rows[1]), ["105", "新姓名", "三班", "2组"]);
  studentPage.studentFilters.name.value = "";
  await vm.runInContext("loadStudents()", studentPage);
  vm.runInContext("exportStudents()", studentPage);
  assert.strictEqual(exportedWorkbook.workbook.sheet.rows.length, 106, "导出应包含筛选后的全部分页");
  assert.strictEqual(exportedWorkbook.workbook.sheet.rows[1][0], "001", "学号应保持文本前导零");
  studentPage.studentFilters.name.value = "不存在的学生";
  await vm.runInContext("loadStudents()", studentPage);
  exportedWorkbook = null;
  vm.runInContext("exportStudents()", studentPage);
  assert.strictEqual(exportedWorkbook, null, "空筛选结果不应生成文件");

  const recordQueryCode = dashboardSource.slice(dashboardSource.indexOf("    function withCurrentProfile(record)"), dashboardSource.indexOf("    async function loadRecords()"));
  const oldRecord = { studentId: "105", studentName: "旧姓名", className: "旧班", groupName: "1组", createdAt: "2026-08-08T10:30:00.000Z",
    data: { studentId: "105", studentName: "旧姓名", className: "旧班", groupName: "1组", fullState: { studentId: "105", studentName: "旧姓名", className: "旧班", groupName: "1组" } } };
  const recordPage = { studentProfiles: new Map([["105", { studentId: "105", name: "新姓名", class: "三班", group: "2组" }]]),
    window: { app: { async callFunction({ data }) { assert.strictEqual(data.studentId, "105"); return { result: { ok: true, records: [clone(oldRecord), { studentId: "1105", studentName: "新姓名" }] } }; } } } };
  vm.createContext(recordPage);
  const queryRecords = vm.runInContext(`${recordQueryCode}\nfetchRecords`, recordPage);
  const linkedRecords = await queryRecords({ module: "memory", recordType: "submission", studentId: "", studentName: "新姓", className: "", groupName: "", limit: 100 });
  assert.strictEqual(linkedRecords.length, 1);
  assert.strictEqual(linkedRecords[0].studentName, "新姓名");
  assert.strictEqual(linkedRecords[0].className, "三班");
  assert.strictEqual(linkedRecords[0].groupName, "2组");
  assert.strictEqual(linkedRecords[0].data.fullState.studentName, "新姓名");
  assert.strictEqual(linkedRecords[0].data.fullState.groupName, "2组");
  assert.strictEqual(oldRecord.studentName, "旧姓名");

  const cloudbaseConfig = JSON.parse(fs.readFileSync(path.join(root, "cloudbase.json"), "utf8"));
  const configuredFunctions = new Set(cloudbaseConfig.functions.map((item) => item.name));
  ["getStudentsAdmin", "deleteStudentAdmin", "updateStudentAdmin", "createExperimentRecordAdmin", "deleteExperimentRecordAdmin", "updateExperimentRecordAdmin"].forEach((name) => assert(configuredFunctions.has(name)));

  console.log("Teacher student and experiment record management checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
