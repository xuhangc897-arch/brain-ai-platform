"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadFunction(name, database) {
  const filename = path.join(root, "cloudfunctions", name, "index.js");
  const originalLoad = Module._load;
  const collection = {
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    doc() { return this; },
    async get() { return { data: [] }; },
    async set() {},
    async update() {}
  };
  Module._load = function load(request) {
    if (request === "@cloudbase/node-sdk") {
      return {
        SYMBOL_CURRENT_ENV: "CURRENT_ENV",
        init() {
          return {
            database() {
              return {
                collection(collectionName) { return database ? database.collection(collectionName) : collection; },
                serverDate() { return "SERVER_DATE"; }
              };
            }
          };
        }
      };
    }
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve(filename)];
  try { return require(filename); }
  finally { Module._load = originalLoad; }
}

const generator = loadFunction("generateLearningDiagnosis").__test;
const reader = loadFunction("getLearningDiagnosis").__test;
const completeState = {
  maxUnlockedStep: 7,
  surveys: {
    postMeta: { ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`q${index + 1}`, 4])), q6: 1 },
    cognitiveLoad: { q1: 5, q2: 6 },
    inquiryParticipation: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`q${index + 1}`, 4]))
  },
  knowledgeQuiz: { submitted: true }
};
assert.strictEqual(generator.completionFacts(completeState).completed, true);
assert.strictEqual(generator.completionFacts({ ...completeState, knowledgeQuiz: {} }).completed, true, "legacy missing quiz should remain eligible");
assert.strictEqual(generator.completionFacts({ maxUnlockedStep: 6, surveys: completeState.surveys }).completed, false);
const submittedRecord = {
  submissionTime: "2026-07-29T01:00:00.000Z",
  experimentResults: {},
  surveys: {
    meta: completeState.surveys.postMeta,
    cognitiveLoad: completeState.surveys.cognitiveLoad,
    inquiryParticipation: completeState.surveys.inquiryParticipation
  },
  knowledgeQuiz: { attempts: [{ timestamp: "2026-07-29T01:00:00.000Z" }] }
};
assert.strictEqual(generator.completionFacts(generator.fullState(submittedRecord)).completed, true,
  "a completed normalized submission must be eligible for diagnosis generation");
assert.strictEqual(reader.completed(reader.fullState(submittedRecord)), true,
  "the student diagnosis reader must agree with the generator");
for (const record of [
  { ...submittedRecord, surveys: {} },
  { ...submittedRecord, experimentResults: { maxUnlockedStep: 6 } }
]) {
  assert.strictEqual(generator.completionFacts(generator.fullState(record)).completed, false);
  assert.strictEqual(reader.completed(reader.fullState(record)), false);
}

const experimentIds = ["memory", "nback", "interference", "strategies"];
const readySources = {
  submissions: Object.fromEntries(experimentIds.map((id) => [id, {
    recordId: `submission_${id}`,
    data: { fullState: completeState }
  }]))
};
const objectiveMetrics = generator.buildObjectiveMetrics(readySources.submissions, {}, {});
assert(objectiveMetrics.experiments.every((item) => item.surveys.metacognitionAverage === 4), "legacy q6 must not affect metacognition averages");
assert.strictEqual(generator.evaluateReadiness(readySources).generationReady, true);
const normalizedSources = {
  submissions: Object.fromEntries(experimentIds.map((id) => [id, { ...submittedRecord, recordId: `submission_${id}` }]))
};
assert.strictEqual(generator.evaluateReadiness(normalizedSources).generationReady, true,
  "four completed normalized submissions must qualify for diagnosis");
const withoutMemories = generator.buildObjectiveMetrics(readySources.submissions, {}, {});
assert(generator.validateDiagnosis(generator.buildDiagnosis(withoutMemories)),
  "completed submissions alone must produce a valid diagnosis");

