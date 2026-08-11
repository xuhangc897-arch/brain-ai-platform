"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const experimentFiles = ["memory.html", "nback.html", "interference.html", "strategies.html"];

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function metaQuestionCount(page) {
  const metaStart = page.indexOf("meta: {");
  const loadStart = page.indexOf("load: {", metaStart);
  assert(metaStart >= 0 && loadStart > metaStart, "survey definitions must contain meta and load sections");
  const metaSection = page.slice(metaStart, loadStart);
  const items = metaSection.match(/items:\s*\[([\s\S]*?)\]/);
  assert(items, "metacognition items must be present");
  return (items[1].match(/^\s*"/gm) || []).length;
}

for (const file of experimentFiles) {
  const page = source(file);
  assert.strictEqual(metaQuestionCount(page), 5, `${file}: learning-outcome metacognition survey must have five items`);
  assert(page.includes("function getIncompleteStepMessage(stepId)"), `${file}: missing incomplete-page formatter`);
  assert(page.includes("showStepMessage(getIncompleteStepMessage(steps[state.currentStep].id))"), `${file}: validation must include the incomplete page`);
  assert(page.includes('class="quiz-key"') && page.includes('class="quiz-label"'), `${file}: knowledge choices must use qualification-style structure`);
  assert(!page.includes('showStepMessage("请先完成本步骤内容。")'), `${file}: generic incomplete message must not remain`);
}

const theme = source("assets/experiment-theme.css");
for (const marker of [
  "body.experiment-page .headband-modal,",
  "body.experiment-page .image-modal",
  "z-index: 10050",
  "body.experiment-page.is-focus-mode .memory-partner",
  "body.experiment-page .quiz-key",
  "body.experiment-page .quiz-label",
  "The page header is the single visual title"
]) {
  assert(theme.includes(marker), `shared experiment theme missing: ${marker}`);
}

const submission = source("assets/experiment-submission.js");
assert(submission.includes("index <= 5"), "submission normalization must exclude legacy metacognition q6");

const memory = source("memory.html");
assert(memory.includes(".method-page .method-card {\n      padding: 22px;\n      height: 100%") && memory.includes("align-items: stretch"), "memory method cards must stretch to equal desktop height");
assert(memory.includes('stepId === "plan" && pageIndex === 2 && state.fields.planOrderConfirmed !== true'), "memory plan flow must block its own next-page action");
assert(memory.includes('showStepMessage("请先将实验计划流程调整为正确顺序并确认。")'), "memory plan flow must show a clear ordering message");

const nback = source("nback.html");
assert(nback.includes("question: 5") && nback.includes('if (stepId === "question") return 4'), "N-back question pagination must contain five pages");
assert(nback.includes('title: "材料三与材料四：控制变量和头环"') && nback.includes("merged-reading-page"), "N-back materials three and four must share one page");
assert(nback.includes(".reading-page .page-card p") && nback.includes("font-size: 16px") && nback.includes("line-height: 1.8"), "N-back reading pages must use readable typography");

const interference = source("interference.html");
const interferencePlan = interference.slice(interference.indexOf("function renderPagedPlanStep()"), interference.indexOf("function renderPlanStep()"));
assert(interference.includes("plan: 6"), "interference plan pagination must contain six pages");
assert(!interferencePlan.includes("interferenceStagePlan") && !interferencePlan.includes("参与者编号") && !interferencePlan.includes("固定材料条件数"), "interference plan must omit removed controls");
assert(interference.includes("interferenceStagePlan: \"\"") && !interference.includes('["干扰阶段补全文字",state.fields.interferenceStagePlan]'), "interference must read legacy stage text without exporting it");
assert(interference.includes(".time-parameter-grid") && interference.includes("grid-template-columns: repeat(3, minmax(0, 1fr))"), "interference time controls must use three desktop columns");

const strategies = source("strategies.html");
assert(strategies.includes("plan: 7") && !strategies.includes('title: "材料五：突袭测试与结果"'), "strategy plan pagination must contain seven pages with one material-five page");
assert(strategies.includes(".plan-reading-page { font-size: 16px; line-height: 1.8; }") && strategies.includes(".strategy-guide-grid .strategy-info-card p") && strategies.includes(".material-match-page .reading-card p"), "strategy reading sections must use readable typography");
assert(strategies.includes("accent-color: var(--primary)") && strategies.includes("::-webkit-slider-thumb") && strategies.includes("::-moz-range-thumb"), "strategy difficulty sliders must use the active theme color");

for (const file of [
  "cloudfunctions/generateLearningDiagnosis/index.js",
  "cloudfunctions/generateExperimentMemory/index.js",
  "cloudfunctions/getLearningDiagnosis/index.js"
]) {
  const cloudSource = source(file);
  assert(cloudSource.includes("postMeta: 5"), `${file}: metacognition completion count must be five`);
  assert(!cloudSource.includes("postMeta: 6"), `${file}: legacy six-question requirement must be removed`);
}

console.log("Shared four-experiment UI and five-question survey contracts passed.");
