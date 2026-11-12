"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = {};
context.window = context;
[
  "knowledge-pretest.js",
  "knowledge-posttest.js",
  "knowledge-post-memory.js",
  "knowledge-post-nback.js",
  "knowledge-post-interference.js",
  "knowledge-post-strategy.js"
].forEach((file) => vm.runInNewContext(
  fs.readFileSync(path.join(root, "assets", file), "utf8"),
  context,
  { filename: file }
));

const stages = [
  { id: "T0", title: "课程知识前测", questions: context.BrainKnowledgePretestQuestions },
  { id: "T1", title: "短时记忆容量即时测试", questions: context.BrainKnowledgePostMemoryQuestions },
  { id: "T2", title: "工作记忆 / N-back 即时测试", questions: context.BrainKnowledgePostNbackQuestions },
  { id: "T3", title: "长时记忆干扰即时测试", questions: context.BrainKnowledgePostInterferenceQuestions },
  { id: "T4", title: "长时记忆策略即时测试", questions: context.BrainKnowledgePostStrategyQuestions },
  { id: "T5", title: "课程知识后测（平行卷初稿）", questions: context.BrainKnowledgePosttestQuestions }
];

const typeLabels = {
  concept: "核心概念",
  life: "生活应用",
  experiment: "实验推理",
  phenomenon: "现象解释",
  transfer: "生活迁移"
};
const categoryLabels = {
  memory: "短时记忆容量",
  nback: "工作记忆",
  interference: "长时记忆干扰",
  strategies: "长时记忆策略"
};

function typeOf(question) {
  return Object.keys(typeLabels).find((key) => question.id.includes(`_${key}_`)) || "";
}

function distribution(questions) {
  return Object.fromEntries(["A", "B", "C", "D"].map((key) => [
    key,
    questions.filter((question) => question.answer === key).length
  ]));
}

const lines = [
  "# 知识测评 T0–T5 题库审核稿",
  "",
  "> 适用对象：七年级学生<br>",
  "> 审核状态：新增 T5 题库待学科教师审题与学生试测；不能仅凭内容对应认定心理测量意义上的平行性。<br>",
  "> 题目数量：学生端呈现60题次，实际唯一题目60道；T0与T5各有独立的20题。",
  "",
  "## 一、结构核对",
  "",
  "| 阶段 | 内容 | 题数 | 呈现规则 |",
  "| --- | --- | ---: | --- |",
  "| T0 | 课程开始前知识前测 | 20 | 独立随机题序 |",
  "| T1 | 短时记忆容量即时测试 | 5 | 固定题目、固定顺序 |",
  "| T2 | 工作记忆 / N-back 即时测试 | 5 | 固定题目、固定顺序 |",
  "| T3 | 长时记忆干扰即时测试 | 5 | 固定题目、固定顺序 |",
  "| T4 | 长时记忆策略即时测试 | 5 | 固定题目、固定顺序 |",
  "| T5 | 课程结束知识后测 | 20 | 独立平行卷初稿，随机题序 |",
  "",
  "## 二、题目明细",
  ""
];

let number = 1;
stages.forEach((stage) => {
  lines.push(`### ${stage.id} ${stage.title}（${stage.questions.length}题）`, "");
  stage.questions.forEach((question) => {
    const type = typeOf(question);
    lines.push(
      `#### ${number}. ${question.question}`,
      "",
      `- ID：\`${question.id}\``,
      `- 模块：${categoryLabels[question.category] || stage.title}`,
      `- 题型：${typeLabels[type] || "知识测评"}`,
      `- A. ${question.options.A}`,
      `- B. ${question.options.B}`,
      `- C. ${question.options.C}`,
      `- D. ${question.options.D}`,
      `- 标准答案：${question.answer}`,
      ""
    );
    number += 1;
  });
});

const t0 = stages[0].questions;
const post = stages.slice(1, 5).flatMap((stage) => stage.questions);
const stageRows = [
  ["T0", distribution(t0)],
  ["T1", distribution(stages[1].questions)],
  ["T2", distribution(stages[2].questions)],
  ["T3", distribution(stages[3].questions)],
  ["T4", distribution(stages[4].questions)],
  ["T1–T4合计", distribution(post)],
  ["T5", distribution(stages[5].questions)]
];

lines.push(
  "## 三、设计与审核说明",
  "",
  "### 1. T0与T5的对应",
  "",
  "- T0保持原题库不变。T5按相同的四模块各5题、概念6题、生活应用10题、实验推理4题编写独立题目。",
  "- 对应题使用相同知识点与认知任务，但更换题干、情境、选项和题目ID。详见《前后测20题对应与平行测验蓝图》。",
  "- T0与T5均不要求预先理解N-back范式规则；N-back专业知识仅在T2即时测试中考查。",
  "- 平行性仍需经学科教师审题、同年级学生试测与统计检验；当前称为平行卷初稿。",
  "",
  "### 2. 弱干扰项重写",
  "",
  "- 新 T5 题保持四选一，每题一个预设最佳答案；干扰项需在审题和试测中继续检查。",
  "",
  "### 3. A/B/C/D答案分布",
  "",
  "| 阶段 | A | B | C | D | 总题数 |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...stageRows.map(([stage, dist]) => `| ${stage} | ${dist.A} | ${dist.B} | ${dist.C} | ${dist.D} | ${dist.A + dist.B + dist.C + dist.D} |`),
  "",
  "## 四、审核意见记录",
  "",
  "| 题目 ID | 审核意见 | 建议修改 | 审核人 | 状态 |",
  "| --- | --- | --- | --- | --- |",
  "| 新增 T5 题目 | 待学科教师审题和同年级学生试测 | 检查内容、歧义、难度与区分度 | 待定 | 待审核 |",
  "",
  "## 五、审核确认项",
  "",
  "- [x] T0与T5不要求学生预先理解N-back范式规则。",
  "- [x] T0与T5题目ID和题干不同，模块及题型配额一致。",
  "- [ ] 学科教师确认每题只有一个明确最佳答案、选项质量和七年级适读性。",
  "- [ ] 同年级学生试测并检验两卷难度、区分度、信度及分数对应关系。",
  "- [x] T2继续考查N-back专业知识。"
);

fs.writeFileSync(
  path.join(root, "docs", "知识测评T0-T5题库审核稿.md"),
  `${lines.join("\n")}\n`,
  "utf8"
);