const dimensions = [
  "memory_knowledge",
  "scientific_inquiry",
  "evidence_use",
  "metacognitive_regulation",
  "tool_use"
].map((dimensionId) => ({
  dimensionId,
  level: "developing",
  evidence: [{ summary: "四次实验中形成了可核对的学习记录", sourceExperimentIds: ["memory", "nback"] }],
  progress: { direction: "improved", summary: "后续实验中的表达更加完整", sourceExperimentIds: ["memory", "strategies"] },
  suggestion: "完成任务后检查结论是否回应了研究问题。"
}));
const validDiagnosis = {
  dimensions,
  progressSummary: "四次实验记录显示，你逐步形成了检查证据和调整表达的习惯。",
  studentReport: {
    strengths: ["能够完成四次探究并保留实验记录。"],
    progress: ["后续实验中的结论表达更加完整。"],
    growthAreas: ["可以继续练习引用具体实验数据。"],
    nextActions: ["写结论前先圈出一项最能支持观点的数据。"]
  },
  teacherReport: {
    completionSummary: "四次实验均有正式完成记录。",
    processSummary: "学生完成了主要探究环节。",
    interventionSummary: "系统记录了提示及响应。",
    toolUsageSummary: "工具使用情况依据实际任务记录汇总。",
    changeSummary: "后续实验中证据表达有所变化。",
    recommendations: ["继续提供证据引用支架。"]
  },
  recommendations: [{
    action: "结论中引用一项具体数据。",
    rationale: "帮助观点与证据建立联系。",
    dimensionIds: ["evidence_use"]
  }]
};
assert(generator.validateDiagnosis(validDiagnosis));
const builtDiagnosis = generator.validateDiagnosis(generator.buildDiagnosis(objectiveMetrics));
assert(builtDiagnosis);
assert.strictEqual(builtDiagnosis.dimensions.length, 5);
assert(!source("cloudfunctions/generateLearningDiagnosis/index.js").includes("OPENAI_API_KEY"));
assert.strictEqual(generator.validateDiagnosis({ ...validDiagnosis, dimensions: dimensions.slice(0, 4) }), null);
assert.strictEqual(generator.validateDiagnosis({
  ...validDiagnosis,
  studentReport: { ...validDiagnosis.studentReport, strengths: ["该学生能力差"] }
}), null);
assert.strictEqual(generator.validateDiagnosis({
  ...validDiagnosis,
  studentReport: { ...validDiagnosis.studentReport, nextActions: ["1", "2", "3", "4"] }
}), null);
assert.strictEqual(generator.versionId("S001", "hash"), generator.versionId("S001", "hash"));
assert.notStrictEqual(generator.versionId("S001", "hash"), generator.versionId("S001", "changed"));

for (const experimentId of experimentIds) {
  const page = source(`${experimentId}.html`);
  assert(page.includes("assets/learning-diagnosis.js"), `${experimentId}: diagnosis script missing`);
  assert(page.includes(`LearningDiagnosis.init({ experimentId: "${experimentId}" })`), `${experimentId}: diagnosis init missing`);
}

const platform = source("assets/platform-core.js");
for (const marker of ["generateLearningDiagnosis", "getLearningDiagnosis", "learningDiagnosisOutbox"]) {
  assert(platform.includes(marker), `platform missing ${marker}`);
}

const partner = source("assets/memory-partner.js");
for (const marker of ["我的学习诊断", "showDiagnosisReady", "setDiagnosisState", "查看我的学习诊断"]) {
  assert(partner.includes(marker), `virtual agent missing ${marker}`);
}

const diagnosisPage = source("diagnosis.html");
assert(diagnosisPage.includes("assets/learning-diagnosis.js"));
assert(diagnosisPage.includes('id="printBtn"'));
assert(source("assets/review.js").includes("appendLearningDiagnosis"));
assert(source("admin/dashboard.html").includes("getLearningDiagnosesAdmin"));
assert(source("admin/dashboard.html").includes("本诊断仅基于本平台中的学习过程和任务表现"));

const cloudbaseConfig = JSON.parse(source("cloudbase.json"));
for (const name of ["generateLearningDiagnosis", "getLearningDiagnosis", "getLearningDiagnosesAdmin"]) {
  assert(cloudbaseConfig.functions.some((item) => item.name === name), `cloudbase config missing ${name}`);
}

(async () => {
  const secret = "learning-diagnosis-test-secret-at-least-32-characters";
  process.env.STUDENT_SESSION_SECRET = secret;
  const payload = Buffer.from(JSON.stringify({ version: 1, studentId: "S001", expiresAt: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const token = `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
  const written = new Map();
  const submissions = experimentIds.map((id) => ({ ...submittedRecord, recordId: `submission_${id}`, studentId: "S001", experimentId: id, uploadedAt: "2026-07-29T01:00:00.000Z" }));
  const database = {
    collection(name) {
      return {
        where(query) {
          const data = name === "students" ? [{ studentId: "S001", name: "测试学生" }]
            : name === "experiment_submissions" ? submissions.filter((item) => item.experimentId === query.experimentId)
              : [];
          return { orderBy() { return this; }, limit() { return this; }, async get() { return { data }; } };
        },
        doc(id) {
          return {
            async get() { return { data: written.has(id) ? [written.get(id)] : [] }; },
            async set(value) { written.set(id, value); },
            async update(value) { written.set(id, value); }
          };
        }
      };
    }
  };
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await loadFunction("generateLearningDiagnosis", database).main({ headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(result.ok, true, `diagnosis write failed: ${result.code}`);
    assert.strictEqual(Array.from(written.values()).filter((item) => item.recordType === "version").length, 1);
    assert.strictEqual(Array.from(written.values()).filter((item) => item.recordType === "pointer").length, 1);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
  console.log("Learning diagnosis eligibility, validation, versioning, UI and access contracts passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
