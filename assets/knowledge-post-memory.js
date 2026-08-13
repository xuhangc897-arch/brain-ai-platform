(function (global) {
  "use strict";
  const questions = [
    { id: "t1_memory_concept_1", question: "关于短时记忆容量，下列说法较准确的是（ ）", options: { A: "同时保持的项目有限，但可借助组织方式提高利用效率", B: "容量主要由材料呈现速度决定，与组织方式关系较小", C: "容量会随练习次数增加，因此同一任务中可持续扩大", D: "能保持的项目数较稳定，所以材料意义不会影响表现" }, answer: "A" },
    { id: "t1_memory_concept_2", question: "把“20260813”记成“2026—08—13”，这种分组主要改变了（ ）", options: { A: "数字进入记忆时的呈现时间", B: "每个数字本身包含的信息量", C: "需要分别保持的信息单位数量", D: "数字被回忆时的先后顺序" }, answer: "C" },
    { id: "t1_memory_phenomenon_1", question: "某同学记忆5位、7位、9位数字各10次，完全正确次数为9、6、3次。下列解释最合适的是（ ）", options: { A: "后测项目练习机会较少，所以成绩逐渐下降", B: "数字越长，数字之间的相似程度越高", C: "9位数字的呈现速度可能比5位更快", D: "序列增长使短时记忆负担逐步增加" }, answer: "D" },
    { id: "t1_memory_phenomenon_2", question: "同一参与者两次测得的记忆长度分别为6位和9位。首先应检查（ ）", options: { A: "两次数字中奇数和偶数的比例", B: "呈现速度、环境和注意状态是否一致", C: "参与者是否更喜欢第二组数字", D: "两次记录表的书写空间是否相同" }, answer: "B" },
    { id: "t1_memory_transfer_1", question: "老师连续说明六个实验步骤时，下列做法最有助于准确执行的是（ ）", options: { A: "按操作阶段分组，并记录每组关键词", B: "先记住开头和结尾，再观察同学补全中间步骤", C: "把每一步完整默念，等说明结束后开始操作", D: "先理解实验目的，再按自己的顺序安排步骤" }, answer: "A" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostMemoryQuestions = Object.freeze(questions);
})(window);
