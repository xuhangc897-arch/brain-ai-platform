"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Module = require("module");
const {
  TEST_STUDENT_SESSION_SECRET,
  createToken,
  authenticatedEvent
} = require("./test-student-session");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "assets", "experiment-registry.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "assets", "platform-core.js"), "utf8");
const uploaderSource = fs.readFileSync(path.join(root, "assets", "experiment-uploader.js"), "utf8");

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

function assertScriptOrder(file, first, second) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0, `${file} 缺少 ${first}`);
  assert(secondIndex >= 0, `${file} 缺少 ${second}`);
  assert(firstIndex < secondIndex, `${file} 必须先加载 ${first}`);
}

function loadCloudFunction(relativePath, database) {
  const filename = path.join(root, relativePath);
  const originalLoad = Module._load;
  Module._load = function load(request) {
    if (request === "@cloudbase/node-sdk") {
      return {
        SYMBOL_CURRENT_ENV: "CURRENT_ENV",
        getCloudbaseContext() {
          return { TCB_UUID: "teacher-uid" };
        },
        init(options) {
          assert.strictEqual(options.env, "CURRENT_ENV");
          return { database: () => database };
        }
      };
    }
    return originalLoad.apply(this, arguments);
  };

  delete require.cache[require.resolve(filename)];
  try {
    return require(filename);
  } finally {
    Module._load = originalLoad;
  }
}

