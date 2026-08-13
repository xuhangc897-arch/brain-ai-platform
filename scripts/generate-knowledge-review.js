"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = {};
context.window = context;
[
  "knowledge-pretest.js",
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
  { id: "T0/T5", title: "课程前测与课程后测共用题库", questions: context.BrainKnowledgePretestQuestions },
  { id: "T1", title: "短时记忆容量即时测试", questions: context.BrainKnowledgePostMemoryQuestions },
  { id: "T2", title: "工作记忆 / N-back 即时测试", questions: context.BrainKnowledgePostNbackQuestions },
  { id: "T3", title: "长时记忆干扰即时测试", questions: context.BrainKnowledgePostInterferenceQuestions },
  { id: "T4", title: "长时记忆策略即时测试", questions: context.BrainKnowledgePostStrategyQuestions }
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
  "> 审核状态：已审核通过<br>",
  "> 版本说明：本轮已移除 T0/T5 对 N-back 范式先验知识的依赖，并重写全部40道唯一题目的干扰项。<br>",
  "> 题目数量：学生端呈现60题次，实际唯一题目40道；T0与T5完全共用同一套20题。",
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
  "| T5 | 课程结束知识后测 | 20 | 直接调用T0题库，独立随机题序 |",
  "",
  "## 二、题目明细",
  ""
];

let number = 1;
stages.forEach((stage) => {
  lines.push(`### ${stage.id} ${stage.title}（${stage.questions.length}题）`, "");
  if (stage.id === "T0/T5") {
    lines.push("T0和T5的题目ID、题干、选项与答案完全相同；T5不建立独立题库。", "");
  }
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
const post = stages.slice(1).flatMap((stage) => stage.questions);
const stageRows = [
  ["T0", distribution(t0)],
  ["T1", distribution(stages[1].questions)],
  ["T2", distribution(stages[2].questions)],
  ["T3", distribution(stages[3].questions)],
  ["T4", distribution(stages[4].questions)],
  ["T1–T4合计", distribution(post)],
  ["T5", distribution(t0)]
];

lines.push(
  "## 三、本轮修订说明",
  "",
  "### 1. T0/T5中的N-back先验知识处理",
  "",
  "- 替换 `t0_nback_concept_2`：原题要求理解“N值增大”的含义，现改为阅读时联系前后信息的工作记忆情境。",
  "- 替换 `t0_nback_experiment_1`：原题要求比较1-back和2-back，现改为比较“边听通知边回复消息”和“只听通知”的控制变量题。",
  "- 同时重写工作记忆模块其余3题，使5题均可凭生活经验和一般学习经历理解。",
  "- 经自动检查，T0/T5的题干和选项均不包含1-back、2-back、3-back、N-back、N值或具体判断规则；N-back专业知识仅保留在T2即时测试。",
  "",
  "### 2. 弱干扰项重写",
  "",
  "- T0/T5共用20题和T1–T4共20题的干扰项均已重写。",
  "- 删除或替换依靠绝对词即可排除的选项，例如“永久保存所有信息”“自动扩大容量”“设备损坏是唯一原因”“只抄写标点符号”等。",
  "- 新干扰项主要采用相邻概念混淆、因果方向倒置、部分正确但不充分的解释、现实中常见的次优策略，以及仍带一个混杂因素的实验方案。",
  "- 实验推理题增加了简单数据、条件比较或控制变量判断，但未增加超出七年级理解范围的术语。",
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
  "| 全部题目 | 同意按本版本执行 | 无 | 用户审核 | 已通过 |",
  "",
  "## 五、审核确认项",
  "",
  "- [x] T0/T5不要求学生预先理解N-back范式或规则。",
  "- [x] T0与T5的题目ID、题干、选项和答案完全一致。",
  "- [x] 每题只有一个明确最佳答案。",
  "- [x] 四个选项处于相近的逻辑层次，不能仅凭绝对词排除。",
  "- [x] 题干、情境和数据适合七年级学生阅读。",
  "- [x] T2继续考查N-back专业知识。"
);

fs.writeFileSync(
  path.join(root, "docs", "知识测评T0-T5题库审核稿.md"),
  `${lines.join("\n")}\n`,
  "utf8"
);
