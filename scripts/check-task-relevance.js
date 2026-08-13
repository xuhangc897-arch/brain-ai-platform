"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Module = require("module");
const {
  TEST_STUDENT_SESSION_SECRET,
  authenticatedEvent
} = require("./test-student-session");

process.env.STUDENT_SESSION_SECRET = TEST_STUDENT_SESSION_SECRET;

const root = path.resolve(__dirname, "..");
const pageTasks = {
  "memory.html": [
    "question", "hypothesis", "brainFinding", "finalConclusion",
    "designImprove", "teamwork", "inquiryReflection"
  ],
  "nback.html": [
    "researchQuestion", "hypothesis", "headbandObservation",
    "conclusion", "improvement", "persuasiveness"
  ],
  "interference.html": [
    "lifeFactors", "materialFactors", "hypothesis",
    "independentVariablePlan", "dependentVariablePlan", "controlVariablePlan",
    "headband", "conclusion", "strengths", "improvements", "learningInsight"
  ],
  "strategies.html": [
    "brainstormIndividual", "hypothesis1", "hypothesis2", "headband",
    "conclusion", "designImprove", "surprise", "applicability"
  ]
};

const configSource = fs.readFileSync(path.join(root, "assets", "task-relevance-config.js"), "utf8");
const configSandbox = { Map, Object, Array, String };
configSandbox.window = configSandbox;
vm.runInNewContext(configSource, configSandbox, { filename: "task-relevance-config.js" });
const clientTasks = JSON.parse(JSON.stringify(configSandbox.TaskRelevanceConfig.tasks));
const serverTasks = require(path.join(root, "cloudfunctions", "checkTaskRelevance", "task-config.js"));
assert.deepStrictEqual(clientTasks, serverTasks, "client and server relevance task configs must match");

for (const [file, expected] of Object.entries(pageTasks)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const match = source.match(/const VOICE_SUGGESTION_TASKS = new Set\(\[([\s\S]*?)\]\);/);
  assert(match, `${file}: personal-answer whitelist missing`);
  const actual = Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
  assert.deepStrictEqual(actual, expected, `${file}: relevance whitelist must match personal long answers`);
  assert(source.includes('field.dataset.relevanceCheck = "true"'), `${file}: relevance metadata missing`);
  assert(source.includes('src="assets/task-relevance-config.js"'), `${file}: config script missing`);
  assert(source.includes('src="assets/task-relevance.js"'), `${file}: controller script missing`);
  assert(source.includes(`TaskRelevance.init({ experimentId: "${path.basename(file, ".html")}"`),
    `${file}: relevance init missing`);
  assert(!actual.some((task) => task.endsWith("_group")), `${file}: group answers must be excluded`);
}

for (const file of ["poster.html", "teacher.html", "teacher-dashboard.html"]) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
  const source = fs.readFileSync(fullPath, "utf8");
  assert(!source.includes("task-relevance.js"), `${file}: relevance checks must not load`);
}

const partnerSource = fs.readFileSync(path.join(root, "assets", "memory-partner.js"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "assets", "task-relevance.js"), "utf8");
const platformSource = fs.readFileSync(path.join(root, "assets", "platform-core.js"), "utf8");
assert(partnerSource.includes("showRelevanceSuggestion"));
assert(partnerSource.includes("hideRelevanceSuggestion"));
assert(partnerSource.includes("查看任务要求"));
assert(partnerSource.includes("仍然保留"));
assert(platformSource.includes("checkTaskRelevance"));
assert(platformSource.includes("task-relevance-outbox-v1"));
assert(controllerSource.includes("const taskStates = new Map()"));
assert(controllerSource.includes("function snapshotTarget("));
assert(controllerSource.includes("function presentPending("));
assert(controllerSource.includes("function beforePageChange("));
assert(controllerSource.includes("function afterPageRender("));
assert(!controllerSource.includes("const unchanged = target.isConnected"),
  "async relevance results must not depend on the original DOM node remaining connected");
assert(controllerSource.includes("Array.from(taskStates.values()"),
  "stage submission must include saved tasks from unloaded pages");

