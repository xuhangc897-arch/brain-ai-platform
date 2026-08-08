"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const bank = require(path.join(root, "assets", "knowledge-question-bank.js"));
const serverAnswers = require(path.join(root, "cloudfunctions", "generateExperimentMemory", "question-answers.js"));

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadGenerator() {
  const filename = path.join(root, "cloudfunctions", "generateExperimentMemory", "index.js");
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
                collection() { return collection; },
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

function loadStudentMemoryFunction(database) {
  const filename = path.join(root, "cloudfunctions", "getStudentMemory", "index.js");
  const originalLoad = Module._load;
  Module._load = function load(request) {
    if (request === "@cloudbase/node-sdk") {
      return {
        SYMBOL_CURRENT_ENV: "CURRENT_ENV",
        init() { return { database: () => database }; }
      };
    }
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve(filename)];
  try { return require(filename); }
  finally { Module._load = originalLoad; }
}

function signedToken(studentId, secret) {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    studentId,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

assert.strictEqual(bank.questions.length, 40);
for (const experimentId of ["memory", "nback", "interference", "strategies"]) {
  const questions = bank.getExperimentQuestions(experimentId);
  assert.strictEqual(questions.length, 10);
  assert.deepStrictEqual(questions.map((item) => item.answer), Array.from(serverAnswers[experimentId]));
  const perfect = Object.fromEntries(questions.map((item) => [item.questionId, item.answer]));
  assert.strictEqual(bank.scoreAnswers(perfect)[experimentId].score, 100);

  const page = source(`${experimentId}.html`);
  assert(page.includes('assets/knowledge-question-bank.js'));
  assert(page.includes(`getExperimentQuestions("${experimentId}")`));
  assert(page.includes("isKnowledgeQuizAnswered()"));
  assert(page.includes("finalizeKnowledgeQuizOnce()"));
  assert(page.includes("assets/student-memory.js"));
  assert(page.includes(`experimentId: "${experimentId}"`));
}

const pretest = source("pretest.html");
for (const marker of [
  "knowledgePretestRoot", "questionOrder", "answersByQuestionId",
  "scoresByExperiment", "legacyQualification", "submitKnowledgePretest"
]) assert(pretest.includes(marker), `pretest missing ${marker}`);

const platform = source("assets/platform-core.js");
assert(platform.includes("generateExperimentMemory"));
assert(platform.includes("getStudentMemory"));
assert(platform.includes("studentMemorySupportState"));

const studentMemory = source("assets/student-memory.js");
assert(studentMemory.includes("MAX_SUPPORTS_PER_EXPERIMENT = 2"));
assert(studentMemory.includes("experiment-records:acknowledged"));
assert(studentMemory.includes("showMemorySupport"));
assert(studentMemory.includes("Authorization: `Bearer"));

const partner = source("assets/memory-partner.js");
assert(partner.includes("我的学习记录"));
assert(partner.includes("showMemorySupport"));

const generator = loadGenerator().__test;
const completeState = {
  maxUnlockedStep: 7,
  surveys: {
    postMeta: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`q${index + 1}`, 1])),
    cognitiveLoad: Object.fromEntries(Array.from({ length: 2 }, (_, index) => [`q${index + 1}`, 1])),
    inquiryParticipation: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`q${index + 1}`, 1]))
  },
  knowledgeQuiz: { submitted: true }
};
assert.strictEqual(generator.completionFacts(completeState).completedTaskCount, 8);
assert.strictEqual(generator.completionFacts({ maxUnlockedStep: 3, surveys: {} }).completedTaskCount, 3);

const taskIds = new Set(["question_text", "analysis_text", "reflection_text"]);
const validSummary = {
  strengths: [{ code: "COMPARE_RESULTS", evidence: "能够比较结果", sourceTaskIds: ["analysis_text"] }],
  needsSupport: [{ code: "USE_EVIDENCE", evidence: "可以进一步引用数据", sourceTaskIds: ["analysis_text"] }],
  inquiryPerformance: { summary: "能够提出问题", evidence: "已形成研究问题", sourceTaskIds: ["question_text"] },
  evidenceUse: { summary: "开始使用证据", evidence: "比较了实验结果", sourceTaskIds: ["analysis_text"] },
  reflectionPerformance: { summary: "完成反思", evidence: "提出改进方向", sourceTaskIds: ["reflection_text"] },
  inputSupport: { summary: "保持现有输入方式", evidenceCodes: ["INPUT_SUPPORT"] },
  interventionResponse: { summary: "能够根据提示修改", evidenceCodes: ["USE_EVIDENCE"] },
  nextSupport: [{ stageId: "conclusion", supportType: "evidence_prompt", message: "形成结论时可以引用一项数据。", evidenceCodes: ["USE_EVIDENCE"] }],
  changesFromPrevious: []
};
assert(generator.validateSummary(validSummary, taskIds));
assert.strictEqual(
  generator.validateSummary({ ...validSummary, strengths: [{ code: "COMPARE_RESULTS", evidence: "无来源", sourceTaskIds: ["unknown"] }] }, taskIds),
  null
);

const cloudbaseConfig = JSON.parse(source("cloudbase.json"));
for (const name of ["generateExperimentMemory", "getStudentMemory", "getStudentMemoriesAdmin"]) {
  assert(cloudbaseConfig.functions.some((item) => item.name === name));
}
assert(source("cloudfunctions/studentLogin/index.js").includes("STUDENT_SESSION_SECRET"));
assert(source("cloudfunctions/getExperimentRecords/index.js").includes('role: "teacher"'));
assert(source("admin/dashboard.html").includes("TEMPORARY_DASHBOARD_LOGIN_BYPASS = false"));

(async () => {
  const secret = "student-memory-test-secret-at-least-32-characters";
  process.env.STUDENT_SESSION_SECRET = secret;
  const memoryDocuments = [
    {
      studentId: "S001",
      memoryType: "experiment",
      experimentId: "memory",
      experimentOrder: 1,
      completedAt: "2026-07-29T01:00:00.000Z",
      summary: { strengths: [{ evidence: "能够比较实验结果" }] }
    },
    {
      studentId: "S404",
      memoryType: "experiment",
      experimentId: "memory",
      experimentOrder: 1,
      summary: { strengths: [{ evidence: "不应返回" }] }
    }
  ];
  const database = {
    collection(name) {
      return {
        where(query) {
          const data = name === "students"
            ? (query.studentId === "S001" ? [{ studentId: "S001" }] : [])
            : memoryDocuments.filter((record) => record.studentId === query.studentId);
          return {
            limit() {
              return { async get() { return { data }; } };
            }
          };
        }
      };
    }
  };
  const getStudentMemory = loadStudentMemoryFunction(database);
  const unauthorized = await getStudentMemory.main({ headers: { authorization: "Bearer invalid" } });
  assert.strictEqual(unauthorized.code, "UNAUTHORIZED");
  const authorized = await getStudentMemory.main({
    headers: { authorization: `Bearer ${signedToken("S001", secret)}` },
    body: JSON.stringify({ studentId: "S404", experimentId: "nback" })
  });
  assert.strictEqual(authorized.ok, true);
  assert.strictEqual(authorized.view.completedExperiments.length, 1);
  assert.strictEqual(authorized.view.completedExperiments[0].experimentId, "memory");

  console.log("Knowledge pretest, signed session, student memory and teacher access contracts passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
