"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "interference.html"), "utf8");

function sliceBetween(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, `missing section: ${start}`);
  return source.slice(startIndex, endIndex);
}

assert(source.includes("const stepPageIndexes = Object.create(null)"), "page indexes must be session-only state");
assert(!sliceBetween("const defaultState =", "let state = loadState()").includes("stepPageIndexes"), "page indexes must not be persisted");
assert(source.includes('window.setTimeout(finish, 150)'), "page transition must use 150ms timing");
assert(source.includes('prefers-reduced-motion: reduce'), "reduced-motion support is required");
assert(source.includes('question: renderPagedQuestionStep'), "question step must use pagination");
assert(source.includes("question: 4"), "question pagination must contain four pages after removing the inquiry cases");
const question = sliceBetween("function renderPagedQuestionStep()", "function renderQuestionStep()");
assert(question.includes('className: "question-page-material"') && question.includes("question-materials-combined"), "the three reading materials must share one page");
assert((question.match(/className: "question-page-material"/g) || []).length === 1, "reading materials must not render as separate pages");
assert(!question.includes('title: "科学探究案例"') && !question.includes("renderInquiryCases()"), "question pagination must not contain an inquiry-cases page");
assert(question.lastIndexOf('renderInquiryScaffold("question")') > question.indexOf('title: "提出研究问题"'), "research-question prompts must appear at the bottom of the final question page");
assert(source.includes(".question-materials-combined .reading-card p { font-size: 16px; line-height: 1.9; }"), "combined reading material text must use the enlarged font and line spacing");
assert(source.includes('plan: renderPagedPlanStep'), "plan step must use pagination");
assert(source.includes('evidence: renderPagedEvidenceStep'), "evidence step must use pagination");

const plan = sliceBetween("function renderPagedPlanStep()", "function renderPlanStep()");
const order = ["实验材料一：倒摄干扰", "实验材料二：相似性干扰", "实验材料三：情绪干扰", "实验材料四：头环使用说明", "变量设计", "实验计划"];
let previousIndex = -1;
order.forEach((label) => {
  const index = plan.indexOf(label);
  assert(index > previousIndex, `plan page order is incorrect at: ${label}`);
  previousIndex = index;
});
assert(!plan.includes("第一轮") && !plan.includes("第二轮"), "plan flow must not expose round sorting sections");
assert(!plan.includes("interferenceStagePlan") && !plan.includes("请补充干扰阶段参与者需要做的事情"), "removed interference-stage prompt must not render");
assert(!plan.includes("参与者编号") && !plan.includes("固定材料条件数"), "removed plan parameters must not render");
assert(source.includes("plan: 6"), "plan pagination must contain six pages");
assert(source.includes(".time-parameter-grid") && source.includes("grid-template-columns: repeat(3"), "time parameters must share one desktop row");
assert(!source.includes("步骤卡片池") && !source.includes("data-flow-") && !source.includes("bindFlowDesigner"), "legacy flow designer must be removed");

const hypothesis = sliceBetween("function renderHypothesisStep()", "function renderPagedPlanStep()");
assert(!hypothesis.includes("renderInquiryCases"), "hypothesis page must not repeat inquiry cases");

const reflection = sliceBetween("function renderPagedReflectionStep()", "function renderAnalysisStep()");
assert(reflection.includes("renderPairedField(title") && reflection.includes("renderGroupTextarea(groupField), false"), "reflection pages must hide duplicate inner subtitles");

const evidence = sliceBetween("function renderEvidenceSetup()", "function renderEvidenceStep()");
assert(evidence.includes("readonly-plan-grid"), "evidence setup must display read-only plan values");
assert(evidence.includes("自动测量序号"), "evidence setup must show an automatic run number");
assert(evidence.includes("返回制定计划修改"), "evidence setup must link back to the plan");
assert(!evidence.includes("roundSelect") && !evidence.includes("participantInput") && !evidence.includes("emotionConditionSelect"), "evidence setup must not duplicate editable plan controls");
assert(source.includes("getEvidenceRunGroups") && source.includes("getEvidencePageSize") && source.includes("groups.slice(index, index + pageSize)"), "evidence results must be grouped and paged at no more than three per page");

for (const field of ["interferenceFactor", "flowRound1", "flowRound2", "interferenceStagePlan"]) {
  assert(source.includes(field), `legacy compatibility field missing: ${field}`);
}
assert(source.includes("syncLegacyFlowFields"), "legacy flow values must be synchronized automatically");
assert(source.includes('id="headbandGuideModal"') && source.includes('event.key === "Escape"') && source.includes("openButton.focus()"), "headband modal accessibility behavior is incomplete");
assert(source.includes('html[data-theme="archive"] body.experiment-page .variable-table td:first-child'), "archive theme must override the variable label color");

console.log("interference pagination checks passed");