const controllerSandbox = {
  Array,
  Map,
  WeakMap,
  Object,
  String,
  Number,
  Date,
  TextEncoder,
  console
};
controllerSandbox.window = controllerSandbox;
vm.runInNewContext(controllerSource, controllerSandbox, { filename: "task-relevance.js" });
const controllerHooks = controllerSandbox.__TaskRelevanceTestHooks;
assert.strictEqual(controllerHooks.normalizeText("  学习\n 任务  "), "学习 任务");
assert.strictEqual(controllerHooks.editSize("学习任务", "学习实验任务"), 2);
assert.strictEqual(controllerHooks.constants.OFF_TOPIC_CONFIDENCE, 0.75);
assert.strictEqual(controllerHooks.constants.DIRECTION_CONFIDENCE, 0.70);
assert.strictEqual(controllerHooks.constants.PROMPT_COOLDOWN_MS, 60000);
assert.strictEqual(controllerHooks.constants.MIN_BLUR_EDIT_SIZE, 3);
assert.strictEqual(
  controllerHooks.promptForResult({
    status: "off_topic", confidence: 0.74, supportHint: ""
  }),
  null,
  "low-confidence off-topic results must not prompt"
);
assert.strictEqual(
  controllerHooks.promptForResult({
    status: "incomplete", confidence: 0.69, supportHint: ""
  }),
  null,
  "low-confidence incomplete results must not prompt"
);
assert.strictEqual(
  controllerHooks.promptForResult({ status: "off_topic", confidence: 0.75, supportHint: "" }).kind,
  "off_topic"
);
assert.strictEqual(
  controllerHooks.promptForResult({ status: "vague", confidence: 0.70, supportHint: "" }).kind,
  "vague"
);
assert.strictEqual(
  controllerHooks.promptForResult({ status: "partially_relevant", confidence: 0.70, supportHint: "旧提示" }).category,
  "direction",
  "historical partial results must remain readable"
);
assert.strictEqual(
  controllerHooks.promptForResult({
    status: "uncertain", confidence: 0, supportHint: ""
  }),
  null,
  "uncertain results must never prompt"
);
assert.strictEqual(
  controllerHooks.promptForResult({
    status: "insufficient", confidence: 1, supportHint: ""
  }).kind,
  "insufficient"
);
const directionPrompt = controllerHooks.promptForResult({
  status: "incomplete", confidence: 0.70, supportHint: ""
});
assert(!controllerHooks.tieredMessage(directionPrompt, 1).includes("助手可以帮你整理"));
assert(controllerHooks.tieredMessage(directionPrompt, 2).includes("助手可以帮你整理"));
assert(controllerHooks.tieredMessage(directionPrompt, 3).includes("①观察到了什么"));
const contentPrompt = controllerHooks.promptForResult({
  status: "cognitive_difficulty", confidence: 1, supportHint: ""
});
assert(controllerHooks.tieredMessage(contentPrompt, 2).includes("实验现象"));

