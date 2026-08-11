"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const rulesSource = fs.readFileSync(path.join(root, "assets/typing-support-rules.js"), "utf8");
const sandbox = { Date, Object, Array, Number, String };
sandbox.window = sandbox;
vm.runInNewContext(rulesSource, sandbox, { filename: "typing-support-rules.js" });
const rules = sandbox.TypingSupportRules;
const now = 1_000_000;
assert.strictEqual(rules.values.cooldownMs, 180000);

function metrics(overrides) {
  return Object.assign({
    observedDurationMs: 30000,
    effectiveCharacterCount: 15,
    pauseCount: 0,
    longPauseCount: 0,
    currentPauseMs: 0,
    longestPauseMs: 0,
    deleteCount: 0,
    largeDeleteCount: 0,
    focusCount: 1,
    positiveGrowthEvents: [],
    taskStatus: "in_progress",
    isFocused: true
  }, overrides || {});
}

assert.strictEqual(
  rules.evaluate(metrics({ effectiveCharacterCount: 0 }), now).shouldSuggest,
  true,
  "30 seconds without effective text must suggest support"
);
assert(
  rules.evaluate(metrics({ currentPauseMs: 20000 }), now)
    .triggerReasons.includes("repeated_long_pauses")
);
assert(
  rules.evaluate(metrics({ deleteCount: 3 }), now)
    .triggerReasons.includes("deletion_pressure")
);
assert(
  rules.evaluate(metrics({ largeDeleteCount: 1 }), now)
    .triggerReasons.includes("multiple_large_deletions")
);
assert(
  rules.evaluate(metrics({ focusCount: 2, effectiveCharacterCount: 9 }), now)
    .triggerReasons.includes("repeated_focus_without_progress")
);
assert.strictEqual(
  rules.evaluate(metrics({
    deleteCount: 3,
    positiveGrowthEvents: [
      { at: now - 12000, growth: 2 },
      { at: now - 7000, growth: 2 },
      { at: now - 2000, growth: 2 }
    ]
  }), now).protectedBySteadyInput,
  true,
  "steady recent input must suppress a suggestion"
);
assert.strictEqual(
  rules.evaluate(metrics({ effectiveCharacterCount: 20, deleteCount: 20 }), now).shouldSuggest,
  false,
  "complete text must not trigger"
);
assert.strictEqual(
  rules.evaluate(metrics({ observedDurationMs: 29999, effectiveCharacterCount: 0 }), now).shouldSuggest,
  false,
  "minimum observation time must be enforced"
);
assert.strictEqual(
  rules.evaluate(metrics({ taskStatus: "submitted", effectiveCharacterCount: 0 }), now).shouldSuggest,
  false,
  "submitted tasks must not trigger"
);

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

for (const [file, expected] of Object.entries(pageTasks)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const match = source.match(/const VOICE_SUGGESTION_TASKS = new Set\(\[([\s\S]*?)\]\);/);
  assert(match, `${file}: voice suggestion whitelist missing`);
  const actual = Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
  assert.deepStrictEqual(actual, expected, `${file}: unexpected voice suggestion whitelist`);
  assert(source.includes('field.dataset.voiceSuggestion = "true"'), `${file}: metadata assignment missing`);
  assert(source.includes('src="assets/typing-support-rules.js"'), `${file}: rules script missing`);
  assert(source.includes('src="assets/typing-support.js"'), `${file}: controller script missing`);
  assert(source.includes(`TypingSupport.init({ experimentId: "${path.basename(file, ".html")}"`),
    `${file}: controller init missing`);
  assert(!actual.some((task) => task.endsWith("_group")), `${file}: group fields must be excluded`);
}

for (const file of ["poster.html", "teacher.html", "teacher-dashboard.html"]) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
  const source = fs.readFileSync(fullPath, "utf8");
  assert(!source.includes("typing-support.js"), `${file}: typing support must not load`);
}

const controller = fs.readFileSync(path.join(root, "assets/typing-support.js"), "utf8");
const partner = fs.readFileSync(path.join(root, "assets/memory-partner.js"), "utf8");
const voice = fs.readFileSync(path.join(root, "assets/voice-assistant.js"), "utf8");
assert(controller.includes("typing-support-state-v1") || controller.includes("typingSupportState"));
assert(controller.includes("studentResponse: \"ignored\""));
assert(controller.includes("voice-assistant:text-inserted"));
assert(partner.includes("showVoiceSuggestion") && partner.includes("openVoiceFor"));
assert(voice.includes("setTarget") && voice.includes("voice-assistant:text-inserted"));

