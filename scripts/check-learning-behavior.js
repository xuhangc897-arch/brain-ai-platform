"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const pages = {
  "memory.html": [
    "question", "question_group", "hypothesis", "hypothesis_group", "brainFinding",
    "finalConclusion", "finalConclusion_group", "designImprove", "designImprove_group",
    "teamwork", "teamwork_group", "inquiryReflection", "inquiryReflection_group"
  ],
  "nback.html": [
    "researchQuestion", "researchQuestion_group", "hypothesis", "hypothesis_group",
    "headbandObservation", "conclusion", "conclusion_group", "improvement",
    "improvement_group", "persuasiveness", "persuasiveness_group"
  ],
  "interference.html": [
    "lifeFactors", "lifeFactors_group", "materialFactors", "materialFactors_group",
    "hypothesis", "hypothesis_group", "interferenceStagePlan", "independentVariablePlan",
    "dependentVariablePlan", "controlVariablePlan", "headband", "conclusion",
    "conclusion_group", "strengths", "strengths_group", "improvements",
    "improvements_group", "learningInsight", "learningInsight_group"
  ],
  "strategies.html": [
    "brainstormIndividual", "brainstormGroup", "hypothesis1", "hypothesis1_group",
    "hypothesis2", "hypothesis2_group", "headband", "conclusion", "conclusion_group",
    "designImprove", "designImprove_group", "surprise", "surprise_group",
    "applicability", "applicability_group"
  ]
};

