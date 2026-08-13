(function (global) {
  "use strict";
  const questions = [
    { id: "t3_interference_concept_1", question: "学习新手机号后，旧手机号变得更难回忆，这主要属于（ ）", options: { A: "旧信息促进新信息", B: "前摄干扰", C: "倒摄干扰", D: "提取练习" }, answer: "C" },
    { id: "t3_interference_concept_2", question: "使用新密码登录时，总是不自觉输入旧密码，这主要属于（ ）", options: { A: "前摄干扰", B: "倒摄干扰", C: "记忆分组", D: "主动回忆" }, answer: "A" },
    { id: "t3_interference_phenomenon_1", question: "甲组先学A词表再学相似的B词表，乙组先学A词表再学不相似的C词表；A词表回忆率为54%和76%。该结果更支持（ ）", options: { A: "C词表帮助乙组复习了A词表", B: "甲组学习B词表的时间可能更长", C: "乙组对A词表的最初记忆容量更大", D: "相似材料比不相似材料产生更强干扰" }, answer: "D" },
    { id: "t3_interference_phenomenon_2", question: "研究材料相似性对记忆干扰的影响，下列方案较合理的是（ ）", options: { A: "相似组学习两遍，不相似组学习一遍，再比较回忆率", B: "两组学习时间相同，只改变后学材料与原材料的相似程度", C: "相似组用单词，不相似组用图片，呈现数量相同", D: "两组使用相同材料，但安排在不同教室和不同时段" }, answer: "B" },
    { id: "t3_interference_transfer_1", question: "复习两组容易混淆的概念时，下列安排更有助于减少干扰的是（ ）", options: { A: "连续交替朗读两组概念，增加接触次数", B: "先记共同点，再把差异留到最后复习", C: "列出对应差异，并在两组学习之间留出间隔", D: "分别抄写两组定义，保持相同书写格式" }, answer: "C" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostInterferenceQuestions = Object.freeze(questions);
})(window);
