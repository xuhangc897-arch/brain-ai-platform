(function (global) {
  "use strict";
  const questions = [
    { id: "t4_strategies_concept_1", question: "主动回忆策略强调（ ）", options: { A: "不看答案，主动尝试提取学过的信息", B: "始终看着答案重复抄写", C: "遇到困难立即跳过", D: "只在第一次学习时阅读" }, answer: "A" },
    { id: "t4_strategies_concept_2", question: "信息可视化策略主要是把知识（ ）", options: { A: "转化为图像、图表或结构关系", B: "改写成互不相关的句子", C: "全部删除只保留标题", D: "按页码机械排列" }, answer: "A" },
    { id: "t4_strategies_phenomenon_1", question: "同一名同学使用主动回忆时比简单复述记得更多，这说明（ ）", options: { A: "主动回忆在当前材料和任务中可能更有效", B: "主动回忆永远适合所有人和所有材料", C: "简单复述在任何情况下都没有作用", D: "记忆表现与策略选择完全无关" }, answer: "A" },
    { id: "t4_strategies_phenomenon_2", question: "比较两种记忆策略的效果时，为什么要尽量保持材料难度和学习时间一致？", options: { A: "让结果差异更可能来自策略本身", B: "保证所有人的成绩完全相同", C: "让学习材料变得没有意义", D: "避免记录任何实验数据" }, answer: "A" },
    { id: "t4_strategies_transfer_1", question: "学习一篇结构复杂的科学文章时，下列做法更合理的是（ ）", options: { A: "只重复阅读最后一句", B: "先整理概念关系，再合上资料尝试回忆要点", C: "只抄写标点符号", D: "不考虑任务特点，随意选择方法" }, answer: "B" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostStrategyQuestions = Object.freeze(questions);
})(window);
