"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const store = new Map();
const context = {
  structuredClone,
  crypto: { getRandomValues(values) { values[0] = Math.floor(Math.random() * 0xffffffff); return values; } },
  localStorage: { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
  BrainPlatform: {
    identity: { readStudentSession: () => ({ studentId: "student-1" }) },
    storage: { scopedKey: (key) => `${key}::student-1` }
  }
};
context.window = context;

const files = [
  "knowledge-pretest.js",
  "knowledge-posttest.js",
  "knowledge-post-memory.js",
  "knowledge-post-nback.js",
  "knowledge-post-interference.js",
  "knowledge-post-strategy.js",
  "knowledge-assessment.js"
];
files.forEach((file) => vm.runInNewContext(fs.readFileSync(path.join(root, "assets", file), "utf8"), context, { filename: file }));

const pretest = context.BrainKnowledgePretestQuestions;
const posttest = context.BrainKnowledgePosttestQuestions;
const posts = [
  context.BrainKnowledgePostMemoryQuestions,
  context.BrainKnowledgePostNbackQuestions,
  context.BrainKnowledgePostInterferenceQuestions,
  context.BrainKnowledgePostStrategyQuestions
];
const allQuestions = [pretest, posttest, ...posts].flat();

assert.strictEqual(pretest.length, 20);
assert.strictEqual(posttest.length, 20);
assert.strictEqual(new Set(allQuestions.map((item) => item.id)).size, 60);
["memory", "nback", "interference", "strategies"].forEach((category) => {
  assert.strictEqual(pretest.filter((item) => item.category === category).length, 5);
  assert.strictEqual(posttest.filter((item) => item.category === category).length, 5);
});
[pretest, posttest].forEach((questions) => {
  assert.deepStrictEqual(
    ["concept", "life", "experiment"].map((type) => questions.filter((item) => item.id.includes(`_${type}_`)).length),
    [6, 10, 4]
  );
});
pretest.forEach((item, index) => {
  const paired = posttest[index];
  assert.strictEqual(paired.id, item.id.replace(/^t0_/, "t5_"));
  assert.strictEqual(paired.category, item.category);
  assert.notStrictEqual(paired.question, item.question);
  assert.ok(Object.values(paired.options).every((option) => !Object.values(item.options).includes(option)));
});
posts.forEach((questions) => {
  assert.strictEqual(questions.length, 5);
  assert.deepStrictEqual(
    ["concept", "phenomenon", "transfer"].map((type) => questions.filter((item) => item.id.includes(`_${type}_`)).length),
    [2, 2, 1]
  );
});
allQuestions.forEach((item) => {
  assert.strictEqual(Object.keys(item.options).length, 4);
  assert.ok(Object.prototype.hasOwnProperty.call(item.options, item.answer));
});
["本次实验", "今天探究", "根据实验结果", "完成实验后", "实验中我们"].forEach((phrase) => {
  assert.ok(pretest.every((item) => !item.question.includes(phrase)), `T0 contains forbidden phrase: ${phrase}`);
});
["1-back", "2-back", "3-back", "N-back", "N值", "N 值"].forEach((phrase) => {
  assert.ok(
    [pretest, posttest].flat().every((item) => !`${item.question} ${Object.values(item.options).join(" ")}`.includes(phrase)),
    `T0/T5 requires prior N-back knowledge: ${phrase}`
  );
});
["永久保存所有信息", "自动扩大记忆容量", "设备损坏是唯一原因", "只抄写标点符号", "任何情况下", "永远"].forEach((phrase) => {
  assert.ok(
    allQuestions.every((item) => !`${item.question} ${Object.values(item.options).join(" ")}`.includes(phrase)),
    `Question bank contains an obvious distractor phrase: ${phrase}`
  );
});

function answerDistribution(questions) {
  return Object.fromEntries(["A", "B", "C", "D"].map((key) => [
    key,
    questions.filter((item) => item.answer === key).length
  ]));
}

assert.deepStrictEqual(answerDistribution(pretest), { A: 5, B: 5, C: 5, D: 5 });
assert.deepStrictEqual(answerDistribution(posttest), { A: 5, B: 5, C: 5, D: 5 });
assert.deepStrictEqual(answerDistribution(posts.flat()), { A: 5, B: 5, C: 5, D: 5 });

const api = context.BrainKnowledgeAssessment;
assert.strictEqual(api.questionSetVersion, "knowledge-v3-2026-08");
const t0Draft = api.createDraft("T0", pretest, true);
const t5Draft = api.createDraft("T5", posttest, true);
assert.strictEqual(t5Draft.questionSetVersion, api.posttestQuestionSetVersion);
assert.notStrictEqual(t0Draft, t5Draft);
assert.notStrictEqual(t0Draft.questionOrder, t5Draft.questionOrder);
assert.strictEqual(new Set([...t0Draft.questionOrder, ...t5Draft.questionOrder]).size, 40);
const resumedDraft = api.normalizeDraft(t0Draft, "T0", pretest, true);
assert.deepStrictEqual(Array.from(resumedDraft.questionOrder), Array.from(t0Draft.questionOrder), "refresh must preserve each student's question order");
const staleDraft = api.normalizeDraft({
  stage: "T0",
  questionSetVersion: "knowledge-v2-2026-08",
  questionOrder: pretest.map((item) => item.id),
  answers: { [pretest[0].id]: "A" },
  currentPage: 9
}, "T0", pretest, true);
assert.strictEqual(Object.keys(staleDraft.answers).length, 0);
assert.strictEqual(staleDraft.currentPage, 0);
const newT5Answers = Object.fromEntries(posttest.map((item) => [item.id, item.answer]));
const t5Result = api.submitStage(api.emptyTimeline(), "T5", posttest, { ...t5Draft, answers: newT5Answers });
assert.strictEqual(t5Result.record.correctCount, 20);
assert.strictEqual(t5Result.record.questionSetVersion, api.posttestQuestionSetVersion);
const posterSource = fs.readFileSync(path.join(root, "poster.html"), "utf8");
const pretestSource = fs.readFileSync(path.join(root, "pretest.html"), "utf8");
assert.match(posterSource, /src="assets\/knowledge-posttest\.js"/);
assert.match(posterSource, /const knowledgeQuestions = window\.BrainKnowledgePosttestQuestions;/);
const qualificationMeta = vm.runInNewContext(`(${pretestSource.match(/const surveyDef = (\{[\s\S]*?\n    \});/)[1]})`);
const activityFiveMeta = vm.runInNewContext(`(${posterSource.match(/const metaSurvey = (\{[\s\S]*?\n    \});/)[1]})`);
assert.strictEqual(JSON.stringify(activityFiveMeta), JSON.stringify(qualificationMeta));
assert.match(posterSource, /src="assets\/inquiry-ability-survey\.js"/);
assert.match(posterSource, /state\.posttestSurveysSubmitted = true;/);
assert.match(pretestSource, /仅有一次正式提交机会/);
assert.doesNotMatch(pretestSource, /id="resetBtn"|重新作答|function resetPretest/);
assert.doesNotMatch(pretestSource, /function exportExcel|URL\.createObjectURL|\.download\s*=/);
assert.doesNotMatch(pretestSource, /资格审查已完成，数据已保存，可以返回首页进入实验/);
assert.match(pretestSource, /const KNOWLEDGE_PAGE_SIZE = 1;/);
assert.match(pretestSource, /const META_PAGE_SIZE = 3;/);
assert.match(pretestSource, /knowledgeQuestions\[knowledgePageIndex\]|questionOrder\[knowledgePageIndex\]/);
assert.match(pretestSource, /surveyDef\.items\.slice\(start, start \+ META_PAGE_SIZE\)/);
assert.match(pretestSource, /submit\.hidden = knowledgePageIndex !== knowledgeQuestions\.length - 1/);
assert.match(pretestSource, /activeAssessmentView = "knowledge";\s*knowledgePageIndex = 0;/);
assert.match(pretestSource, /await completePretest\(\);/);
assert.match(pretestSource, /let activeAssessmentView = state\.completed \? "inquiry" : "meta";/);
assert.match(pretestSource, /activeAssessmentView = "inquiry";\s*inquiryAbilityPageIndex = Math\.ceil\(inquiryAbilityDef\.items\.length \/ META_PAGE_SIZE\) - 1;/);
assert.match(posterSource, /if \(page < metaPages \+ inquiryPages\)/);
assert.match(posterSource, /const knowledgePage = page - metaPages - inquiryPages;/);
assert.match(pretestSource, /knowledgePageIndex = state\.knowledgeDraft\.questionOrder\.indexOf\(result\.unanswered\[0\]\)/);
assert.match(pretestSource, /作答已提交并锁定，不显示题目、答案或成绩/);

const saveStateSource = pretestSource.slice(
  pretestSource.indexOf("function saveState()"),
  pretestSource.indexOf("function renderApp()")
);
assert.doesNotMatch(saveStateSource, /knowledgePageIndex|metaPageIndex/);
assert.match(saveStateSource, /currentPage: 0/);

const dashboardSource = fs.readFileSync(path.join(root, "admin/dashboard.html"), "utf8");
const exportSource = dashboardSource.slice(
  dashboardSource.indexOf("function buildKnowledgeComparisonSheets(stateRecords)"),
  dashboardSource.indexOf("function buildPosterStateSheets(stateRecord)")
);
assert(exportSource && dashboardSource.includes("...buildKnowledgeComparisonSheets(latestStateRecords)"));
const ids = pretest.map((item) => item.id);
const answers = Object.fromEntries(pretest.map((item) => [item.id, item.answer]));
const posttestIds = posttest.map((item) => item.id);
const posttestAnswers = Object.fromEntries(posttest.map((item) => [item.id, item.answer]));
const exportContext = {
  window: { BrainKnowledgePretestQuestions: pretest, BrainKnowledgePosttestQuestions: posttest, BrainKnowledgeAssessment: api },
  formatDate: (value) => value,
  stateRecords: [
    { studentId: "S2", data: { knowledgeAssessment: { T0: { assessmentId: "S2-T0", questionSetVersion: api.questionSetVersion, questionOrder: ids.slice().reverse(), answers, correctCount: 20, score: 100, timestamp: "2026-08-01" } } } },
    { studentId: "S1", data: { knowledgeAssessment: { T5: { assessmentId: "S1-T5", questionSetVersion: api.posttestQuestionSetVersion, questionOrder: posttestIds.slice().reverse(), answers: posttestAnswers, correctCount: 20, score: 100, timestamp: "2026-08-02" }, T0: { assessmentId: "S1-T0", questionSetVersion: api.questionSetVersion, questionOrder: ids, answers, correctCount: 20, score: 100, timestamp: "2026-08-01" } } } }
  ]
};
vm.runInNewContext(exportSource, exportContext);
const comparisonSheets = vm.runInNewContext("buildKnowledgeComparisonSheets(stateRecords)", exportContext);
assert.strictEqual(vm.runInNewContext("buildKnowledgeComparisonSheets([]).length", exportContext), 0);
const summaryRows = comparisonSheets[0][1];
const detailRows = comparisonSheets[1][1];
assert.deepStrictEqual(Array.from(summaryRows.slice(1), (row) => row[0]), ["S1", "S2"]);
assert.strictEqual(detailRows.length, 61);
assert.deepStrictEqual(Array.from(detailRows.filter((row) => row[0] === "S2"), (row) => row[6]), Array.from(ids));
assert.deepStrictEqual(Array.from(detailRows.filter((row) => row[0] === "S1" && row[4] === "T5"), (row) => row[6]), Array.from(posttestIds));
assert.strictEqual(detailRows.find((row) => row[0] === "S2")[12], 20, "export order must be independent of the displayed order");
assert.strictEqual(detailRows.find((row) => row[0] === "S2")[11], 1);
exportContext.stateRecords = [{ studentId: "S3", data: { knowledgeAssessment: { T0: {
  assessmentId: "S3-T0", questionSetVersion: "older-bank", questionOrder: ids, answers, correctCount: 20, score: 100, timestamp: "2026-07-01"
} } } }];
const olderRows = vm.runInNewContext("buildKnowledgeComparisonSheets(stateRecords)", exportContext)[1][1];
assert.strictEqual(olderRows.length, 2);
assert.match(olderRows[1][15], /题库版本不同/);
exportContext.stateRecords = [{ studentId: "S4", data: { knowledgeAssessment: { T5: {
  assessmentId: "S4-T5", questionSetVersion: api.questionSetVersion, questionOrder: ids, answers, correctCount: 20, score: 100, timestamp: "2026-08-02"
} } } }];
const legacyT5Rows = vm.runInNewContext("buildKnowledgeComparisonSheets(stateRecords)", exportContext)[1][1];
assert.deepStrictEqual(Array.from(legacyT5Rows.slice(1), (row) => row[6]), Array.from(ids));

console.log("T0-T5 knowledge assessment question banks and shared-source contract checks passed.");
