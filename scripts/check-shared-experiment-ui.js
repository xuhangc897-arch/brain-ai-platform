"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
  assert(page.includes('<link rel="stylesheet" href="assets/experiment-theme.css">'), `${file}: knowledge choices must load the shared layout`);
  assert(page.includes('className: "survey-page"'), `${file}: paged surveys must expose the shared ten-column layout hook`);
  assert(!page.includes('showStepMessage("请先完成本步骤内容。")'), `${file}: generic incomplete message must not remain`);
  assert(page.includes("preparePagedInputLifecycle();"), `${file}: pagination lifecycle preparation missing`);
  assert(page.includes("window.TaskRelevance?.beforePageChange();"), `${file}: relevance pre-page hook missing`);
  assert(page.includes("window.TypingSupport?.beforePageChange();"), `${file}: typing support pre-page hook missing`);
  assert(page.includes("window.TaskRelevance?.afterPageRender();"), `${file}: relevance post-render hook missing`);
  assert(page.includes("window.TypingSupport?.afterPageRender();"), `${file}: typing support post-render hook missing`);

  const itemSource = page.slice(page.indexOf("function getSurveyItems(surveyKey, defKey)"), page.indexOf("function renderSurveyForm(surveyKey, defKey)") > 0 ? page.indexOf("function renderSurveyForm(surveyKey, defKey)") : page.indexOf("function renderSurveyForm(surveyKey, defKey, startIndex"));
  const summarySource = page.slice(page.indexOf("function summarizeSurvey(surveyKey, defKey)"), page.indexOf("function isSurveyStepComplete(stepId)"));
  assert(itemSource.startsWith("function getSurveyItems"), `${file}: inquiry attention item helper missing`);
  const answers = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`q${index + 1}`, 3]));
  const context = {
    state: { surveys: { current: { inquiryParticipation: answers } } },
    SURVEY_DEFS: { inquiry: { items: Array.from({ length: 9 }, (_, index) => `原题${index + 1}`) } },
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    saveState: () => { context.saves += 1; },
    saves: 0
  };
  vm.runInNewContext(itemSource + summarySource, context);
  let items = vm.runInNewContext('getSurveyItems("inquiryParticipation", "inquiry")', context);
  assert.strictEqual(items.length, 10, `${file}: attention item must be added once`);
  assert.strictEqual(items[0].key, "q10", `${file}: attention item must support the first position`);
  assert.strictEqual(context.saves, 1, `${file}: insertion position must be saved once`);
  context.Math.random = () => 0.99;
  items = vm.runInNewContext('getSurveyItems("inquiryParticipation", "inquiry")', context);
  assert.strictEqual(items[0].key, "q10", `${file}: position must survive rerenders`);
  assert.strictEqual(context.saves, 1, `${file}: rerender must not resave a position`);
  answers.attentionPosition = 9;
  items = vm.runInNewContext('getSurveyItems("inquiryParticipation", "inquiry")', context);
  assert.strictEqual(items[9].key, "q10", `${file}: attention item must support a final page`);
  assert.strictEqual(items[8].key, "q9", `${file}: original answer keys must remain stable`);
  assert.strictEqual(context.saves, 1);
  assert.strictEqual(vm.runInNewContext('summarizeSurvey("inquiryParticipation", "inquiry").complete', context), false);
  answers.q10 = 2;
  assert.strictEqual(vm.runInNewContext('summarizeSurvey("inquiryParticipation", "inquiry").complete', context), true, `${file}: wrong attention answer must still allow completion`);
  assert.strictEqual(vm.runInNewContext('summarizeSurvey("inquiryParticipation", "inquiry").total', context), 27, `${file}: attention answer must not affect the scale total`);
}

const dashboard = source("admin/dashboard.html");
const sheetSource = dashboard.slice(dashboard.indexOf("function buildSurveySheet(studentLabel"), dashboard.indexOf("function buildKnowledgeQuizSheet(studentLabel"));
const sheetContext = { MEMORY_SURVEY_DEFS: { inquiryParticipation: { title: "探究参与", items: Array(9).fill("原题"), labels: { 3: "一般" } } } };
vm.runInNewContext(sheetSource, sheetContext);
for (const [answer, expected] of [[undefined, "未采集"], [4, "通过"], [2, "未通过"]]) {
  const values = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`q${index + 1}`, 3]));
  if (answer !== undefined) values.q10 = answer;
  const sheet = vm.runInNewContext('buildSurveySheet("学生", state, "inquiryParticipation")', { ...sheetContext, state: { surveys: { inquiryParticipation: values } } })[1];
  assert.strictEqual(sheet[10][3], expected, `teacher export must show ${expected}`);
  assert.strictEqual(sheet[11][2], 27, "teacher export must exclude attention answer from total");
}

