(function (global) {
  "use strict";
  const questions = [
    { id: "t2_nback_concept_1", question: "工作记忆与短时保持相比，更强调（ ）", options: { A: "信息保持时间较长", B: "保持信息的同时对其进行加工", C: "把信息与情绪体验联系起来", D: "依靠重复使信息进入长期储存" }, answer: "B" },
    { id: "t2_nback_concept_2", question: "完成2-back任务时，当前项目出现后，学习者需要（ ）", options: { A: "把当前项目与前一个项目比较", B: "记住当前项目，忽略前面出现的项目", C: "判断当前项目是否与前两个位置的项目相同", D: "统计当前项目在整组材料中出现的次数" }, answer: "C" },
    { id: "t2_nback_phenomenon_1", question: "同一同学完成1-back和3-back时，正确率分别为92%和67%，反应时间分别为620毫秒和850毫秒。较合理的解释是（ ）", options: { A: "3-back需要保持和更新更多信息，任务负担更大", B: "3-back项目出现得更慢，使判断速度下降", C: "1-back练习次数较多，使记忆容量增加", D: "两项任务使用相同材料，成绩差异来自猜测" }, answer: "A" },
    { id: "t2_nback_phenomenon_2", question: "研究注意干扰对2-back表现的影响，较合理的比较方案是（ ）", options: { A: "安静条件用数字，干扰条件用字母，呈现速度相同", B: "安静条件做1-back，干扰条件做2-back，材料相同", C: "两种条件材料相同，但干扰条件增加更多练习", D: "两种条件任务和材料相同，仅干扰条件播放无关声音" }, answer: "D" },
    { id: "t2_nback_transfer_1", question: "阅读包含多个条件的应用题时，下列做法最能减轻工作记忆负担的是（ ）", options: { A: "先读问题，再凭印象寻找相关数字", B: "圈出条件，画出关系并分步骤计算", C: "把题目多读几遍，同时记住所有数字", D: "先计算最熟悉的部分，再补看遗漏条件" }, answer: "B" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostNbackQuestions = Object.freeze(questions);
})(window);
