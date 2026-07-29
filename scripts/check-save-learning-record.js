"use strict";

const assert = require("assert");
const path = require("path");
const Module = require("module");

const documents = new Map();
let serverTick = 0;
const students = [{ studentId: "S001", name: "测试学生", class: "七年级", group: "一组" }];

function collection(name) {
  if (name === "students") {
    return {
      where(query) {
        return {
          limit() {
            return {
              async get() {
                return { data: students.filter((student) => student.studentId === query.studentId) };
              }
            };
          }
        };
      }
    };
  }
  return {
    doc(id) {
      return {
        async get() {
          if (!documents.has(id)) {
            const error = new Error("not found");
            error.code = "DATABASE_DOCUMENT_NOT_EXIST";
            throw error;
          }
          return { data: [documents.get(id)] };
        },
        async set(value) {
          documents.set(id, Object.assign({}, value));
          return {};
        },
        async update(value) {
          documents.set(id, Object.assign({}, documents.get(id), value));
          return {};
        }
      };
    }
  };
}

const cloudbaseMock = {
  SYMBOL_CURRENT_ENV: "test",
  init() {
    return {
      database() {
        return {
          collection,
          serverDate() {
            serverTick += 1;
            return { $serverDate: serverTick };
          }
        };
      }
    };
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@cloudbase/node-sdk") return cloudbaseMock;
  return originalLoad.call(this, request, parent, isMain);
};
const handler = require(path.join("..", "cloudfunctions", "saveLearningRecord", "index.js"));
Module._load = originalLoad;

function record(overrides) {
  return Object.assign({
    schemaVersion: 1,
    studentId: "S001",
    experimentId: "memory",
    stageId: "question",
    taskId: "question",
    inputText: " 学习 记录 ",
    inputMethod: "keyboard",
    typingDurationMs: 3000,
    activeTypingDurationMs: 1200,
    effectiveCharacterCount: 999,
    keyboardInputCharacterCount: 4,
    deleteCount: 0,
    largeDeleteCount: 0,
    pauseCount: 1,
    longestPauseMs: 3000,
    aiUsed: false,
    voiceUsed: false,
    taskStatus: "saved",
    firstFocusedAt: "2026-07-29T01:00:00.000Z",
    firstInputAt: "2026-07-29T01:00:01.000Z",
    lastInputAt: "2026-07-29T01:00:04.000Z",
    pageId: "memory.html"
  }, overrides || {});
}

(async () => {
  const unknown = await handler.main({ schemaVersion: 1, record: record({ unexpected: true }) });
  assert.strictEqual(unknown.code, "UNKNOWN_FIELD");

  const missingStudent = await handler.main({ schemaVersion: 1, record: record({ studentId: "S404" }) });
  assert.strictEqual(missingStudent.code, "STUDENT_NOT_FOUND");

  const created = await handler.main({ schemaVersion: 1, record: record() });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.operation, "created");
  assert.strictEqual(documents.size, 1);
  const first = documents.get(created.recordId);
  assert.strictEqual(first.effectiveCharacterCount, 4, "server must recompute effective character count");
  assert.deepStrictEqual(first.createdAt, { $serverDate: 1 });
  assert.strictEqual(first.studentName, "测试学生");

  const updated = await handler.main({
    schemaVersion: 1,
    record: record({
      inputText: "学习记录更新",
      inputMethod: "voice",
      voiceUsed: true,
      taskStatus: "submitted",
      deleteCount: 2
    })
  });
  assert.strictEqual(updated.operation, "updated");
  assert.strictEqual(updated.recordId, created.recordId);
  assert.strictEqual(documents.size, 1, "repeat saves must update the deterministic document");
  const second = documents.get(created.recordId);
  assert.strictEqual(second.inputMethod, "mixed");
  assert.strictEqual(second.voiceUsed, true);
  assert.strictEqual(second.taskStatus, "submitted");
  assert.strictEqual(second.deleteCount, 2);
  assert(second.submittedAt && second.updatedAt, "server timestamps missing");

  const tooLong = await handler.main({
    schemaVersion: 1,
    record: record({ inputText: "字".repeat(10001) })
  });
  assert.strictEqual(tooLong.code, "TEXT_TOO_LONG");

  console.log("saveLearningRecord CloudBase mock checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
