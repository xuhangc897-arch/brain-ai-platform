(function (global) {
  "use strict";
  const questions = [
    { id: "t4_strategies_concept_1", question: "下列学习活动中，主动回忆程度最高的是（ ）", options: { A: "看着提纲复述课文，再核对细节", B: "重读两遍课文后，标出重点句", C: "抄写关键词后，按原文补全句子", D: "合上资料写出要点，再根据原文订正" }, answer: "D" },
    { id: "t4_strategies_concept_2", question: "信息可视化策略最适合用于（ ）", options: { A: "增加材料的颜色和装饰，使页面更醒目", B: "呈现概念之间的层级、顺序或因果关系", C: "把长句缩短成便于朗读的关键词", D: "记录每次复习的时间和完成数量" }, answer: "B" },
    { id: "t4_strategies_phenomenon_1", question: "同一学生用相同时间学习两篇难度相近的材料：重读材料得分72分，回忆练习材料得分84分。较谨慎的结论是（ ）", options: { A: "对这名学生和这类材料，回忆练习表现更好", B: "回忆练习对每类材料的效果都优于重读", C: "两次得分差异说明重读没有学习作用", D: "回忆练习提高了该学生的记忆容量" }, answer: "A" },
    { id: "t4_strategies_phenomenon_2", question: "比较概念图和重复朗读的学习效果时，下列控制方式最合理的是（ ）", options: { A: "概念图组学习15分钟，朗读组学习10分钟，材料相同", B: "概念图组学科学材料，朗读组学语文材料，时间相同", C: "两组材料、学习时间和测试方式相同，只改变学习策略", D: "两组策略相同，但一组测试选择题，另一组测试简答题" }, answer: "C" },
    { id: "t4_strategies_transfer_1", question: "学习一篇结构复杂的科学文章后，怎样安排能同时练习结构整理和主动回忆？", options: { A: "反复朗读全文，再抄写不熟悉的句子", B: "画出概念关系，并对照文章补充细节", C: "背诵文章结论，再根据关键词复述", D: "整理概念关系，再合上资料回忆并检查" }, answer: "D" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostStrategyQuestions = Object.freeze(questions);
})(window);
