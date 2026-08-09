"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function checkVoiceSession() {
  const prepare = deferred();
  const connect = deferred();
  let asrCallbacks = null;
  let recorderStarted = false;
  const documentListeners = {};
  const context = {
    console,
    Object,
    Array,
    Number,
    String,
    Promise,
    document: {
      readyState: "loading",
      addEventListener(name, listener) {
        documentListeners[name] = listener;
      }
    },
    VoiceRecorder: {
      create() {
        return {
          prepare: () => prepare.promise,
          start() { recorderStarted = true; },
          stop() {},
          isSupported: () => true
        };
      }
    },
    AsrClient: {
      create(callbacks) {
        asrCallbacks = callbacks;
        return {
          connect: () => connect.promise,
          sendAudio: () => true,
          reset() {},
          stop() {
            callbacks.onFinal("语音问题");
            callbacks.onStateChange("idle");
          }
        };
      }
    }
  };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "assets", "voice-assistant.js"), "utf8"),
    context,
    { filename: "voice-assistant.js" }
  );

  const states = [];
  const finalTexts = [];
  const session = context.VoiceAssistant.createSession({
    onStateChange: (state) => states.push(state),
    onFinal: (text) => finalTexts.push(text)
  });
  const startPromise = session.start();
  assert.deepStrictEqual(states, ["preparing"], "voice must remain in preparing state before permission is ready");

  prepare.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepStrictEqual(states, ["preparing"], "voice must not announce recording before ASR connects");

  connect.resolve();
  await startPromise;
  assert.strictEqual(recorderStarted, true, "recorder must start after ASR connects");
  assert.strictEqual(states.at(-1), "recording", "voice must announce recording only after capture starts");

  session.stop();
  assert(states.includes("finalizing"), "stop must enter finalizing state");
  assert.strictEqual(states.at(-1), "completed", "ASR final result must complete the session");
  assert.deepStrictEqual(finalTexts, ["语音问题"], "final transcript must be preserved");
  assert(asrCallbacks, "ASR callbacks must be registered");
}

function createResponse() {
  return {
    statusCode: 0,
    payload: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() {}
  };
}

async function checkAssessmentGuard() {
  const handler = require(path.join(ROOT, "api", "chat.js"));
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let fetchCount = 0;
  let upstreamBody = null;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async (_url, request) => {
    fetchCount += 1;
    upstreamBody = JSON.parse(request.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "请先从材料中找线索。" } }] };
      }
    };
  };

  try {
    const lockedResponse = createResponse();
    await handler({ method: "POST", body: { question: "第1题选什么？", currentStep: "侦探小结" } }, lockedResponse);
    assert.strictEqual(lockedResponse.statusCode, 403);
    assert.strictEqual(lockedResponse.payload.code, "ASSESSMENT_LOCKED");
    assert.strictEqual(fetchCount, 0, "assessment requests must not reach the model");

    const normalResponse = createResponse();
    await handler({ method: "POST", body: { question: "什么是短时记忆？", currentStep: "1. 提出问题" } }, normalResponse);
    assert.strictEqual(normalResponse.statusCode, 200);
    assert.strictEqual(fetchCount, 1, "normal learning questions must still reach the model");
    assert(upstreamBody.messages[0].content.includes("不得回答知识后测"), "system prompt must retain assessment refusal guidance");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
}

(async () => {
  await checkVoiceSession();
  await checkAssessmentGuard();
  console.log("Assistant voice states and assessment guard checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