function createPaginationHarness(result) {
  class FakeElement {
    constructor(taskId, value) {
      this.dataset = {
        agentTrack: "true", relevanceCheck: "true", field: taskId,
        experimentId: "memory", stageId: "question", taskId
      };
      this.value = value;
      this.disabled = false;
      this.readOnly = false;
      this.isConnected = true;
    }
    matches(selector) { return selector.includes('data-relevance-check="true"'); }
  }
  const listeners = {};
  const storage = new Map();
  const requests = [];
  const prompts = [];
  let targets = [];
  let resolveRequest;
  const context = {
    window: null, Element: FakeElement, Array, Map, WeakMap, Object, String, Number, Date,
    TextEncoder, crypto: require("crypto").webcrypto, console, setTimeout, clearTimeout,
    location: { pathname: "/memory.html" },
    addEventListener() {},
    document: {
      activeElement: null,
      addEventListener(name, listener) { (listeners[name] ||= []).push(listener); },
      querySelectorAll() { return targets; }
    },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); }
    },
    BrainPlatform: {
      config: {
        endpoints: { checkTaskRelevance: "/checkTaskRelevance" },
        storageKeys: {
          taskRelevanceState: "task-relevance-state-v1",
          taskRelevanceOutbox: "task-relevance-outbox-v1"
        }
      },
      identity: { readStudentSession: () => ({ studentId: "S001", sessionToken: "token" }) }
    },
    TaskRelevanceConfig: {
      get(experimentId, taskId) {
        if (experimentId !== "memory" || !["question", "hypothesis"].includes(taskId)) return null;
        return { stageId: "question", taskTitle: taskId, taskInstruction: taskId };
      }
    },
    VirtualAgent: {
      isBusy: () => false,
      isSuggestionElement: () => false,
      showRelevanceSuggestion(prompt) { prompts.push(prompt); return true; },
      hideRelevanceSuggestion() { return true; }
    },
    fetch(url, options) {
      requests.push(JSON.parse(options.body));
      return new Promise((resolve) => { resolveRequest = () => resolve({
        ok: true,
        async json() { return Object.assign({ ok: true, textHash: "hash-1", promptEligible: true }, result); }
      }); });
    }
  };
  context.window = context;
  vm.runInNewContext(controllerSource, context, { filename: "task-relevance-pagination.js" });
  context.TaskRelevance.init({ experimentId: "memory" });
  return {
    context, requests, prompts,
    setTargets(next) { targets = next; },
    resolveRequest() { resolveRequest(); },
    target: (taskId, value) => new FakeElement(taskId, value)
  };
}

const documents = new Map();
const students = [{ studentId: "S001", name: "测试学生", class: "七年级", group: "一组" }];
let serverTick = 0;

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
const relevanceFunction = require(path.join(root, "cloudfunctions", "checkTaskRelevance", "index.js"));
Module._load = originalLoad;
const rawRelevanceMain = relevanceFunction.main;
relevanceFunction.main = (body) => rawRelevanceMain(authenticatedEvent(body));

function payload(overrides) {
  return Object.assign({
    schemaVersion: 1,
    action: "check",
    studentId: "S001",
    experimentId: "memory",
    stageId: "question",
    taskId: "question",
    pageId: "memory.html",
    inputText: "我想探究数字材料长度变化是否会影响短时记忆容量",
    trigger: "blur"
  }, overrides || {});
}