for (const [file, tasks] of Object.entries(pages)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  assert(source.includes('src="assets/learning-behavior-tracker.js"'), `${file}: tracker script missing`);
  assert(source.includes(`LearningBehaviorTracker.init({ experimentId: "${path.basename(file, ".html") === "memory" ? "memory" : path.basename(file, ".html")}"`), `${file}: tracker init missing`);
  assert(source.includes("applyLearningBehaviorMetadata();"), `${file}: metadata application missing`);
  assert(source.includes("markStageSubmitted(steps[state.currentStep].id)"), `${file}: submit hook missing`);
  for (const task of tasks) {
    assert(new RegExp(`\\b${task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(source), `${file}: ${task} missing from allowlist`);
  }
}

const poster = fs.readFileSync(path.join(root, "poster.html"), "utf8");
assert(!poster.includes("learning-behavior-tracker.js"), "poster.html must remain outside behavior tracking");
assert(!/recallInput\s*:/.test(fs.readFileSync(path.join(root, "interference.html"), "utf8")), "recall input must be excluded");

const trackerSource = fs.readFileSync(path.join(root, "assets/learning-behavior-tracker.js"), "utf8");
const sandbox = {
  AGENT_DEBUG: true,
  Array,
  Map,
  WeakMap,
  Object,
  String,
  Number,
  Date,
  console
};
sandbox.window = sandbox;
vm.runInNewContext(trackerSource, sandbox, { filename: "learning-behavior-tracker.js" });
const hooks = sandbox.__LearningBehaviorTrackerTestHooks;
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(hooks.commonEdit("学习ABCDE", "学习"))),
  { inserted: 0, deleted: 5 },
  "Unicode edit summary must detect a five-character deletion"
);
assert.strictEqual(hooks.effectiveCount(" 学 习\n🙂 "), 3, "effective count must ignore whitespace");
assert.strictEqual(hooks.constants.PAUSE_MS, 3000);
assert.strictEqual(hooks.constants.LARGE_DELETE_SIZE, 5);
assert.strictEqual(hooks.constants.SAVE_DELAY_MS, 5000);
assert.strictEqual(hooks.constants.OUTBOX_LIMIT, 100);

assert(trackerSource.includes("compositionstart") && trackerSource.includes("compositionend"), "IME events missing");
assert(trackerSource.includes("voice-assistant:before-text-insert"), "voice attribution event missing");
assert(trackerSource.includes("virtual-agent:ai-opened"), "AI attribution event missing");
assert(!trackerSource.includes("keydown"), "tracker must not capture individual key events");

const platform = fs.readFileSync(path.join(root, "assets/platform-core.js"), "utf8");
assert(platform.includes("saveLearningRecord"), "CloudBase endpoint missing");
assert(platform.includes("learning-behavior-outbox-v1"), "outbox key missing");

(async () => {
  class FakeElement {
    constructor(field, stage) {
      this.dataset = {
        agentTrack: "true",
        experimentId: "memory",
        stageId: stage,
        taskId: field,
        field
      };
      this.value = "";
      this.isConnected = true;
    }
    matches(selector) {
      return selector.startsWith("textarea[data-agent-track");
    }
  }

  const documentListeners = {};
  const windowListeners = {};
  const storage = new Map();
  const requests = [];
  let session = {
    role: "student",
    isGuest: false,
    studentId: "S001"
  };
  let fetchShouldFail = false;
  const fakeDocument = {
    activeElement: null,
    addEventListener(name, listener) {
      (documentListeners[name] ||= []).push(listener);
    },
    dispatchEvent(event) {
      for (const listener of documentListeners[event.type] || []) listener(event);
      return true;
    }
  };
  const behaviorSandbox = {
    AGENT_DEBUG: false,
    Array,
    Map,
    WeakMap,
    Object,
    String,
    Number,
    Date,
    Element: FakeElement,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options && options.detail;
      }
    },
    document: fakeDocument,
    location: { pathname: "/memory.html" },
    console,
    setTimeout,
    clearTimeout,
    addEventListener(name, listener) {
      (windowListeners[name] ||= []).push(listener);
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); }
    },
    BrainPlatform: {
      config: {
        endpoints: { saveLearningRecord: "/saveLearningRecord" },
        storageKeys: { learningBehaviorOutbox: "learning-behavior-outbox-v1" }
      },
      identity: { readStudentSession: () => session }
    },
    async fetch(url, options) {
      requests.push(JSON.parse(options.body));
      if (fetchShouldFail) throw new Error("offline");
      return { ok: true, async json() { return { ok: true }; } };
    }
  };
  behaviorSandbox.window = behaviorSandbox;
  vm.runInNewContext(trackerSource, behaviorSandbox, { filename: "learning-behavior-tracker.js" });
  assert.strictEqual(behaviorSandbox.LearningBehaviorTracker.init({ experimentId: "memory" }), true);

  function dispatch(name, target, detail) {
    const event = { target, detail, isComposing: false };
    for (const listener of documentListeners[name] || []) listener(event);
  }

  const question = new FakeElement("question", "question");
  fakeDocument.activeElement = question;
  dispatch("focusin", question);
  question.value = "键盘";
  dispatch("input", question);
  dispatch("compositionstart", question);
  question.value = "键盘zhongwen";
  dispatch("input", question);
  question.value = "键盘中文";
  dispatch("compositionend", question);
  dispatch("input", question);
  dispatch("voice-assistant:before-text-insert", null, { target: question, insertedCharacterCount: 2 });
  question.value += "语音";
  dispatch("input", question);
  dispatch("virtual-agent:ai-opened", null, { experimentId: "memory", stageId: "question" });

  let summary = behaviorSandbox.LearningBehaviorTracker.getDebugSummary()[0];
  assert.strictEqual(summary.inputMethod, "mixed");
  assert.strictEqual(summary.keyboardInputCharacterCount, 4, "IME final text must count once");
  assert.strictEqual(summary.voiceUsed, true);
  assert.strictEqual(summary.aiUsed, true);

  dispatch("virtual-agent:ai-opened", null, { experimentId: "memory", stageId: "conclusion" });
  const conclusion = new FakeElement("conclusion", "conclusion");
  fakeDocument.activeElement = conclusion;
  dispatch("focusin", conclusion);
  summary = behaviorSandbox.LearningBehaviorTracker.getDebugSummary()
    .find((item) => item.taskId === "conclusion");
  assert.strictEqual(summary.aiUsed, true, "pending AI use must attach to the next task in that stage");

  fetchShouldFail = true;
  dispatch("focusout", question);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(storage.get("learning-behavior-outbox-v1"), "offline summary must remain in the outbox");

  await behaviorSandbox.LearningBehaviorTracker.markStageSubmitted("question");
  summary = behaviorSandbox.LearningBehaviorTracker.getDebugSummary()
    .find((item) => item.taskId === "question");
  assert.strictEqual(summary.taskStatus, "submitted");

  const requestCount = requests.length;
  session = { role: "guest", isGuest: true, studentId: "guest" };
  await behaviorSandbox.LearningBehaviorTracker.flush({ keepalive: true });
  assert.strictEqual(requests.length, requestCount, "guest pagehide must not send queued records");

  console.log("Learning behavior tracker contract checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