const theme = source("assets/experiment-theme.css");
assert(/body\.experiment-page \.quiz-options\s*\{[^}]*grid-template-columns:\s*1fr;/.test(theme), "knowledge choices must use the same single-column layout in all four experiments");
for (const marker of [
  "body.experiment-page .headband-modal,",
  "body.experiment-page .image-modal",
  "z-index: 10050",
  "body.experiment-page.is-focus-mode .memory-partner",
  "body.experiment-page .quiz-key",
  "body.experiment-page .quiz-label",
  "grid-template-columns: repeat(10, minmax(0, 1fr))",
  "body.experiment-page .survey-page .survey-option-card",
  "font-size: 21px",
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
const conditionSource = nback.slice(nback.indexOf("function populateConditions()"), nback.indexOf("function startGame()"));
function nbackConditions(experimentDesign) {
  const select = { innerHTML: "" };
  vm.runInNewContext(`${conditionSource}\npopulateConditions();`, {
    state: { fields: { experimentDesign } },
    document: { getElementById: () => select }
  });
  return Array.from(select.innerHTML.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g), ([, value, label]) => ({ value, label }));
}
assert.deepStrictEqual(nbackConditions("N的大小"), [2, 3, 4, 5, 6].map((n) => ({ value: `${n}-20`, label: `N=${n}，关卡数=20` })));
assert.deepStrictEqual(nbackConditions("关卡数量"), [15, 20, 25, 30, 35].map((total) => ({ value: `3-${total}`, label: `N=3，关卡数=${total}` })));
assert(!/survey-items\s*\{\s*grid-template-columns:\s*repeat\(3/.test(nback), "N-back survey questions must not use narrow three-column cards");
assert(nback.includes("question: 4") && nback.includes('if (stepId === "question") return 3'), "N-back question pagination must contain four pages");
const nbackQuestion = nback.slice(nback.lastIndexOf("function renderQuestionStep()"), nback.lastIndexOf("function renderHypothesisStep()"));
assert(!nbackQuestion.includes('title: "科学探究案例"') && !nbackQuestion.includes("renderInquiryCases()"), "N-back active question pages must omit inquiry cases");
assert(nbackQuestion.includes('title: "提出研究问题"') && nbackQuestion.includes('renderInquiryScaffold("question")'), "N-back final question page must retain research prompts");
const memoryQuestion = source("memory.html");
const memoryPages = memoryQuestion.slice(memoryQuestion.indexOf("const QUESTION_PAGES = ["), memoryQuestion.indexOf("function renderQuestionStep()"));
assert(memoryQuestion.includes("question: 3") && !memoryPages.includes('title: "科学探究案例"'), "memory question pagination must contain three pages without inquiry cases");
assert(nback.includes('title: "材料三与材料四：控制变量和头环"') && nback.includes("merged-reading-page"), "N-back materials three and four must share one page");
assert(nback.includes(".reading-page .page-card p { margin: 0 0 14px; font-size: 18px; line-height: 1.8; }"), "N-back reading pages must use shared reading typography");

const interference = source("interference.html");
const interferencePlan = interference.slice(interference.indexOf("function renderPagedPlanStep()"), interference.indexOf("function renderPlanStep()"));
assert(interference.includes("plan: 5"), "interference plan pagination must contain five pages");
assert(!interferencePlan.includes("interferenceStagePlan") && !interferencePlan.includes("参与者编号") && !interferencePlan.includes("固定材料条件数"), "interference plan must omit removed controls");
assert(interference.includes("interferenceStagePlan: \"\"") && !interference.includes('["干扰阶段补全文字",state.fields.interferenceStagePlan]'), "interference must read legacy stage text without exporting it");
assert(interference.includes(".time-parameter-grid") && interference.includes("grid-template-columns: repeat(3, minmax(0, 1fr))"), "interference time controls must use three desktop columns");
for (const [file, selector] of [["memory.html", ".question-page-actions"], ["nback.html", ".step-page-actions"], ["interference.html", ".question-page-actions"], ["strategies.html", ".question-page-actions"]]) {
  assert(new RegExp(`${selector.replaceAll(".", "\\.")} #stepNextPage\\s*\\{\\s*margin-left:\\s*auto;`).test(source(file)), `${file}: next-page button must stay at the right edge`);
}
assert(!memoryQuestion.includes("padding-right: 112px"), "memory pagination must not shift the next button left at desktop widths");
const sharedExperimentTheme = source("assets/experiment-theme.css");
assert(!sharedExperimentTheme.includes("has-virtual-agent .question-page-actions") && !sharedExperimentTheme.includes("has-virtual-agent .step-page-actions"), "shared virtual-agent styles must not shift pagination controls left");
assert(sharedExperimentTheme.includes("has-virtual-agent .evidence-page .actions"), "evidence actions must retain their existing virtual-agent spacing");

const strategies = source("strategies.html");
assert(strategies.includes("plan: 7") && !strategies.includes('title: "材料五：突袭测试与结果"'), "strategy plan pagination must contain seven pages with one material-five page");
assert(strategies.includes(".plan-reading-page { font-size: 18px; line-height: 1.8; }") && strategies.includes(".strategy-guide-grid .strategy-info-card p { font-size: 18px; line-height: 1.8; }") && strategies.includes(".material-match-page .reading-card > p { font-size: 18px; line-height: 1.8; }"), "strategy reading sections must use shared reading typography");
assert(strategies.includes("accent-color: var(--primary)") && strategies.includes("::-webkit-slider-thumb") && strategies.includes("::-moz-range-thumb"), "strategy difficulty sliders must use the active theme color");
assert(strategies.includes("思考：为什么有的材料适合一种策略，而有的材料适合另一种策略？"), "strategy recommendation must include the reflection prompt");
assert(strategies.includes("中文释义用于辅助记忆，回忆时不需要写出中文。") && strategies.match(/回忆时需要按顺序写出。/g)?.length >= 2, "strategy memory and recall must explain ordered English-only responses");
assert(strategies.includes('html[data-theme="archive"] body.experiment-page .combination-progress-item:not(.is-complete)') && strategies.includes('html[data-theme="archive"] body.experiment-page .memory-item') && strategies.includes('html[data-theme="archive"] body.experiment-page .quiz-card p'), "strategy archive screens must replace blue accents");
const strategyPageSource = strategies.slice(strategies.indexOf("function getStepPageCount(stepId)"), strategies.indexOf("function renderPagedStep(stepId, pages)")) +
  strategies.slice(strategies.indexOf("function renderEvidenceStep()"), strategies.indexOf("function getNextEvidenceAssignment()"));
for (const [attemptCount, scoreCount] of [[0, 0], [4, 1], [7, 4]]) {
  const context = {
    state: { attemptHistory: Array(attemptCount).fill({}), strategyScores: Array(scoreCount).fill({}) },
    renderPagedStep: (_, pages) => pages,
    renderEvidenceStartPage() {}
  };
  vm.runInNewContext(strategyPageSource, context);
  const pages = vm.runInNewContext('renderEvidenceStep()', context);
  assert.strictEqual(pages[2].title, "长时记忆策略评分", "strategy scoring must remain evidence page three");
  assert.strictEqual(pages.length, vm.runInNewContext('getStepPageCount("evidence")', context), "strategy evidence page count must match its rendered pages");
}
const strategyScoringSource = strategies.slice(strategies.indexOf("function normalizeRecallValue(value, type)"), strategies.indexOf("function updateGameUi(totalSeconds)"));
const scoringContext = { items: [{ answer: "cat", type: "word" }, { answer: "dog", type: "word" }] };
vm.runInNewContext(strategyScoringSource, scoringContext);
assert.strictEqual(vm.runInNewContext('scoreRecall(["cat", "dog"], items).length', scoringContext), 2);
assert.strictEqual(vm.runInNewContext('scoreRecall(["dog", "cat"], items).length', scoringContext), 0, "reordered responses must not score as correct");
assert.strictEqual(vm.runInNewContext('scoreRecall(["", "dog"], items).length', scoringContext), 1, "blank recall slots must preserve later positions");

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