(async () => {
  const paged = createPaginationHarness({
    result: { status: "off_topic", confidence: 0.9 }, promptEligible: true
  });
  const originalTarget = paged.target("question", "我只想聊今天的午饭是什么");
  paged.setTargets([originalTarget]);
  const firstCheck = paged.context.TaskRelevance.checkTarget(originalTarget, { force: true });
  while (!paged.requests.length) await new Promise((resolve) => setTimeout(resolve, 0));
  originalTarget.isConnected = false;
  paged.setTargets([]);
  paged.resolveRequest();
  await firstCheck;
  assert.strictEqual(paged.prompts.length, 0, "unloaded input must defer its relevance prompt");
  const replacement = paged.target("question", originalTarget.value);
  paged.setTargets([replacement]);
  paged.context.TaskRelevance.afterPageRender();
  assert.strictEqual(paged.prompts.length, 1, "returning to the page must restore the deferred prompt");
  assert.strictEqual(paged.requests.filter((item) => item.trigger !== "prompt_shown").length, 1,
    "page restoration must not repeat the same text check");

  const relevant = createPaginationHarness({
    result: { status: "relevant", confidence: 0.95 }, promptEligible: true
  });
  const relevantTarget = relevant.target("question", "我想比较不同材料长度下的记忆容量");
  relevant.setTargets([relevantTarget]);
  const relevantCheck = relevant.context.TaskRelevance.checkTarget(relevantTarget, { force: true });
  while (!relevant.requests.length) await new Promise((resolve) => setTimeout(resolve, 0));
  relevant.resolveRequest();
  await relevantCheck;
  assert.strictEqual(relevant.prompts.length, 0, "relevant text must not trigger a prompt");

  const memoryQuestion = serverTasks.find((task) =>
    task.experimentId === "memory" && task.taskId === "question"
  );
  assert.strictEqual(
    relevanceFunction.__test.localScreen("", memoryQuestion).reasonCode,
    "empty_text"
  );
  assert.strictEqual(
    relevanceFunction.__test.localScreen("不知道", memoryQuestion).status,
    "cognitive_difficulty"
  );
  assert.strictEqual(
    relevanceFunction.__test.localScreen("哈哈哈哈哈哈哈哈哈哈哈哈", memoryQuestion).reasonCode,
    "repeated_text"
  );
  assert.strictEqual(
    relevanceFunction.__test.localScreen("我想研究完全不同措辞表达的记忆现象", memoryQuestion),
    null,
    "local rules must not require configured keywords"
  );
  assert.strictEqual(relevanceFunction.__test.localScreen("一二三四五", memoryQuestion).status, "insufficient");
  assert.strictEqual(relevanceFunction.__test.localScreen("一二三四五六", memoryQuestion), null);
  assert.strictEqual(relevanceFunction.__test.localScreen("abcdef7", memoryQuestion).status, "insufficient");
  assert.strictEqual(relevanceFunction.__test.localScreen("abcdef78", memoryQuestion), null);
  assert.strictEqual(relevanceFunction.__test.localScreen("一二三abcde", memoryQuestion).status, "insufficient");
  assert.strictEqual(relevanceFunction.__test.localScreen("一二三abcdef78", memoryQuestion), null);

  for (const status of [
    "relevant", "incomplete", "vague", "off_topic",
    "insufficient", "cognitive_difficulty", "inappropriate", "uncertain"
  ]) {
    const reasonCode = {
      relevant: "addresses_task",
      incomplete: "incomplete_response",
      vague: "vague_response",
      off_topic: "unrelated_content",
      insufficient: "too_little_content",
      cognitive_difficulty: "expressed_difficulty",
      inappropriate: "inappropriate_content",
      uncertain: "uncertain"
    }[status];
    const validated = relevanceFunction.__test.validateAiResult({
      status,
      confidence: 0.8,
      reasonCode,
      briefReason: "测试",
      supportHint: ""
    });
    assert(validated, `${status} must be accepted`);
  }
  assert.strictEqual(relevanceFunction.__test.validateAiResult({
    status: "wrong",
    confidence: 2,
    reasonCode: "anything",
    briefReason: "",
    supportHint: ""
  }), null);

  const unknownField = await relevanceFunction.main(payload({ unexpected: true }));
  assert.strictEqual(unknownField.code, "UNKNOWN_FIELD");
  const unknownStudent = await relevanceFunction.main(payload({ studentId: "S404" }));
  assert.strictEqual(unknownStudent.code, "STUDENT_MISMATCH");
  const unauthenticated = await rawRelevanceMain(payload());
  assert.strictEqual(unauthenticated.code, "UNAUTHORIZED");
  const crossStudent = await rawRelevanceMain(authenticatedEvent(
    payload({ studentId: "S002" }),
    "S001"
  ));
  assert.strictEqual(crossStudent.code, "STUDENT_MISMATCH");
  const mismatchedTask = await relevanceFunction.main(payload({ stageId: "analysis" }));
  assert.strictEqual(mismatchedTask.code, "UNKNOWN_TASK");
  const overlong = await relevanceFunction.main(payload({ inputText: "字".repeat(2001) }));
  assert.strictEqual(overlong.code, "INVALID_TEXT");

  let aiCalls = 0;
  relevanceFunction.__test.setAiCaller(async () => {
    aiCalls += 1;
    return {
      status: "off_topic",
      confidence: 0.91,
      reasonCode: "unrelated_content",
      briefReason: "内容与当前记忆任务明显无关",
      supportHint: ""
    };
  });
  const created = await relevanceFunction.main(payload());
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.operation, "created");
  assert.strictEqual(created.result.status, "off_topic");
  assert.strictEqual(created.promptEligible, true);
  assert.strictEqual(aiCalls, 1);
  const firstId = created.recordId;
  const first = documents.get(firstId);
  assert.strictEqual(first.interventionType, "task_relevance");
  assert.strictEqual(first.studentName, "测试学生");
  assert.strictEqual(first.checks.length, 1);
  assert(first.initialText);
  assert.deepStrictEqual(first.createdAt, { $serverDate: 1 });

  const duplicate = await relevanceFunction.main(payload());
  assert.strictEqual(duplicate.cached, true);
  assert.strictEqual(aiCalls, 1, "same normalized text must not call AI twice");
  assert.strictEqual(documents.size, 1);
  const normalizedDuplicate = await relevanceFunction.main(payload({
    inputText: `  ${payload().inputText}  `
  }));
  assert.strictEqual(normalizedDuplicate.cached, true);
  assert.strictEqual(aiCalls, 1, "whitespace-only changes must not call AI twice");

  const prompted = await relevanceFunction.main(payload({ prompted: true, trigger: "prompt_shown" }));
  assert.strictEqual(prompted.promptCount, 1);
  await relevanceFunction.main(payload({ prompted: true, trigger: "prompt_shown" }));
  assert.strictEqual(documents.get(firstId).promptCount, 1, "same hash must not count twice");

  const viewed = await relevanceFunction.main({
    schemaVersion: 1,
    action: "interaction",
    studentId: "S001",
    experimentId: "memory",
    stageId: "question",
    taskId: "question",
    pageId: "memory.html",
    textHash: created.textHash,
    interaction: "view_task"
  });
  assert.strictEqual(viewed.ok, true);
  assert.strictEqual(documents.get(firstId).taskRequirementViewed, true);

  const modifiedText = "我想比较不同数字材料长度下的正确回忆数量和短时记忆容量";
  await relevanceFunction.main(payload({ inputText: modifiedText }));
  assert.strictEqual(documents.get(firstId).modifiedAfterPrompt, true);
  assert.strictEqual(documents.get(firstId).modifiedText, modifiedText);
  assert.strictEqual(documents.get(firstId).recheckedAfterModification, true);
  await relevanceFunction.main(payload({
    inputText: modifiedText,
    prompted: true,
    trigger: "prompt_shown"
  }));
  assert.strictEqual(documents.get(firstId).promptCount, 2);
  const thirdText = "我准备比较每一种数字长度下的回忆成绩，再说明短时记忆容量的变化";
  const thirdCheck = await relevanceFunction.main(payload({ inputText: thirdText }));
  assert.strictEqual(thirdCheck.promptEligible, true, "a task may prompt again for changed text");
  await relevanceFunction.main(payload({
    inputText: thirdText,
    prompted: true,
    trigger: "prompt_shown"
  }));
  assert.strictEqual(documents.get(firstId).promptCount, 3);

  const submitted = await relevanceFunction.main({
    schemaVersion: 1,
    action: "submit",
    studentId: "S001",
    experimentId: "memory",
    stageId: "question",
    taskId: "question",
    pageId: "memory.html",
    finalText: modifiedText,
    trigger: "stage_submit"
  });
  assert.strictEqual(submitted.ok, true);
  assert.strictEqual(documents.get(firstId).finalSubmittedText, modifiedText);

  relevanceFunction.__test.setAiCaller(async () => ({ invalid: true }));
  const invalidAi = await relevanceFunction.main(payload({
    experimentId: "nback",
    stageId: "question",
    taskId: "researchQuestion",
    pageId: "nback.html",
    inputText: "我想探究任务难度改变时工作记忆表现会发生怎样的变化"
  }));
  assert.strictEqual(invalidAi.result.status, "uncertain");
  assert.strictEqual(invalidAi.promptEligible, false);

  relevanceFunction.__test.setAiCaller(async () => {
    throw Object.assign(new Error("offline"), { code: "AI_TIMEOUT" });
  });
  const failedAi = await relevanceFunction.main(payload({
    experimentId: "strategies",
    stageId: "question",
    taskId: "brainstormIndividual",
    pageId: "strategies.html",
    inputText: "我平时会通过主动回忆和画图来帮助自己长期记住学习内容"
  }));
  assert.strictEqual(failedAi.result.status, "uncertain");
  assert.strictEqual(failedAi.promptEligible, false);

  console.log("Task relevance contract, rules, CloudBase, and AI fallback checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
