"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "assets", "review.js"), "utf8");
const surveyAnswers = (length, value) => Object.fromEntries(Array.from({ length }, (_, index) => [`q${index + 1}`, value]));

function render(activity, experimentResults) {
  const root = { innerHTML: "", querySelector: () => ({}) };
  const document = { getElementById: (id) => id === "reviewRoot" ? root : null };
  const context = {
    document, URLSearchParams, Date,
    location: { search: `?archiveRender=1&activityType=${activity}` },
    BrainPlatform: {
      storage: { migrateScopedJson: (value) => value },
      identity: { readStudentSession: () => ({}) }
    },
    BrainExperimentIntegration: {
      resolveReportActivity: (id) => ({ id, caseNo: "案件01", caseTitle: "示例案件", activityName: "示例实验", reportType: "science", storageKey: id })
    }
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "review.js" });
  const submission = {
    experimentId: activity, studentId: "student-1", studentName: "测试学生", className: "一班", groupName: "一组",
    answers: { question_individual: "我的研究问题", hypothesis_individual: "我的假设", conclusion_individual: "我的结论" },
    experimentResults,
    knowledgeQuiz: { attempts: [{ score: 987, answers: { q1: "PRIVATE_QUIZ_ANSWER" } }] },
    surveys: {
      meta: surveyAnswers(5, 4), cognitiveLoad: surveyAnswers(2, 6), inquiryParticipation: surveyAnswers(10, 3)
    }
  };
  assert.strictEqual(context.BrainReportArchive.render(submission), true);
  return { html: root.innerHTML, data: context.buildReviewData(activity, { ...experimentResults, fields: submission.answers }, submission) };
}

const memory = render("memory", { records: [
  { subject: "本人", finalCapacity: 4 }, { subject: "组员", finalCapacity: 8 }
] });
assert.match(memory.html, /本案发现/);
assert.match(memory.html, /探究与数据/);
assert.match(memory.html, /证据与判断/);
assert.match(memory.html, /侦探小结/);
assert.match(memory.html, /有效次数/);
assert.match(memory.html, /width:50%/);
assert.match(memory.html, /width:100%/);
assert.match(memory.html, /知识验证[\s\S]*已完成/);
assert.doesNotMatch(memory.html, /PRIVATE_QUIZ_ANSWER|987/);
assert.doesNotMatch(memory.html, /绘制了结果图表/);
assert.strictEqual(memory.data.posttest.groups[2].complete, true);

const nback = render("nback", { testRuns: [
  { condition: "1-back", accuracy: 0 }, { condition: "2-back", accuracy: 80 }
] });
assert.match(nback.html, /width:0%/);
assert.match(nback.html, />0%<\/strong>/);
assert.strictEqual(nback.data.chartRows[0].sampleCount, 1);

for (const activity of ["interference", "strategies"]) {
  const result = render(activity, { records: [] });
  assert.match(result.html, /侦探小结/);
  assert.match(result.html, /尚无可汇总的实验数据/);
}

console.log("Review report sections, chart scales, survey coverage and quiz privacy checks passed.");
