(function (global, factory) {
  "use strict";

  const bank = factory();
  if (typeof module === "object" && module.exports) module.exports = bank;
  if (global) global.BrainKnowledgeQuestionBank = bank;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const questions = [
    { questionId: "memory_q1", experimentId: "memory", question: "本次实验主要探究的是（ ）", options: { A: "长时记忆容量", B: "工作记忆能力", C: "短时记忆容量", D: "情绪对记忆的影响" }, answer: "C" },
    { questionId: "memory_q2", experimentId: "memory", question: "实验中我们可以使用什么材料测量短时记忆容量？", options: { A: "图形", B: "汉字", C: "数字", D: "以上都可以" }, answer: "D" },
    { questionId: "memory_q3", experimentId: "memory", question: "随着数字长度不断增加，大多数人的正确率通常会（ ）", options: { A: "提高", B: "保持不变", C: "降低", D: "先升高再降低" }, answer: "C" },
    { questionId: "memory_q4", experimentId: "memory", question: "下列哪项最可能影响短时记忆实验结果？", options: { A: "是否专心", B: "数字呈现速度", C: "数字长度", D: "以上都有可能" }, answer: "D" },
    { questionId: "memory_q5", experimentId: "memory", question: "为了保证实验公平，下列哪项最好保持一致？", options: { A: "测试方式", B: "数字呈现时间", C: "实验环境", D: "以上都要" }, answer: "D" },
    { questionId: "memory_q6", experimentId: "memory", question: "本次实验结论主要依据什么得出？", options: { A: "老师讲解", B: "同学猜测", C: "实验数据", D: "网络资料" }, answer: "C" },
    { questionId: "memory_q7", experimentId: "memory", question: "如果连续两次实验结果差别很大，下列哪项最值得先检查？", options: { A: "是否认真完成实验", B: "是否记录准确", C: "是否受到干扰", D: "以上都有可能" }, answer: "D" },
    { questionId: "memory_q8", experimentId: "memory", question: "为了让实验结果更加可靠，可以怎样做？", options: { A: "增加测试次数", B: "增加参与人数", C: "比较多次结果", D: "以上都可以" }, answer: "D" },
    { questionId: "memory_q9", experimentId: "memory", question: "如果要记住一串较长的电话号码，下面哪种方法更符合今天实验得到的启示？", options: { A: "一次全部记住", B: "分成几段分别记忆", C: "只看一遍", D: "闭眼等待" }, answer: "B" },
    { questionId: "memory_q10", experimentId: "memory", question: "如果老师一次说了很多内容，你应该怎样做更容易记住？", options: { A: "全部硬记", B: "边听边整理重点", C: "什么也不记", D: "等别人告诉自己" }, answer: "B" },

    { questionId: "nback_q1", experimentId: "nback", question: "本次实验主要探究的是（ ）", options: { A: "长时记忆", B: "工作记忆", C: "情绪记忆", D: "机械记忆" }, answer: "B" },
    { questionId: "nback_q2", experimentId: "nback", question: "在 N-back 任务中，N 值越高通常表示（ ）", options: { A: "任务越简单", B: "材料越少", C: "需要记住和更新的信息越多", D: "不需要注意力" }, answer: "C" },
    { questionId: "nback_q3", experimentId: "nback", question: "工作记忆在学习中的主要作用是（ ）", options: { A: "永久保存所有信息", B: "暂时保持并加工信息", C: "只记录情绪", D: "只负责睡眠" }, answer: "B" },
    { questionId: "nback_q4", experimentId: "nback", question: "为什么 2-back 通常比 1-back 更难？", options: { A: "图片更多", B: "需要同时记住更早的信息并不断更新", C: "测试时间一定更长", D: "答案是固定的" }, answer: "B" },
    { questionId: "nback_q5", experimentId: "nback", question: "完成 N-back 任务时，哪项最重要？", options: { A: "保持注意力", B: "随便猜测", C: "看别人答案", D: "只记最后一个刺激" }, answer: "A" },
    { questionId: "nback_q6", experimentId: "nback", question: "随着 N 值增大，正确率通常会（ ）", options: { A: "提高", B: "下降", C: "保持不变", D: "一定满分" }, answer: "B" },
    { questionId: "nback_q7", experimentId: "nback", question: "如果实验时注意力分散，最可能导致（ ）", options: { A: "正确率降低", B: "成绩更稳定", C: "反应更快且更正确", D: "完全没有影响" }, answer: "A" },
    { questionId: "nback_q8", experimentId: "nback", question: "为了提高实验结果可信度，可以怎样做？", options: { A: "多次测试", B: "认真记录数据", C: "控制材料和环境", D: "以上都可以" }, answer: "D" },
    { questionId: "nback_q9", experimentId: "nback", question: "做数学题时，需要暂时记住条件并进行计算，主要依靠（ ）", options: { A: "长时记忆", B: "工作记忆", C: "感觉记忆", D: "情绪记忆" }, answer: "B" },
    { questionId: "nback_q10", experimentId: "nback", question: "做作业时手机消息不断弹出，最可能会（ ）", options: { A: "提高工作记忆表现", B: "干扰注意力和工作记忆", C: "让任务更简单", D: "没有任何影响" }, answer: "B" },

    { questionId: "interference_q1", experimentId: "interference", question: "本次实验主要探究的是（ ）", options: { A: "短时记忆容量", B: "影响长时记忆的干扰因素", C: "工作记忆训练", D: "海报设计方法" }, answer: "B" },
    { questionId: "interference_q2", experimentId: "interference", question: "倒摄干扰指的是（ ）", options: { A: "后学习的材料影响先前材料的回忆", B: "先学习的材料影响后学习材料", C: "情绪不会影响记忆", D: "复述一定提高成绩" }, answer: "A" },
    { questionId: "interference_q3", experimentId: "interference", question: "前摄干扰指的是（ ）", options: { A: "新材料影响旧材料", B: "先前学习影响后续学习或回忆", C: "数字越长越难记", D: "音乐一定提高记忆" }, answer: "B" },
    { questionId: "interference_q4", experimentId: "interference", question: "材料相似性较高时，长时记忆回忆通常更容易（ ）", options: { A: "受到干扰", B: "完全准确", C: "没有变化", D: "不需要复习" }, answer: "A" },
    { questionId: "interference_q5", experimentId: "interference", question: "哪些因素可能影响长时记忆效果？", options: { A: "材料相似性", B: "情绪状态", C: "干扰任务", D: "以上都可能" }, answer: "D" },
    { questionId: "interference_q6", experimentId: "interference", question: "判断某个因素是否影响记忆，应主要依据（ ）", options: { A: "实验数据", B: "个人感觉", C: "同学猜测", D: "答案顺序" }, answer: "A" },
    { questionId: "interference_q7", experimentId: "interference", question: "为了公平比较不同条件，应尽量控制（ ）", options: { A: "无关变量", B: "只改变记录表", C: "只改变学生编号", D: "不记录时间" }, answer: "A" },
    { questionId: "interference_q8", experimentId: "interference", question: "为了提高结论可靠性，可以怎样做？", options: { A: "进行多轮实验", B: "增加参与人数", C: "认真记录数据", D: "以上都可以" }, answer: "D" },
    { questionId: "interference_q9", experimentId: "interference", question: "学习新内容后立刻接触相似材料，可能会（ ）", options: { A: "减少干扰", B: "影响原来内容的回忆", C: "保证满分", D: "提升所有记忆" }, answer: "B" },
    { questionId: "interference_q10", experimentId: "interference", question: "复习时把相似知识分开整理，可能有助于（ ）", options: { A: "增加混淆", B: "减少干扰", C: "取消实验", D: "降低理解" }, answer: "B" },

    { questionId: "strategies_q1", experimentId: "strategies", question: "本次实验主要探究的是（ ）", options: { A: "改善长时记忆的策略", B: "短时记忆容量", C: "情绪对记忆的影响", D: "睡眠时间" }, answer: "A" },
    { questionId: "strategies_q2", experimentId: "strategies", question: "主动回忆策略强调（ ）", options: { A: "不看答案先尝试回想", B: "只重复抄写", C: "等待别人提示", D: "跳过复习" }, answer: "A" },
    { questionId: "strategies_q3", experimentId: "strategies", question: "信息可视化策略可以帮助我们（ ）", options: { A: "把信息转化为图像或结构", B: "忘记材料", C: "增加干扰", D: "减少理解" }, answer: "A" },
    { questionId: "strategies_q4", experimentId: "strategies", question: "选择记忆策略时，应该考虑（ ）", options: { A: "学习任务特点", B: "只选最简单的", C: "不看材料", D: "随意选择" }, answer: "A" },
    { questionId: "strategies_q5", experimentId: "strategies", question: "比较不同策略效果时，主要依据（ ）", options: { A: "实验记录和回忆结果", B: "个人喜好", C: "同学声音", D: "海报颜色" }, answer: "A" },
    { questionId: "strategies_q6", experimentId: "strategies", question: "为了让策略比较更公平，应尽量（ ）", options: { A: "控制材料难度和测试方式", B: "随意更换材料", C: "只测一次", D: "不记录结果" }, answer: "A" },
    { questionId: "strategies_q7", experimentId: "strategies", question: "如果某种策略在实验中效果更好，说明它（ ）", options: { A: "可能更适合当前任务", B: "永远适合所有人", C: "不需要练习", D: "没有价值" }, answer: "A" },
    { questionId: "strategies_q8", experimentId: "strategies", question: "面对需要理解关系的知识，哪种做法更合适？", options: { A: "只看一遍", B: "建立联系并整理结构", C: "完全不复习", D: "只记页码" }, answer: "B" },
    { questionId: "strategies_q9", experimentId: "strategies", question: "学习外语单词时，合理策略可能是（ ）", options: { A: "主动回忆并结合联想", B: "只等考试", C: "完全不出声", D: "只看封面" }, answer: "A" },
    { questionId: "strategies_q10", experimentId: "strategies", question: "本次探究给我们的启示是（ ）", options: { A: "根据任务选择合适记忆策略", B: "所有策略都没用", C: "只靠天赋", D: "不需要数据" }, answer: "A" }
  ].map((item) => Object.freeze({
    ...item,
    options: Object.freeze({ ...item.options })
  }));

  const frozenQuestions = Object.freeze(questions);

  function getExperimentQuestions(experimentId) {
    return frozenQuestions.filter((item) => item.experimentId === String(experimentId || ""));
  }

  function scoreAnswers(answers) {
    const source = answers && typeof answers === "object" ? answers : {};
    const byExperiment = {};

    frozenQuestions.forEach((item) => {
      if (!byExperiment[item.experimentId]) {
        byExperiment[item.experimentId] = { correctCount: 0, totalCount: 0, score: 0 };
      }
      const summary = byExperiment[item.experimentId];
      summary.totalCount += 1;
      if (String(source[item.questionId] || "") === item.answer) summary.correctCount += 1;
    });

    Object.values(byExperiment).forEach((summary) => {
      summary.score = summary.totalCount
        ? Math.round((summary.correctCount / summary.totalCount) * 100)
        : 0;
    });
    return byExperiment;
  }

  return Object.freeze({
    version: 1,
    questions: frozenQuestions,
    getExperimentQuestions,
    scoreAnswers
  });
});
