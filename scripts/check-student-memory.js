"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const crypto = require("crypto");
const https = require("https");
const { EventEmitter } = require("events");

const root = path.resolve(__dirname, "..");
const bank = require(path.join(root, "assets", "knowledge-question-bank.js"));
const serverAnswers = require(path.join(root, "cloudfunctions", "generateExperimentMemory", "question-answers.js"));

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadGenerator(database) {
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
                collection(name) { return database ? database.collection(name) : collection; },
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
  const postAsset = experimentId === "strategies" ? "knowledge-post-strategy.js" : `knowledge-post-${experimentId}.js`;
  assert(page.includes(`assets/${postAsset}`));
  assert(page.includes("assets/knowledge-assessment.js"));
  assert(page.includes("isKnowledgeQuizAnswered()"));
  assert(page.includes("finalizeKnowledgeQuizOnce()"));
  assert(page.includes("assets/student-memory.js"));
  assert(page.includes(`experimentId: "${experimentId}"`));
}

const pretest = source("pretest.html");
for (const marker of [
  "BrainKnowledgePretestQuestions", "knowledgeDraft", "knowledgeAssessment",
  "legacyKnowledgePretest", "legacyQualification", "submitKnowledgePretest"
]) assert(pretest.includes(marker), `pretest missing ${marker}`);

const platform = source("assets/platform-core.js");
assert(platform.includes("generateExperimentMemory"));
assert(platform.includes("getStudentMemory"));
assert(platform.includes("studentMemorySupportState"));

const studentMemory = source("assets/student-memory.js");
assert(studentMemory.includes("MAX_SUPPORTS_PER_EXPERIMENT = 2"));
assert(studentMemory.includes("experiment-records:acknowledged"));
assert(studentMemory.includes("experiment-submission:acknowledged"));
assert(studentMemory.includes("student-memory:updated"));
assert(studentMemory.includes("generatedSubmissionIds"));
assert(studentMemory.includes("currentView = await loadStudentView()"));
assert(studentMemory.includes("showMemorySupport"));
assert(studentMemory.includes("Authorization: `Bearer"));
const poster = source("poster.html");
assert(poster.includes('<script src="assets/student-memory.js"></script>'));
assert(poster.includes('StudentMemory?.init({ experimentId: "poster" })'));
const diagnosisPage = source("diagnosis.html");
assert(diagnosisPage.includes('<script src="assets/student-memory.js"></script>'));
assert(diagnosisPage.indexOf('assets/student-memory.js') < diagnosisPage.indexOf('assets/learning-diagnosis.js'));
assert(source("assets/diagnosis.js").includes('StudentMemory.init({ experimentId: "poster" })'));

const partner = source("assets/memory-partner.js");
assert(partner.includes("我的学习记录"));
assert(partner.includes("showMemorySupport"));
assert(partner.includes('activeDetailMode === "memory"'));
assert(partner.includes('document.addEventListener("student-memory:updated"'));

async function checkSubmissionDrivenRefresh() {
  const listeners = {};
  const dispatched = [];
  const storage = new Map();
  let generationCalls = 0;
  let viewCalls = 0;
  const context = {
    window: null, console, Date, Object, Array, String, Number, Promise, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options && options.detail; }
    },
    document: {
      addEventListener(name, listener) { (listeners[name] ||= []).push(listener); },
      dispatchEvent(event) {
        dispatched.push(event);
        for (const listener of listeners[event.type] || []) listener(event);
      }
    },
    addEventListener() {},
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); }
    },
    BrainExperimentRegistry: {
      get: () => ({ id: "memory", order: 1 }),
      experiments: [{ id: "memory", order: 1 }]
    },
    BrainPlatform: {
      config: {
        endpoints: {
          generateExperimentMemory: "/generate",
          getStudentMemory: "/view",
          saveAgentIntervention: "/intervention"
        },
        storageKeys: {
          studentMemoryOutbox: "memory-outbox",
          studentMemorySupportState: "memory-support"
        }
      },
      identity: { readStudentSession: () => ({ studentId: "S001", sessionToken: "token" }) }
    },
    async fetch(url) {
      if (url === "/generate") {
        generationCalls += 1;
        return { ok: true, async json() { return { ok: true, operation: "created", version: 1 }; } };
      }
      if (url === "/view") {
        viewCalls += 1;
        const completedExperiments = generationCalls ? [{ experimentId: "memory" }] : [];
        return { ok: true, async json() { return { ok: true, view: { completedExperiments } }; } };
      }
      return { ok: true, async json() { return { ok: true }; } };
    }
  };
  context.window = context;
  require("vm").runInNewContext(studentMemory, context, { filename: "student-memory-refresh.js" });
  context.StudentMemory.init({ experimentId: "memory" });
  while (!viewCalls) await new Promise((resolve) => setTimeout(resolve, 0));
  context.document.dispatchEvent(new context.CustomEvent("experiment-submission:acknowledged", {
    detail: { experimentId: "memory", submissionId: "submission-1" }
  }));
  context.document.dispatchEvent(new context.CustomEvent("experiment-submission:acknowledged", {
    detail: { experimentId: "memory", submissionId: "submission-1" }
  }));
  while (!dispatched.some((event) => event.type === "student-memory:updated")) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.strictEqual(generationCalls, 1, "one formal submission must generate memory once");
  assert(viewCalls >= 2, "successful generation must refresh the cached student view");
  const view = await context.StudentMemory.getStudentView();
  assert.strictEqual(view.completedExperiments[0].experimentId, "memory");
}

