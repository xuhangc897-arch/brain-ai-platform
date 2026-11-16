"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "admin", "dashboard.html"), "utf8");
const start = source.indexOf("    function buildKnowledgeQuizSheet(");
const end = source.indexOf("    function buildKnowledgeHistorySheet(", start);
assert(start >= 0 && end > start);
const buildSheet = vm.runInNewContext(`${source.slice(start, end)}\nbuildKnowledgeQuizSheet`, { formatDate: (value) => value });

const historical = {
  knowledgeQuiz: {
    answers: { q1: "B", q2: "A", q3: "D", q4: "C", q5: "B" },
    score: 100, correctCount: 5, accuracy: 100, wrongQuestions: [],
    history: [{ totalCount: 5, score: 100, correctCount: 5, accuracy: 100,
      answers: { q1: "B", q2: "A", q3: "D", q4: "C", q5: "B" }, wrongQuestions: [] }]
  }
};
const rows = buildSheet("历史学生", historical)[1];
assert.strictEqual(rows.length, 10);
assert(rows.slice(1, 6).every((row) => row[4] === "无法核验" && !row[3]));
assert.deepStrictEqual(Array.from(rows[6]), ["汇总", "答对数量", "5 / 5", "", ""]);
assert.strictEqual(rows[7][2], 100);
assert.strictEqual(rows[8][2], 100);
assert.strictEqual(rows[1][2], "B");

const snapshot = ["B", "A", "D", "C", "B"].map((answer, index) => ({
  id: `q${index + 1}`, question: `提交时第${index + 1}题`, options: { A: "选项A", B: "选项B", C: "选项C", D: "选项D" }, answer
}));
historical.knowledgeQuiz.history[0].questionSnapshot = snapshot;
const verifiedRows = buildSheet("新学生", historical)[1];
assert(verifiedRows.slice(1, 6).every((row) => row[4] === "正确"));
assert.strictEqual(verifiedRows[1][1], "提交时第1题");
historical.knowledgeQuiz.history[0].score = 80;
const inconsistentRows = buildSheet("异常学生", historical)[1];
assert(inconsistentRows.slice(1, 6).every((row) => row[4] === "无法核验"));
assert.strictEqual(inconsistentRows[7][2], 80);

const comparisonStart = source.indexOf("    function buildKnowledgeComparisonSheets(");
const comparisonEnd = source.indexOf("    function buildPosterStateSheets(", comparisonStart);
assert(comparisonStart >= 0 && comparisonEnd > comparisonStart);
const buildComparison = vm.runInNewContext(`${source.slice(comparisonStart, comparisonEnd)}\nbuildKnowledgeComparisonSheets`, {
  formatDate: (value) => value,
  window: { BrainKnowledgeAssessment: { questionSetVersion: "current", posttestQuestionSetVersion: "posttest" } }
});
const assessment = { stage: "T1", assessmentId: "historical-1", questionSetVersion: "unknown-old",
  questionOrder: ["old1", "old2", "old3", "old4", "old5"],
  answers: { old1: "B", old2: "A", old3: "D", old4: "C", old5: "B" },
  score: 100, correctCount: 5, totalCount: 5, timestamp: "2026-07-01" };
delete historical.knowledgeQuiz.history[0].questionSnapshot;
const comparison = buildComparison([{ module: "memory", studentId: "历史学生", data: { fullState: {
  studentId: "历史学生", knowledgeQuiz: historical.knowledgeQuiz, knowledgeAssessment: { T1: assessment }
} } }]);
const detail = comparison[1][1].slice(1);
assert.strictEqual(detail.length, 5);
assert(detail.every((row) => row[11] === "无法核验" && !row[10]));
assert.strictEqual(detail[0][9], "B");
historical.knowledgeQuiz.history[0].score = 100;
historical.knowledgeQuiz.history[0].questionSnapshot = snapshot;
assessment.questionOrder = snapshot.map((item) => item.id);
assessment.answers = Object.fromEntries(snapshot.map((item) => [item.id, item.answer]));
const verifiedDetail = buildComparison([{ module: "memory", studentId: "新学生", data: { fullState: {
  studentId: "新学生", knowledgeQuiz: historical.knowledgeQuiz, knowledgeAssessment: { T1: assessment }
} } }])[1][1].slice(1);
assert(verifiedDetail.every((row) => row[11] === 1));

console.log("Historical five-question score and answers preserved; unverifiable items marked; snapshot-based grading passed.");
