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
assert(source.includes('plan: renderPagedPlanStep'), "plan step must use pagination");
assert(source.includes('evidence: renderPagedEvidenceStep'), "evidence step must use pagination");

const plan = sliceBetween("function renderPagedPlanStep()", "function renderPlanStep()");
const order = ["实验材料一：倒摄干扰", "实验材料二：相似性干扰", "实验材料三：情绪干扰", "实验材料四：头环使用说明", "实验流程", "变量设计", "实验计划"];
let previousIndex = -1;
order.forEach((label) => {
  const index = plan.indexOf(label);
  assert(index > previousIndex, `plan page order is incorrect at: ${label}`);
  previousIndex = index;
});
assert(!plan.includes("第一轮") && !plan.includes("第二轮"), "plan flow must not expose round sorting sections");
assert(!source.includes("步骤卡片池") && !source.includes("data-flow-") && !source.includes("bindFlowDesigner"), "legacy flow designer must be removed");

const hypothesis = sliceBetween("function renderHypothesisStep()", "function renderPagedPlanStep()");
assert(!hypothesis.includes("renderInquiryCases"), "hypothesis page must not repeat inquiry cases");

const evidence = sliceBetween("function renderEvidenceSetup()", "function renderEvidenceStep()");
assert(evidence.includes("readonly-plan-grid"), "evidence setup must display read-only plan values");
assert(evidence.includes("自动测量序号"), "evidence setup must show an automatic run number");
assert(evidence.includes("返回制定计划修改"), "evidence setup must link back to the plan");
assert(!evidence.includes("roundSelect") && !evidence.includes("participantInput") && !evidence.includes("emotionConditionSelect"), "evidence setup must not duplicate editable plan controls");
assert(source.includes("getEvidenceRunGroups") && source.includes("getEvidencePageSize") && source.includes("groups.slice(index, index + pageSize)"), "evidence results must be grouped and paged at no more than three per page");

for (const field of ["interferenceFactor", "flowRound1", "flowRound2"]) {
  assert(source.includes(field), `legacy compatibility field missing: ${field}`);
}
assert(source.includes("syncLegacyFlowFields"), "legacy flow values must be synchronized automatically");
assert(source.includes('id="headbandGuideModal"') && source.includes('event.key === "Escape"') && source.includes("openButton.focus()"), "headband modal accessibility behavior is incomplete");
assert(source.includes('html[data-theme="archive"] body.experiment-page .variable-table td:first-child'), "archive theme must override the variable label color");

console.log("interference pagination checks passed");
