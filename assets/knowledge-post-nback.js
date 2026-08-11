(function (global) {
  "use strict";
  const questions = [
    { id: "t2_nback_concept_1", question: "工作记忆的核心特点是（ ）", options: { A: "只负责永久储存", B: "暂时保持信息并对其进行加工", C: "不需要注意参与", D: "只能处理图像" }, answer: "B" },
    { id: "t2_nback_concept_2", question: "完成 N-back 任务时，需要不断进行的是（ ）", options: { A: "忽略刚出现的所有刺激", B: "只记住第一个刺激", C: "保持并更新最近出现的信息", D: "把每个刺激写成长时日记" }, answer: "C" },
    { id: "t2_nback_phenomenon_1", question: "一名同学从 1-back 进入 3-back 后正确率下降，较合理的解释是（ ）", options: { A: "需要保持和更新的信息增加，工作记忆负担变大", B: "3-back 不需要比较历史信息", C: "N 值越大，任务材料一定越少", D: "正确率下降只能说明设备损坏" }, answer: "A" },
    { id: "t2_nback_phenomenon_2", question: "完成连续判断任务时，如果注意频繁转向周围声音，最可能出现（ ）", options: { A: "更新信息更准确", B: "漏答或错误判断增加", C: "工作记忆容量自动扩大", D: "所有反应时间完全相同" }, answer: "B" },
    { id: "t2_nback_transfer_1", question: "阅读一道包含多个条件的应用题时，为减轻工作记忆负担，可以（ ）", options: { A: "同时打开多个聊天窗口", B: "跳过所有中间条件", C: "圈出关键条件并分步骤计算", D: "只凭第一印象写答案" }, answer: "C" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));
  global.BrainKnowledgePostNbackQuestions = Object.freeze(questions);
})(window);
