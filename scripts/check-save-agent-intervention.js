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
        },
        async update(value) {
          documents.set(id, Object.assign({}, documents.get(id), value));
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
const handler = require(path.join("..", "cloudfunctions", "saveAgentIntervention", "index.js"));
Module._load = originalLoad;

function intervention(overrides) {
  return Object.assign({
    schemaVersion: 1,
    studentId: "S001",
    experimentId: "memory",
    stageId: "question",
    taskId: "question",
    pageId: "memory.html",
    interventionType: "suggest_voice_input",
    triggerReasons: ["no_effective_text"],
    triggerMetrics: {
      observedDurationMs: 60000,
      effectiveCharacterCount: 0,
      pauseCount: 0,
      longestPauseMs: 60000,
      deleteCount: 0,
      largeDeleteCount: 0,
      focusCount: 1
    },
    studentResponse: "accepted",
    voiceInsertSucceeded: false,
    triggeredAt: "2026-07-29T01:00:00.000Z"
  }, overrides || {});
}

(async () => {
  const unknown = await handler.main({
    schemaVersion: 1,
    intervention: intervention({ unexpected: true })
  });
  assert.strictEqual(unknown.code, "UNKNOWN_FIELD");

  const unknownStudent = await handler.main({
    schemaVersion: 1,
    intervention: intervention({ studentId: "S404" })
  });
  assert.strictEqual(unknownStudent.code, "STUDENT_NOT_FOUND");

  const created = await handler.main({ schemaVersion: 1, intervention: intervention() });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.operation, "created");
  assert.strictEqual(documents.size, 1);
  const first = documents.get(created.recordId);
  assert.strictEqual(first.studentName, "测试学生");
  assert.deepStrictEqual(first.createdAt, { $serverDate: 1 });

  const updated = await handler.main({
    schemaVersion: 1,
    intervention: intervention({ voiceInsertSucceeded: true })
  });
  assert.strictEqual(updated.operation, "updated");
  assert.strictEqual(updated.recordId, created.recordId);
  assert.strictEqual(documents.size, 1);
  assert.strictEqual(documents.get(created.recordId).voiceInsertSucceeded, true);

  await handler.main({
    schemaVersion: 1,
    intervention: intervention({ studentResponse: "ignored", voiceInsertSucceeded: false })
  });
  assert.strictEqual(documents.get(created.recordId).studentResponse, "accepted",
    "late ignored updates must not downgrade an accepted response");
  assert.strictEqual(documents.get(created.recordId).voiceInsertSucceeded, true);

  const memorySupport = await handler.main({
    schemaVersion: 1,
    intervention: {
      schemaVersion: 1,
      studentId: "S001",
      experimentId: "nback",
      stageId: "analysis",
      taskId: "analysis_support",
      pageId: "nback.html",
      interventionType: "memory_support",
      supportId: "memory-analysis-evidence",
      supportMessage: "分析结果时可以引用一项具体数据。",
      studentResponse: "dismissed",
      triggeredAt: "2026-07-29T02:00:00.000Z"
    }
  });
  assert.strictEqual(memorySupport.ok, true);
  assert.strictEqual(documents.get(memorySupport.recordId).interventionType, "memory_support");
  assert.strictEqual(documents.get(memorySupport.recordId).supportMessage, "分析结果时可以引用一项具体数据。");

  console.log("saveAgentIntervention CloudBase mock checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
