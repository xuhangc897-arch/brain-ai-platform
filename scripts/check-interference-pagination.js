"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
assert(question.includes('className: "question-page-material"') && question.includes("question-materials-combined"), "the two reading materials must share one page");
for (const title of ["材料一", "材料二"]) {
  assert(question.includes(`<h4>${title}</h4>`), `reading card must show only ${title}`);
}
assert(!question.includes("<h4>材料三</h4>") && !question.includes("情绪会影响"), "emotion must not appear in the active reading materials");
assert((question.match(/className: "question-page-material"/g) || []).length === 1, "reading materials must not render as separate pages");
assert(!question.includes('title: "科学探究案例"') && !question.includes("renderInquiryCases()"), "question pagination must not contain an inquiry-cases page");
assert(question.lastIndexOf('renderInquiryScaffold("question")') > question.indexOf('title: "提出研究问题"'), "research-question prompts must appear at the bottom of the final question page");
assert(source.includes(".question-materials-combined .reading-card p { font-size: 18px; line-height: 1.8; }"), "combined reading material text must use the shared reading font and line spacing");
assert(source.includes('plan: renderPagedPlanStep'), "plan step must use pagination");
assert(source.includes('evidence: renderPagedEvidenceStep'), "evidence step must use pagination");

const plan = sliceBetween("function renderPagedPlanStep()", "function renderPlanStep()");
const order = ["实验材料一：倒摄干扰", "实验材料二：相似性干扰", "实验材料三：头环使用说明", "变量设计", "实验计划"];
let previousIndex = -1;
order.forEach((label) => {
  const index = plan.indexOf(label);
  assert(index > previousIndex, `plan page order is incorrect at: ${label}`);
  previousIndex = index;
});
assert(!plan.includes("第一轮") && !plan.includes("第二轮"), "plan flow must not expose round sorting sections");
assert(plan.includes("探究新学习内容是否会干扰旧知识的记忆。两种条件需要保持记忆材料难度与测试方式一致。") && plan.includes("如果两种条件得分差别不大，可以检查材料难度和干扰强度是否合适。"), "first material page wording must remain unchanged");
assert(!plan.includes("情绪干扰") && !plan.includes('data-field="emotionCondition"'), "emotion plan page and control must be removed");
assert(plan.includes('data-plan-variable="${kind}"') && plan.includes('data-plan-variable="controlOther"'), "variable design must use choices and an other field");
assert(!plan.includes('data-field="independentVariablePlan"') && !plan.includes('data-field="factor"'), "plan must not repeat free text and factor dropdown controls");
assert(!plan.includes("interferenceStagePlan") && !plan.includes("请补充干扰阶段参与者需要做的事情"), "removed interference-stage prompt must not render");
assert(!plan.includes("参与者编号") && !plan.includes("固定材料条件数"), "removed plan parameters must not render");
assert(source.includes("plan: 5"), "plan pagination must contain five pages");
assert(source.includes('return 3;') && source.includes('return 4;'), "plan incomplete navigation must target the revised pages");
assert(source.includes('const PLAN_FACTORS = ["倒摄干扰", "材料相似性"]'), "only two factors may be chosen for new runs");
assert(source.includes('buildRound(1, "休息条件"') && source.includes('buildRound(2, "倒摄干扰条件"'), "retroactive rounds must retain rest then new-material interference");
assert(source.includes('buildRound(1, "低相似干扰"') && source.includes('buildRound(2, "高相似干扰"'), "similarity rounds must retain low then high similarity interference");
assert(source.includes('if (!PLAN_FACTORS.includes(state.fields.factor)'), "legacy emotion drafts must not start a new emotion run");
const planConstants = sliceBetween("const PLAN_FACTORS =", "const defaultState =");
const planFields = { independentVariablePlan: "", dependentVariablePlan: "", controlVariablePlan: "", difficulty: "medium", memorySeconds: 30, restSeconds: 30, interferenceSeconds: 30 };
const planPages = vm.runInNewContext(`${planConstants}\n${plan}\nrenderPagedPlanStep()`, {
  state: { fields: planFields },
  escapeHtml: String,
  selected: () => "",
  renderPagedStep: (_, pages) => pages
});
assert.strictEqual(planPages.length, 5, "plan must render five pages");
assert(planPages[0].content().includes("安静休息，不学习新材料") && planPages[1].content().includes("相似度较低的干扰材料"), "two material pages must keep their distinct round designs");
assert(planPages[3].content().includes('type="radio"') && planPages[3].content().includes('type="checkbox"') && planPages[3].content().includes('placeholder="其他控制变量"'), "variable page must render choice and fill-in inputs");
assert(!planPages[4].content().includes('data-field="factor"') && !planPages[4].content().includes('data-field="emotionCondition"'), "parameter page must not repeat factor or emotion controls");
const planVariableSource = sliceBetween("function updatePlanVariable(element)", "function bindOtherMemberInputs()");
const variableFields = { factor: "倒摄干扰", independentVariablePlan: "", dependentVariablePlan: "", controlVariablePlan: "", emotionCondition: "中性" };
let savedPlan = 0;
const variableContext = {
  state: { fields: variableFields },
  main: {
    querySelectorAll: (selector) => selector.includes('"dependent"') ? [{ value: "记忆表现（得分与正确率）" }] : [{ value: "测试方式" }],
    querySelector: () => ({ value: "同一教室" })
  },
  syncLegacyFlowFields: () => {},
  saveState: () => { savedPlan += 1; }
};
vm.runInNewContext(planVariableSource, variableContext);
vm.runInNewContext('updatePlanVariable({ dataset: { planVariable: "factor" }, value: "材料相似性" })', variableContext);
assert.strictEqual(variableFields.factor, "材料相似性");
assert.strictEqual(variableFields.independentVariablePlan, "材料相似性");
assert.strictEqual(variableFields.emotionCondition, "");
vm.runInNewContext('updatePlanVariable({ dataset: { planVariable: "controlOther" } })', variableContext);
assert.strictEqual(variableFields.dependentVariablePlan, "记忆表现（得分与正确率）");
assert.strictEqual(variableFields.controlVariablePlan, "测试方式、同一教室");
assert.strictEqual(savedPlan, 2, "variable answers must be saved as they change");
const planValidationSource = sliceBetween("function validateStep(stepId)", "function renderProgress()");
const validationFields = { ...planFields, factor: "材料相似性", independentVariablePlan: "材料相似性", dependentVariablePlan: "记忆表现（得分与正确率）", controlVariablePlan: "测试方式" };
const validationContext = { state: { fields: validationFields }, PLAN_FACTORS: ["倒摄干扰", "材料相似性"], isDeveloperMode: () => false, isSurveyStepComplete: () => true, hasText: (value) => String(value || "").trim().length > 0, hasValidNumber: (value, min, max) => value !== "" && Number(value) >= min && Number(value) <= max };
vm.runInNewContext(planValidationSource, validationContext);
assert.strictEqual(vm.runInNewContext('validateStep("plan")', validationContext), true, "both factor choices must be able to complete the plan");
validationFields.factor = "情绪";
assert.strictEqual(vm.runInNewContext('validateStep("plan")', validationContext), false, "legacy emotion factor must not complete a new plan");
validationFields.factor = "材料相似性";
validationFields.controlVariablePlan = "";
assert.strictEqual(vm.runInNewContext('validateStep("plan")', validationContext), false, "plan needs a control-variable answer");
const factorOptionsSource = sliceBetween("function getInterferenceFactorOptions(selectedValue)", "function getMaterialTypeOptions()");
vm.runInNewContext(factorOptionsSource, validationContext);
assert.strictEqual(vm.runInNewContext('getInterferenceFactorOptions("").length', validationContext), 3, "new teammate records must offer only two factors");
assert.strictEqual(vm.runInNewContext('getInterferenceFactorOptions("emotion").length', validationContext), 4, "historical emotion answers must remain visible");
assert(source.includes(".time-parameter-grid") && source.includes("grid-template-columns: repeat(3"), "time parameters must share one desktop row");
assert(source.includes('merged.fields.interferenceSeconds = sharedPhaseSeconds;'), "saved rest and interference times must be reconciled on load");
const updateFieldSource = sliceBetween("function updateField(element, field)", "function bindHeadbandModalEvents()");
const fields = { restSeconds: "", interferenceSeconds: "" };
const inputs = { restSeconds: { value: "" }, interferenceSeconds: { value: "" } };
const context = {
  state: { fields },
  main: { querySelectorAll: (selector) => [inputs[selector.match(/data-field="([^"]+)"/)[1]]] },
  saveState() {}
};
vm.runInNewContext(updateFieldSource, context);
vm.runInNewContext('updateField({ type: "number", value: "45" }, "restSeconds")', context);
assert.strictEqual(fields.restSeconds, 45);
assert.strictEqual(fields.interferenceSeconds, 45);
assert.strictEqual(inputs.interferenceSeconds.value, "45");
vm.runInNewContext('updateField({ type: "number", value: "90" }, "interferenceSeconds")', context);
assert.strictEqual(fields.restSeconds, 90);
assert.strictEqual(fields.interferenceSeconds, 90);
assert.strictEqual(inputs.restSeconds.value, "90");
assert(source.includes('html[data-theme="archive"] body.experiment-page .quiz-card p { color: var(--ink); }'), "archive quiz question text must use the theme ink color");
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