function createControllerHarness(options) {
  class FakeElement {
    constructor(experimentId) {
      this.dataset = {
        agentTrack: "true",
        voiceSuggestion: "true",
        experimentId,
        stageId: "question",
        taskId: "question"
      };
      this.disabled = false;
      this.readOnly = false;
      this.isConnected = true;
      this.value = "";
    }
    matches(selector) {
      return selector.includes('data-voice-suggestion="true"');
    }
    focus() {
      fakeDocument.activeElement = this;
    }
  }

  const documentListeners = {};
  const windowListeners = {};
  const storage = new Map(Object.entries(options.storage || {}));
  const requests = [];
  let suggestion = null;
  let suggestionCount = 0;
  let openedVoiceTarget = null;
  const fakeDocument = {
    activeElement: null,
    addEventListener(name, listener) {
      (documentListeners[name] ||= []).push(listener);
    }
  };
  const context = {
    window: null,
    Element: FakeElement,
    document: fakeDocument,
    location: { pathname: `/${options.experimentId}.html` },
    console,
    Date,
    Object,
    Array,
    Number,
    String,
    Promise,
    AGENT_DEBUG: false,
    setTimeout() { return 1; },
    clearTimeout() {},
    addEventListener(name, listener) {
      (windowListeners[name] ||= []).push(listener);
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); }
    },
    BrainPlatform: {
      config: {
        endpoints: { saveAgentIntervention: "/saveAgentIntervention" },
        storageKeys: {
          typingSupportState: "typing-support-state-v1",
          agentInterventionOutbox: "agent-intervention-outbox-v1"
        }
      },
      identity: {
        readStudentSession: () => options.session || {
          role: "student",
          isGuest: false,
          studentId: "S001",
          sessionToken: "signed-session-token"
        }
      }
    },
    LearningBehaviorTracker: {
      getTaskMetrics: () => metrics({ effectiveCharacterCount: 0 })
    },
    TypingSupportRules: rules,
    VirtualAgent: {
      isBusy: () => false,
      isSuggestionElement: () => false,
      showVoiceSuggestion(value) {
        suggestion = value;
        suggestionCount += 1;
        return true;
      },
      hideVoiceSuggestion(response) {
        if (!suggestion) return false;
        const current = suggestion;
        suggestion = null;
        current.onResponse(response);
        return true;
      },
      openVoiceFor(target) {
        openedVoiceTarget = target;
        return true;
      }
    },
    async fetch(url, request) {
      requests.push(JSON.parse(request.body));
      return { ok: true, async json() { return { ok: true }; } };
    }
  };
  context.window = context;
  const controllerSource = fs.readFileSync(path.join(root, "assets/typing-support.js"), "utf8");
  vm.runInNewContext(controllerSource, context, { filename: "typing-support.js" });
  context.TypingSupport.init({ experimentId: options.experimentId });
  const target = new FakeElement(options.experimentId);

  function dispatch(name, event) {
    for (const listener of documentListeners[name] || []) listener(event);
  }

  return {
    context,
    target,
    storage,
    requests,
    dispatch,
    focus() {
      fakeDocument.activeElement = target;
      dispatch("focusin", { target });
    },
    respond(response) {
      const current = suggestion;
      suggestion = null;
      current.onResponse(response);
    },
    get suggestionMessage() { return suggestion && suggestion.message; },
    get suggestionCount() { return suggestionCount; },
    get openedVoiceTarget() { return openedVoiceTarget; }
  };
}

(async () => {
  const accepted = createControllerHarness({ experimentId: "memory" });
  accepted.focus();
  assert.strictEqual(accepted.suggestionCount, 1);
  assert.strictEqual(
    accepted.suggestionMessage,
    "如果打字有困难的话，可以让语音转文字助手来帮你！"
  );
  const voiceHooks = accepted.context.__TypingSupportTestHooks;
  const initialSignature = voiceHooks.stateSignature(accepted.target, ["no_effective_text"]);
  assert.strictEqual(
    initialSignature,
    voiceHooks.stateSignature(accepted.target, ["no_effective_text"]),
    "the same text and difficulty types must produce the same state"
  );
  accepted.target.value = "新想法";
  assert.notStrictEqual(
    initialSignature,
    voiceHooks.stateSignature(accepted.target, ["no_effective_text"]),
    "changed text must produce a new state"
  );
  accepted.target.value = "";
  accepted.respond("accepted");
  assert.strictEqual(accepted.openedVoiceTarget, accepted.target);
  let localEntries = JSON.parse(accepted.storage.get("typing-support-state-v1"));
  assert.strictEqual(localEntries[0].response, "accepted");
  assert.strictEqual(localEntries[0].intervention.voiceInsertSucceeded, false,
    "opening voice without an insertion must remain unsuccessful");
  accepted.dispatch("voice-assistant:text-inserted", {
    detail: { target: accepted.target, insertedCharacterCount: 2 }
  });
  localEntries = JSON.parse(accepted.storage.get("typing-support-state-v1"));
  assert.strictEqual(localEntries[0].intervention.voiceInsertSucceeded, true);

  const dismissed = createControllerHarness({ experimentId: "memory" });
  dismissed.focus();
  dismissed.respond("dismissed");
  assert.strictEqual(
    JSON.parse(dismissed.storage.get("typing-support-state-v1"))[0].response,
    "dismissed"
  );

  const ignored = createControllerHarness({ experimentId: "memory" });
  ignored.focus();
  ignored.dispatch("learning-behavior:stage-submitted", {
    detail: { experimentId: "memory", stageId: "question" }
  });
  assert.strictEqual(
    JSON.parse(ignored.storage.get("typing-support-state-v1"))[0].response,
    "ignored"
  );

  const persistedStorage = Object.fromEntries(accepted.storage);
  const refreshed = createControllerHarness({
    experimentId: "memory",
    storage: persistedStorage
  });
  refreshed.focus();
  assert.strictEqual(refreshed.suggestionCount, 0, "refresh must not repeat the task suggestion");

  const otherExperiment = createControllerHarness({
    experimentId: "nback",
    storage: persistedStorage
  });
  otherExperiment.focus();
  assert.strictEqual(otherExperiment.suggestionCount, 1,
    "a reminder in one experiment must not block another experiment");

  const guest = createControllerHarness({
    experimentId: "memory",
    session: { role: "guest", isGuest: true, studentId: "guest" }
  });
  guest.focus();
  assert.strictEqual(guest.suggestionCount, 0);

  await Promise.resolve();
  console.log("Typing support rule, interaction and page contract checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