async function checkPosterBackfill() {
  const generated = [];
  const storage = new Map();
  const experiments = ["memory", "nback", "interference", "strategies"].map((id, index) => ({ id, order: index + 1 }));
  const context = {
    window: null, console, Date, Object, Array, String, Number, Promise, setTimeout, clearTimeout,
    document: { addEventListener() {} },
    addEventListener() {},
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); }
    },
    BrainExperimentRegistry: {
      get(id) { return id === "poster" ? { id, order: 5 } : experiments.find((item) => item.id === id); },
      experiments: experiments.concat({ id: "poster", order: 5 })
    },
    BrainPlatform: {
      config: {
        endpoints: { generateExperimentMemory: "/generate", getStudentMemory: "/view" },
        storageKeys: { studentMemoryOutbox: "memory-outbox", studentMemorySupportState: "memory-support" }
      },
      identity: { readStudentSession: () => ({ studentId: "S001", sessionToken: "token" }) }
    },
    async fetch(url, options) {
      if (url === "/generate") {
        generated.push(JSON.parse(options.body).experimentId);
        return { ok: true, async json() { return { ok: true, operation: "created", version: 1 }; } };
      }
      return { ok: true, async json() { return { ok: true, view: { completedExperiments: [] } }; } };
    }
  };
  context.window = context;
  require("vm").runInNewContext(studentMemory, context, { filename: "student-memory-poster.js" });
  context.StudentMemory.init({ experimentId: "poster" });
  for (let attempt = 0; attempt < 100 && generated.length < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.deepStrictEqual(generated, experiments.map((item) => item.id), "case five must retry memories for all four prior experiments");
}

const generator = loadGenerator().__test;
const completeState = {
  maxUnlockedStep: 7,
  surveys: {
    postMeta: { ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`q${index + 1}`, 1])), q6: 0 },
    cognitiveLoad: Object.fromEntries(Array.from({ length: 2 }, (_, index) => [`q${index + 1}`, 1])),
    inquiryParticipation: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`q${index + 1}`, 1]))
  },
  knowledgeQuiz: { submitted: true },
  knowledgeAssessment: { T1: { score: 80 } }
};
assert.strictEqual(generator.completionFacts(completeState).completedTaskCount, 8);
assert.strictEqual(generator.completionFacts(completeState, "memory").posttestKnowledgeComplete, true);
assert.strictEqual(generator.completionFacts({ maxUnlockedStep: 3, surveys: {} }).completedTaskCount, 3);
const submittedRecord = {
  submissionTime: "2026-07-29T01:00:00.000Z",
  experimentResults: { records: [] },
  surveys: {
    meta: completeState.surveys.postMeta,
    cognitiveLoad: completeState.surveys.cognitiveLoad,
    inquiryParticipation: completeState.surveys.inquiryParticipation
  },
  knowledgeQuiz: { attempts: [{ timestamp: "2026-07-29T01:00:00.000Z" }] }
};
assert.strictEqual(generator.completionFacts(generator.fullState(submittedRecord), "memory").completedTaskCount, 8,
  "a completed normalized submission must remain eligible for memory generation");
assert.strictEqual(generator.completionFacts(generator.fullState({ ...submittedRecord, surveys: {} }), "memory").completedTaskCount, 0,
  "a submission without completed surveys must remain incomplete");
assert.strictEqual(generator.completionFacts(generator.fullState({
  ...submittedRecord, experimentResults: { maxUnlockedStep: 6 }
}), "memory").completedTaskCount, 7, "an explicit incomplete progress marker must remain authoritative");

