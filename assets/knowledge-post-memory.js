(function (global) {
  "use strict";
  const questions = [
    { id: "t1_memory_concept_1", question: "人的短时记忆容量通常表现为（ ）", options: { A: "能同时保持的信息数量有限", B: "可以无限保存所有新信息", C: "只受材料颜色影响", D: "与注意状态完全无关" }, answer: "A" },
    { id: "t1_memory_concept_2", question: "把多个零散项目组织成较大的有意义单位，这种做法有助于（ ）", options: { A: "增加无关干扰", B: "取消对信息的加工", C: "更有效地利用有限的短时记忆容量", D: "让所有信息永久不会遗忘" }, answer: "C" },
    { id: "t1_memory_phenomenon_1", question: "同一名同学在数字长度从 5 位增加到 9 位后，正确复述次数减少。较合理的解释是（ ）", options: { A: "较长序列占用了更多短时记忆容量", B: "数字越多，视觉就一定越模糊", C: "该同学完全没有使用长时记忆", D: "9 位数字一定比 5 位数字呈现得更快" }, answer: "A" },
    { id: "t1_memory_phenomenon_2", question: "同一名参与者两次测得的记忆长度差异很大，首先应检查（ ）", options: { A: "是否更换了记录表的颜色", B: "呈现速度、注意状态和环境是否一致", C: "参与者是否喜欢数学", D: "数字中是否出现了偶数" }, answer: "B" },
    { id: "t1_memory_transfer_1", question: "为了记住老师口头说明的多个步骤，下列做法更合适的是（ ）", options: { A: "把步骤分组并记录关键词", B: "同时处理另一项复杂任务", C: "只记最后一步", D: "等信息全部忘记后再询问" }, answer: "A" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostMemoryQuestions = Object.freeze(questions);
})(window);
