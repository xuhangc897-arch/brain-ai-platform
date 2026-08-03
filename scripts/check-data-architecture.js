"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const experimentPages = ["memory.html", "nback.html", "interference.html", "strategies.html"];
for (const page of experimentPages) {
  const source = read(page);
  assert.match(source, /submitExperimentState\(/, `${page} must use the formal submission bridge`);
  assert.match(source, /async function generateReviewReport/, `${page} must await submission before report`);
  assert.match(source, /surveys\.current/, `${page} must store the current survey state explicitly`);
  assert.match(source, /attempts: \[\], firstScore: null, bestScore: null, finalScore: null/, `${page} must retain normalized quiz summaries`);
}
assert.match(read("poster.html"), /submitExperimentState\(/);
assert.doesNotMatch(read("strategies.html"), /uploadStrategyAttempt|recordType:\s*["']experiment["']/);

const bridge = read("assets/experiment-bridge.js");
assert.doesNotMatch(bridge, /submitAiChatRecord/);
assert.match(bridge, /submissionId=/);

const assistant = read("assets/ai-assistant.js");
assert.doesNotMatch(assistant, /data-ai-export|data-ai-clear|function exportLogs|function clearLogs|submitAiChatRecord|uploadExperimentRecords/);
assert.match(assistant, /saveAiChatRecord/);
assert.match(assistant, /uploadAiChatRecord\(context, answer\)/);
assert.match(assistant, /saveChatLog\(context, `错误：\$\{message\}`, true\)/);

const review = read("assets/review.js");
assert.match(review, /BrainExperimentSubmission\.getLatest/);
assert.match(review, /if \(session\.isGuest\)/);
assert.match(review, /quiz\.attempts/);
assert.doesNotMatch(review, /ai_chat_records|learning_records|agent_interventions/);

for (const file of [
  "cloudfunctions/generateExperimentMemory/index.js",
  "cloudfunctions/generateLearningDiagnosis/index.js",
  "cloudfunctions/getLearningDiagnosis/index.js"
]) {
  const source = read(file);
  assert.match(source, /experiment_submissions/);
  assert.match(source, /experimentRecords/);
}

const cloudbase = JSON.parse(read("cloudbase.json"));
const functions = new Set(cloudbase.functions.map((item) => item.name));
for (const name of ["saveExperimentSubmission", "getLatestExperimentSubmission", "getExperimentSubmissionsAdmin", "saveAiChatRecord", "getAiChatRecordsAdmin"]) {
  assert(functions.has(name), `${name} must be included in cloudbase.json`);
}

console.log("Three-layer submission, AI logging, compatibility and report-source checks passed.");