const builtSummary = generator.buildSummary({ recordId: "submission_memory", answers: { question: "研究问题", hypothesis: "假设", analysis: "数据分析", conclusion: "结论", reflection: "反思" } }, { input: { aiUsageTaskCount: 0, voiceUsageTaskCount: 0 }, interventions: { relevancePromptCount: 0 } });
assert(builtSummary.strengths.length >= 2);
assert(builtSummary.strengths.every((item) => item.sourceTaskIds[0] === "submission_memory"));
const samples = generator.answerSamples({ answers: { analysis: "我比较了两组的正确率" } });
const concise = generator.refineSummary({
  strengths: [{ code: "USE_EVIDENCE", quote: "比较了两组", observation: "用两组结果支持了分析。" }],
  nextSuggestion: "下次在结论里写明两组数据的差异。"
}, builtSummary, samples, "submission_memory");
assert(concise && concise.strengths[0].evidence.includes("比较了两组"));
assert(concise.strengths[0].evidence.length <= 70);
assert.strictEqual(generator.refineSummary({
  strengths: [{ code: "USE_EVIDENCE", quote: "不存在的原文", observation: "用两组结果支持了分析。" }],
  nextSuggestion: "核对结论。"
}, builtSummary, samples, "submission_memory"), null);
assert(source("cloudfunctions/generateExperimentMemory/index.js").includes("OPENAI_API_KEY"));

const cloudbaseConfig = JSON.parse(source("cloudbase.json"));
for (const name of ["generateExperimentMemory", "getStudentMemory", "getStudentMemoriesAdmin"]) {
  assert(cloudbaseConfig.functions.some((item) => item.name === name));
}
assert(source("cloudfunctions/studentLogin/index.js").includes("STUDENT_SESSION_SECRET"));
assert(source("cloudfunctions/getExperimentRecords/index.js").includes('role: "teacher"'));
assert(source("admin/dashboard.html").includes("TEMPORARY_DASHBOARD_LOGIN_BYPASS = false"));

(async () => {
  await checkSubmissionDrivenRefresh();
  await checkPosterBackfill();
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

  const written = new Map();
  const formalSubmission = {
    ...submittedRecord,
    recordId: "submission_memory",
    studentId: "S001",
    experimentId: "memory",
    uploadedAt: "2026-07-29T01:00:00.000Z",
    answers: { question: "记忆容量是多少？", hypothesis: "可能是七项", analysis: "比较了各组结果", conclusion: "依据结果形成结论", reflection: "下次增加重复次数" }
  };
  const writerDatabase = {
    collection(name) {
      return {
        where(query) {
          const data = name === "students" ? [{ studentId: "S001", name: "测试学生" }]
            : name === "experiment_submissions" && query.experimentId === "memory" ? [formalSubmission]
              : name === "student_memories" ? Array.from(written.values()).filter((item) => item.studentId === query.studentId && (!query.memoryType || item.memoryType === query.memoryType)) : [];
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
    const memoryGenerator = loadGenerator(writerDatabase);
    const event = {
      headers: { authorization: `Bearer ${signedToken("S001", secret)}` },
      body: JSON.stringify({ experimentId: "memory" })
    };
    const result = await memoryGenerator.main(event);
    assert.strictEqual(result.ok, true, `memory write failed: ${result.code}`);
    assert.strictEqual(Array.from(written.values()).filter((item) => item.memoryType === "experiment").length, 1);
    assert.strictEqual(Array.from(written.values()).filter((item) => item.memoryType === "overall").length, 1);
    const originalRequest = https.request;
    process.env.OPENAI_API_KEY = "test-key";
    https.request = (options, callback) => {
      assert.strictEqual(options.hostname, "api.deepseek.com");
      const request = new EventEmitter();
      request.end = () => process.nextTick(() => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.setEncoding = () => {};
        callback(response);
        response.emit("data", JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          strengths: [{ code: "USE_EVIDENCE", quote: "比较了各组结果", observation: "用结果支撑了分析。" }],
          nextSuggestion: "下次在结论中点出具体差异。"
        }) } }] }));
        response.emit("end");
      });
      return request;
    };
    try {
      const enriched = await memoryGenerator.main(event);
      assert.strictEqual(enriched.ok, true);
      const stored = Array.from(written.values()).find((item) => item.memoryType === "experiment");
      assert.strictEqual(stored.promptVersion, 2);
      assert(stored.summary.strengths[0].evidence.includes("比较了各组结果"));
    } finally { https.request = originalRequest; }
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }

  console.log("Knowledge pretest, signed session, student memory and teacher access contracts passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
