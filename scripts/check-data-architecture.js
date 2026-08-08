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
  assert.doesNotMatch(source, /id=["']submitKnowledgeQuizBtn["']/, `${page} must not render a separate knowledge quiz submit button`);
  assert.doesNotMatch(source, /function submitKnowledgeQuiz\s*\(/, `${page} must finalize the quiz only with the formal submission`);
  assert.match(source, /function finalizeKnowledgeQuizOnce\s*\(/, `${page} must finalize the quiz once`);
  assert.doesNotMatch(source, /renderKnowledgeQuizHistory\(summary\)/, `${page} must not render quiz scores or submission history`);
  assert.doesNotMatch(source, /function getKnowledgeQuizSheet\s*\(/, `${page} must not expose quiz scores through the student export`);
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
assert.doesNotMatch(review, /renderKnowledgeQuizReport\(data\)/);
assert.doesNotMatch(review, /knowledgeQuiz|知识验证|提交成绩|提交次数/);
assert.doesNotMatch(review, /ai_chat_records|learning_records|agent_interventions/);

const screening = read("pretest.html");
assert.match(screening, /experiment-submission\.js/);
assert.match(screening, /submitExperimentState\(/);
assert.doesNotMatch(screening, /uploadExperimentRecords|BrainExperimentBridge\.submitState\(/);

const dashboard = read("admin/dashboard.html");
assert.match(dashboard, /isAiChatExport\s*\?\s*exportSourceRecords\s*:\s*getLatestStateRecords/);
assert.match(dashboard, /exportAll:\s*true/);
assert.match(read("cloudfunctions/getAiChatRecordsAdmin/index.js"), /async function readAll[\s\S]*exportAll \? filtered/);

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