async function main() {
  process.env.STUDENT_SESSION_SECRET = TEST_STUDENT_SESSION_SECRET;
  for (const page of [
    "index.html",
    "pretest.html",
    "memory.html",
    "nback.html",
    "interference.html",
    "strategies.html",
    "poster.html"
  ]) {
    assertScriptOrder(page, "assets/platform-core.js", "auth.js");
  }
  assertScriptOrder("login.html", "assets/platform-core.js", "const STUDENT_LOGIN_URL");
  assertScriptOrder("review.html", "assets/platform-core.js", "assets/review.js");
  assertScriptOrder("admin/dashboard.html", "../assets/platform-core.js", "../cloudbase.js");
  assertScriptOrder("admin/initStudents.html", "../assets/platform-core.js", "../cloudbase.js");

  const requests = [];
  const window = {
    localStorage: createStorage({
      studentSession: JSON.stringify({
        studentId: "S001",
        sessionToken: createToken("S001"),
        name: "测试学生",
        class: "七年级",
        group: "第一组"
      })
    }),
    fetch: async (url, options) => {
      requests.push({ url, options });
      const payload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          inserted: 1,
          skipped: 0,
          failed: 0,
          results: [{
            clientRecordId: payload.records[0].clientRecordId,
            status: "stored",
            code: "",
            retryable: false
          }]
        })
      };
    }
  };
  const context = {
    window,
    Date,
    console: {
      info() {},
      warn() {},
      error() {}
    }
  };
  vm.runInNewContext(registrySource, context);
  vm.runInNewContext(coreSource, context);
  vm.runInNewContext(uploaderSource, context);

  const uploadResult = await window.uploadExperimentRecords({
    module: "memory",
    recordType: "submission",
    records: [{ runId: "run-1", createdAt: "2026-07-28 10:00:00" }]
  });
  assert.strictEqual(uploadResult.ok, true);
  assert.strictEqual(requests.length, 1);
  assert.strictEqual(
    requests[0].url,
    window.BrainPlatform.config.endpoints.saveExperimentRecord
  );
  assert.strictEqual(
    requests[0].options.headers.Authorization,
    `Bearer ${createToken("S001")}`
  );
  const uploadPayload = JSON.parse(requests[0].options.body);
  assert.strictEqual(uploadPayload.schemaVersion, 2);
  assert.strictEqual(uploadPayload.records[0].schemaVersion, 2);
  assert.strictEqual(uploadPayload.records[0].studentId, "S001");
  assert.strictEqual(uploadPayload.records[0].studentName, "测试学生");
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    0
  );

  window.fetch = async () => {
    throw new Error("offline");
  };
  const deferred = await window.uploadExperimentRecords({
    module: "memory",
    recordType: "submission",
    records: [{ runId: "run-offline", createdAt: "2026-07-28 10:01:00" }]
  });
  assert.strictEqual(deferred.ok, false);
  assert.strictEqual(deferred.queued, 1);
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    1
  );
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries[0].attempts,
    1
  );

  const requestCountBeforeOtherStudent = requests.length;
  window.BrainPlatform.identity.writeStudentSession({
    studentId: "S002",
    sessionToken: createToken("S002"),
    name: "另一名学生",
    class: "七年级",
    group: "第二组"
  });
  let otherStudentFetches = 0;
  window.fetch = async () => {
    otherStudentFetches += 1;
    throw new Error("other student queue must not upload");
  };
  const otherStudentFlush = await window.flushExperimentUploadOutbox({ force: true });
  assert.strictEqual(otherStudentFlush.queued, 0);
  assert.strictEqual(requests.length, requestCountBeforeOtherStudent);
  assert.strictEqual(otherStudentFetches, 0);
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    1
  );

  window.BrainPlatform.identity.writeStudentSession({
    studentId: "S001",
    sessionToken: createToken("S001"),
    name: "测试学生",
    class: "七年级",
    group: "第一组"
  });
  window.fetch = async (url, options) => {
    requests.push({ url, options });
    const payload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        inserted: 1,
        skipped: 0,
        failed: 0,
        results: [{
          clientRecordId: payload.records[0].clientRecordId,
          status: "stored",
          code: "",
          retryable: false
        }]
      })
    };
  };
  const recovered = await window.flushExperimentUploadOutbox({ force: true });
  assert.strictEqual(recovered.ok, true);
  assert.strictEqual(recovered.inserted, 1);
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    0
  );

  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: false,
      code: "UNSUPPORTED_SCHEMA_VERSION",
      retryable: false
    })
  });
  const rollingDeployResult = await window.uploadExperimentRecords({
    module: "memory",
    recordType: "submission",
    records: [{ runId: "rolling-deploy", createdAt: "2026-07-28 10:01:30" }]
  });
  assert.strictEqual(rollingDeployResult.queued, 1);
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    1
  );
  window.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        inserted: 1,
        skipped: 0,
        failed: 0,
        results: [{
          clientRecordId: payload.records[0].clientRecordId,
          status: "stored",
          code: "",
          retryable: false
        }]
      })
    };
  };
  const rollingDeployRecovery = await window.flushExperimentUploadOutbox({ force: true });
  assert.strictEqual(rollingDeployRecovery.ok, true);
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    0
  );

  window.BrainPlatform.identity.writeStudentSession({
    isGuest: true,
    studentId: "guest",
    name: "游客",
    class: "游客模式",
    group: "本地体验"
  });
  const guestResult = await window.uploadExperimentRecords({
    module: "memory",
    recordType: "submission",
    records: [{ runId: "guest-run" }]
  });
  assert.strictEqual(guestResult.guest, true);
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    0
  );

  const savedDocuments = new Map();
  const saveDatabase = {
    serverDate: () => ({ serverDate: true }),
    collection(name) {
      if (name === "students") {
        return {
          where() { return this; },
          limit() { return this; },
          async get() {
            return {
              data: [{
                studentId: "S001",
                name: "测试学生",
                class: "七年级",
                group: "第一组"
              }]
            };
          }
        };
      }
      let condition = {};
      return {
        where(nextCondition) {
          condition = nextCondition;
          return this;
        },
        limit() { return this; },
        async get() {
          return {
            data: Array.from(savedDocuments.values()).filter((document) => (
              !condition.clientRecordId ||
              document.clientRecordId === condition.clientRecordId
            ))
          };
        },
        doc(recordId) {
          return {
            async set(document) {
              if (document.clientRecordId === "write-fail") {
                return { code: "DB_TEMPORARY_FAILURE" };
              }
              savedDocuments.set(recordId, document);
              return {};
            }
          };
        }
      };
    }
  };
  const saveFunction = loadCloudFunction(
    "cloudfunctions/saveExperimentRecord/index.js",
    saveDatabase
  );
  const rawSaveMain = saveFunction.main;
  saveFunction.main = (payload) => rawSaveMain(authenticatedEvent(payload));
  const saved = await saveFunction.main(uploadPayload);
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(saved.inserted, 1);
  assert.strictEqual(saved.results[0].status, "stored");
  assert.strictEqual(savedDocuments.size, 1);
  const savedDocument = Array.from(savedDocuments.values())[0];
  assert.strictEqual(savedDocument.schemaVersion, 2);
  assert.strictEqual(savedDocument.sourceSchemaVersion, 2);
  assert.strictEqual(savedDocument.payload.schemaVersion, 2);
  assert.strictEqual(savedDocument.data.schemaVersion, 2);
  assert.strictEqual(savedDocument.owner.studentId, "S001");
  assert.strictEqual(savedDocument.activity.module, "memory");
  assert.strictEqual(savedDocument.studentId, "S001");

  const duplicate = await saveFunction.main(uploadPayload);
  assert.strictEqual(duplicate.ok, true);
  assert.strictEqual(duplicate.inserted, 0);
  assert.strictEqual(duplicate.skipped, 1);
  assert.strictEqual(duplicate.results[0].status, "duplicate");
  assert.strictEqual(savedDocuments.size, 1);

  const legacyPayload = {
    schemaVersion: 1,
    module: "memory",
    recordType: "submission",
    records: [Object.assign({}, uploadPayload.records[0], {
      clientRecordId: "legacy-client-record",
      runId: "legacy-run"
    })]
  };
  const legacySaved = await saveFunction.main(legacyPayload);
  assert.strictEqual(legacySaved.ok, true);
  assert.strictEqual(legacySaved.inserted, 1);
  const legacyDocument = savedDocuments.get(legacySaved.ids[0]);
  assert.strictEqual(legacyDocument.schemaVersion, 2);
  assert.strictEqual(legacyDocument.sourceSchemaVersion, 1);

  const partial = await saveFunction.main({
    schemaVersion: 2,
    module: "memory",
    recordType: "submission",
    records: [
      Object.assign({}, uploadPayload.records[0], {
        clientRecordId: "batch-success",
        runId: "batch-success"
      }),
      Object.assign({}, uploadPayload.records[0], {
        clientRecordId: "write-fail",
        runId: "batch-failure"
      })
    ]
  });
  assert.strictEqual(partial.ok, true);
  assert.strictEqual(partial.inserted, 1);
  assert.strictEqual(partial.failed, 1);
  assert.strictEqual(partial.results[0].status, "stored");
  assert.strictEqual(partial.results[1].status, "failed");
  assert.strictEqual(partial.results[1].retryable, true);

  const unsupported = await saveFunction.main({
    schemaVersion: 3,
    module: "memory",
    recordType: "submission",
    records: [{}]
  });
  assert.strictEqual(unsupported.ok, false);
  assert.strictEqual(unsupported.code, "UNSUPPORTED_SCHEMA_VERSION");

  window.BrainPlatform.identity.writeStudentSession({
    studentId: "S001",
    sessionToken: createToken("S001"),
    name: "测试学生",
    class: "七年级",
    group: "第一组"
  });
  let loseFirstResponse = true;
  window.fetch = async (url, options) => {
    const serverResult = await saveFunction.main(JSON.parse(options.body));
    if (loseFirstResponse) {
      loseFirstResponse = false;
      throw new Error("response lost after server write");
    }
    return {
      ok: true,
      status: 200,
      json: async () => serverResult
    };
  };
  const documentsBeforeLostResponse = savedDocuments.size;
  const lostResponseResult = await window.uploadExperimentRecords({
    module: "memory",
    recordType: "submission",
    records: [{
      runId: "response-lost",
      createdAt: "2026-07-28 10:02:00"
    }]
  });
  assert.strictEqual(lostResponseResult.queued, 1);
  assert.strictEqual(savedDocuments.size, documentsBeforeLostResponse + 1);

  const lostResponseRecovery = await window.flushExperimentUploadOutbox({ force: true });
  assert.strictEqual(lostResponseRecovery.ok, true);
  assert.strictEqual(lostResponseRecovery.skipped, 1);
  assert.strictEqual(savedDocuments.size, documentsBeforeLostResponse + 1);
  assert.strictEqual(
    JSON.parse(window.localStorage.getItem("experiment-upload-outbox-v1")).entries.length,
    0
  );

  const loginDatabase = {
    collection() {
      return {
        where() { return this; },
        limit() { return this; },
        async get() {
          return {
            data: [{
              studentId: "S001",
              password: "pass",
              name: "测试学生",
              class: "七年级",
              group: "第一组"
            }]
          };
        }
      };
    }
  };
  const loginFunction = loadCloudFunction(
    "cloudfunctions/studentLogin/index.js",
    loginDatabase
  );
  const loginResult = await loginFunction.main({
    studentId: "S001",
    password: "pass"
  });
  assert.strictEqual(loginResult.ok, true);
  assert.strictEqual(loginResult.student.schemaVersion, 1);
  assert.strictEqual(loginResult.student.role, "student");
  assert.strictEqual(loginResult.student.studentId, "S001");
  assert(loginResult.student.sessionToken.includes("."));

  let createdStudent = null;
  const createDatabase = {
    collection(name) {
      if (name === "teachers") {
        return {
          where() { return this; },
          limit() { return this; },
          async get() { return { data: [{ uid: "teacher-uid", active: true, role: "teacher" }] }; }
        };
      }
      return {
        where() { return this; },
        limit() { return this; },
        async get() { return { data: [] }; },
        async add(document) {
          createdStudent = document;
          return { id: "student-1" };
        }
      };
    }
  };
  const createFunction = loadCloudFunction(
    "cloudfunctions/createStudents/index.js",
    createDatabase
  );
  const createResult = await createFunction.main({
    students: [{
      studentId: "S002",
      name: "新学生",
      class: "七年级",
      group: "第二组"
    }]
  });
  assert.strictEqual(createResult.success, 1);
  assert.strictEqual(createdStudent.schemaVersion, 1);
  assert.strictEqual(createdStudent.role, "student");

  const legacyRecord = {
    module: "memory",
    recordType: "submission",
    studentId: "S001",
    data: { createdAt: "2026-07-01 10:00:00" }
  };
  const recordsDatabase = {
    collection(name) {
      if (name === "teachers") {
        return {
          where() { return this; },
          limit() { return this; },
          async get() { return { data: [{ uid: "teacher-uid", active: true, role: "teacher" }] }; }
        };
      }
      return {
        where() { return this; },
        orderBy() { return this; },
        skip() { return this; },
        limit() { return this; },
        async get() { return { data: [legacyRecord] }; }
      };
    }
  };
  const recordsFunction = loadCloudFunction(
    "cloudfunctions/getExperimentRecords/index.js",
    recordsDatabase
  );
  const recordsResult = await recordsFunction.main({ limit: 10 });
  assert.strictEqual(recordsResult.ok, true);
  assert.strictEqual(recordsResult.records.length, 1);
  assert.strictEqual(recordsResult.records[0], legacyRecord);
  assert.strictEqual("schemaVersion" in recordsResult.records[0], false);

  console.log("Platform page order, upload and cloud contract integration checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
