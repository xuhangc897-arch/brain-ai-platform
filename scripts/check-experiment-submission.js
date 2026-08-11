"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "assets", "experiment-submission.js"), "utf8");
const store = new Map();
const session = { studentId: "s-1", sessionToken: "token", name: "Student" };
const context = {
  structuredClone,
  fetch: async () => ({ ok: true, json: async () => ({ ok: true, code: "STORED" }) }),
  localStorage: { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
  addEventListener() {},
  BrainExperimentRegistry: { get: (id) => ({ id, label: id === "screening" ? "Screening" : "Memory", kind: id === "screening" ? "screening" : "experiment" }) },
  BrainExperimentIntegration: { resolveSourceModule: (_source, pathName) => pathName.includes("memory") ? "memory" : "" },
  BrainAIChat: { readLogs: () => [{ path: "/memory.html", failed: false }, { path: "/memory.html", failed: true }] },
  BrainKnowledgeAssessment: {
    normalizeTimeline: (value) => value || { schemaVersion: 2, T0: null, T1: null, T2: null, T3: null, T4: null, T5: null }
  },
  BrainPlatform: {
    config: { endpoints: { saveExperimentSubmission: "/save", getLatestExperimentSubmission: "/latest" }, storageKeys: { submissionOutbox: "submission-outbox" } },
    identity: { readStudentSession: () => session },
    storage: { scopedKey: (key) => `${key}::student:s-1` }
  }
};
context.window = context;
vm.runInNewContext(source, context, { filename: "experiment-submission.js" });

const state = {
  studentId: "s-1",
  fields: { question: "Q", reflection_individual: "R" },
  records: [{ runId: "r1", raw: true }],
  attemptHistory: [{ runId: "r1" }],
  surveys: { postMeta: { q1: 4 }, cognitiveLoad: { q1: 6 }, inquiryParticipation: { q1: 5 } },
  knowledgeQuiz: { history: [{ attemptNumber: 1, score: 80, correctCount: 8, totalCount: 10, accuracy: 80, answers: { q1: "A" }, submittedAt: "2026-08-03T00:00:00.000Z" }, { attemptNumber: 2, score: 100, correctCount: 10, totalCount: 10, accuracy: 100, answers: { q1: "B" }, submittedAt: "2026-08-03T01:00:00.000Z" }] }
};

const built = context.BrainExperimentSubmission.build({ experimentId: "memory", state, submissionTime: "2026-08-03T02:00:00.000Z" });
assert.strictEqual(built.schemaVersion, 2);
assert.strictEqual(built.answers.question, "Q");
assert.strictEqual(built.experimentResults.records[0].raw, true);
assert.strictEqual(built.experimentResults.attemptHistory[0].runId, "r1");
assert.strictEqual(built.knowledgeQuiz.attempts.length, 1);
assert.strictEqual(built.knowledgeQuiz.firstScore, 80);
assert.strictEqual(built.knowledgeQuiz.bestScore, 80);
assert.strictEqual(built.knowledgeQuiz.finalScore, 80);
assert.strictEqual(built.surveys.meta.q1, 4);
assert.strictEqual(built.reflections.reflection_individual, "R");
assert.strictEqual(built.aiSummary.usageCount, 1);
assert.strictEqual(built.knowledgeAssessment.schemaVersion, 2);

const screening = context.BrainExperimentSubmission.build({
  experimentId: "screening",
  state: { studentId: "s-1", answers: { q1: 4 }, knowledgePretest: { submitted: true } },
  submissionTime: "2026-08-03T02:30:00.000Z"
});
assert.strictEqual(screening.answers.q1, 4);
assert.strictEqual(screening.experimentResults.knowledgePretest.submitted, true);

context.BrainExperimentSubmission.submit({ experimentId: "memory", state, submissionTime: "2026-08-03T02:00:00.000Z" }).then((result) => {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.queued, false);
  const saveSource = fs.readFileSync(path.join(__dirname, "..", "cloudfunctions", "saveExperimentSubmission", "index.js"), "utf8");
  const getSource = fs.readFileSync(path.join(__dirname, "..", "cloudfunctions", "getLatestExperimentSubmission", "index.js"), "utf8");
  const adminSource = fs.readFileSync(path.join(__dirname, "..", "cloudfunctions", "getExperimentSubmissionsAdmin", "index.js"), "utf8");
  assert.match(saveSource, /experiment_submissions/);
  assert.match(getSource, /experimentRecords/);
  assert.match(adminSource, /Promise\.all/);
  console.log("Experiment submission normalization, queue and compatibility checks passed.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
