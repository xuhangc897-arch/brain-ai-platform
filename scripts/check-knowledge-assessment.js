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
  "knowledge-post-memory.js",
  "knowledge-post-nback.js",
  "knowledge-post-interference.js",
  "knowledge-post-strategy.js",
  "knowledge-assessment.js"
];
files.forEach((file) => vm.runInNewContext(fs.readFileSync(path.join(root, "assets", file), "utf8"), context, { filename: file }));

const pretest = context.BrainKnowledgePretestQuestions;
const posts = [
  context.BrainKnowledgePostMemoryQuestions,
  context.BrainKnowledgePostNbackQuestions,
  context.BrainKnowledgePostInterferenceQuestions,
  context.BrainKnowledgePostStrategyQuestions
];
const allQuestions = [pretest, ...posts].flat();

assert.strictEqual(pretest.length, 20);
assert.strictEqual(new Set(allQuestions.map((item) => item.id)).size, 40);
["memory", "nback", "interference", "strategies"].forEach((category) => {
  assert.strictEqual(pretest.filter((item) => item.category === category).length, 5);
});
assert.deepStrictEqual(
  ["concept", "life", "experiment"].map((type) => pretest.filter((item) => item.id.includes(`_${type}_`)).length),
  [6, 10, 4]
);
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

const api = context.BrainKnowledgeAssessment;
const t0Draft = api.createDraft("T0", pretest, true);
const t5Draft = api.createDraft("T5", pretest, true);
assert.notStrictEqual(t0Draft, t5Draft);
assert.notStrictEqual(t0Draft.questionOrder, t5Draft.questionOrder);
assert.deepStrictEqual([...t0Draft.questionOrder].sort(), [...t5Draft.questionOrder].sort());
const posterSource = fs.readFileSync(path.join(root, "poster.html"), "utf8");
const pretestSource = fs.readFileSync(path.join(root, "pretest.html"), "utf8");
assert.match(posterSource, /const knowledgeQuestions = window\.BrainKnowledgePretestQuestions;/);
assert.match(pretestSource, /仅有一次正式提交机会/);
assert.doesNotMatch(pretestSource, /id="resetBtn"|重新作答|function resetPretest/);
assert.doesNotMatch(pretestSource, /function exportExcel|URL\.createObjectURL|\.download\s*=/);
assert.match(pretestSource, /数据已保存，可以返回首页进入实验/);
assert.match(pretestSource, /const KNOWLEDGE_PAGE_SIZE = 1;/);
assert.match(pretestSource, /const META_PAGE_SIZE = 3;/);
assert.match(pretestSource, /knowledgeQuestions\[knowledgePageIndex\]|questionOrder\[knowledgePageIndex\]/);
assert.match(pretestSource, /surveyDef\.items\.slice\(start, start \+ META_PAGE_SIZE\)/);
assert.match(pretestSource, /submit\.hidden = knowledgePageIndex !== knowledgeQuestions\.length - 1/);
assert.match(pretestSource, /complete\.hidden = metaPageIndex !== pageCount - 1/);
assert.match(pretestSource, /knowledgePageIndex = state\.knowledgeDraft\.questionOrder\.indexOf\(result\.unanswered\[0\]\)/);
assert.match(pretestSource, /作答已提交并锁定，不显示题目、答案或成绩/);

const saveStateSource = pretestSource.slice(
  pretestSource.indexOf("function saveState()"),
  pretestSource.indexOf("function renderApp()")
);
assert.doesNotMatch(saveStateSource, /knowledgePageIndex|metaPageIndex/);
assert.match(saveStateSource, /currentPage: 0/);

console.log("T0-T5 knowledge assessment question banks and shared-source contract checks passed.");
