(function (global) {
  "use strict";
  const questions = [
    { id: "t3_interference_concept_1", question: "倒摄干扰描述的是（ ）", options: { A: "旧信息影响新信息", B: "新信息影响旧信息的回忆", C: "注意影响感觉输入", D: "分组提高短时记忆" }, answer: "B" },
    { id: "t3_interference_concept_2", question: "前摄干扰描述的是（ ）", options: { A: "先前学习影响后续学习或回忆", B: "新学习使旧记忆立刻消失", C: "图像比文字更容易记住", D: "情绪提高所有记忆表现" }, answer: "A" },
    { id: "t3_interference_phenomenon_1", question: "两组学习材料越相似，回忆时越容易混淆，主要是因为（ ）", options: { A: "相似信息之间更容易相互干扰", B: "相似材料完全不需要加工", C: "学习者会自动停止注意", D: "相似材料一定来自同一本书" }, answer: "A" },
    { id: "t3_interference_phenomenon_2", question: "要判断“后续相似材料”是否影响原材料回忆，应重点比较（ ）", options: { A: "两组学生喜欢的颜色", B: "两组使用的桌椅数量", C: "有无相似材料干扰时的回忆表现", D: "学生书写姓名的速度" }, answer: "C" },
    { id: "t3_interference_transfer_1", question: "复习容易混淆的两组概念时，较合理的安排是（ ）", options: { A: "把差异列出来，并适当间隔学习", B: "完全混在一起且不作区分", C: "只看概念名称，不看含义", D: "一边复习一边处理无关消息" }, answer: "A" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostInterferenceQuestions = Object.freeze(questions);
})(window);
