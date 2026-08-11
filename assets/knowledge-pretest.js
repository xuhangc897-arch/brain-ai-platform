(function (global) {
  "use strict";

  const questions = [
    { id: "t0_memory_concept_1", category: "memory", question: "短时记忆最主要的作用是（ ）", options: { A: "永久保存一生中发生的所有事情", B: "暂时保持当前需要处理的少量信息", C: "只保存带有强烈情绪的信息", D: "自动删除刚刚看到和听到的内容" }, answer: "B" },
    { id: "t0_memory_life_1", category: "memory", question: "小林需要短时间记住电话号码“13579862410”，下列做法更容易成功的是（ ）", options: { A: "把号码倒过来读一遍", B: "只盯着最后两个数字", C: "把号码分成“135-7986-2410”几段来记", D: "同时背诵另一串号码" }, answer: "C" },
    { id: "t0_memory_life_2", category: "memory", question: "老师一次布置了多项任务，小周怎样做更有利于准确记住？", options: { A: "边听边记录并把任务分成几项", B: "一边听一边和同桌讨论别的事情", C: "只记住老师最后说的一句话", D: "不做记录，等放学后再努力回想" }, answer: "A" },
    { id: "t0_memory_life_3", category: "memory", question: "小雨刚看完一串数字，准备立即复述时旁边突然有人大声说话。最可能出现的情况是（ ）", options: { A: "数字会自动进入长时记忆", B: "她能记住的数字一定更多", C: "声音不会产生任何影响", D: "注意受到干扰，复述可能更容易出错" }, answer: "D" },
    { id: "t0_memory_experiment_1", category: "memory", question: "某小组让同学分别记忆 4 位、6 位和 8 位数字，呈现时间和环境保持相同。通常可以预测（ ）", options: { A: "数字越长，正确率一定越高", B: "数字越长，完全正确复述的比例可能越低", C: "三种长度的正确率必然完全相同", D: "只要使用数字，长度就不会影响结果" }, answer: "B" },
    { id: "t0_nback_concept_1", category: "nback", question: "工作记忆是指人在完成任务时（ ）", options: { A: "暂时保持并加工当前需要的信息", B: "永久储存已经学会的全部知识", C: "只接收信息而不进行任何处理", D: "只在睡眠时整理情绪信息" }, answer: "A" },
    { id: "t0_nback_concept_2", category: "nback", question: "在 N-back 任务中，N 值增大通常意味着（ ）", options: { A: "不再需要比较前后信息", B: "每次只需记住当前出现的内容", C: "需要保持和更新的历史信息更多", D: "任务中的刺激数量一定减少" }, answer: "C" },
    { id: "t0_nback_life_1", category: "nback", question: "计算“（36＋18）÷6”时，需要暂时记住中间结果再继续运算，这主要依靠（ ）", options: { A: "感觉记忆", B: "工作记忆", C: "情绪记忆", D: "动作记忆" }, answer: "B" },
    { id: "t0_nback_life_2", category: "nback", question: "小陈一边解多步骤数学题，一边不断查看手机消息。这样做最可能（ ）", options: { A: "让中间条件保存得更牢固", B: "自动扩大他的记忆容量", C: "使解题步骤变得更简单", D: "分散注意，增加遗漏或混淆条件的可能" }, answer: "D" },
    { id: "t0_nback_experiment_1", category: "nback", question: "要公平比较 1-back 和 2-back 的表现，下列做法最合理的是（ ）", options: { A: "使用相同类型的材料和相同作答时间，只改变 N 值", B: "1-back 用数字，2-back 用复杂图形", C: "让两组在完全不同的环境中完成", D: "只记录最快的一次，不记录正确率" }, answer: "A" },
    { id: "t0_interference_concept_1", category: "interference", question: "后学习的内容影响了先前内容的回忆，这种现象称为（ ）", options: { A: "感觉适应", B: "选择性注意", C: "倒摄干扰", D: "记忆分组" }, answer: "C" },
    { id: "t0_interference_concept_2", category: "interference", question: "先前学过的内容干扰了新内容的学习或回忆，这种现象称为（ ）", options: { A: "倒摄干扰", B: "前摄干扰", C: "主动回忆", D: "信息可视化" }, answer: "B" },
    { id: "t0_interference_life_1", category: "interference", question: "小安连续学习两组拼写很相似的英语单词，测试时常把两组单词混在一起。最合理的解释是（ ）", options: { A: "相似材料会自动提高回忆率", B: "两组内容已经全部进入感觉记忆", C: "学习时间越接近，记忆一定越准确", D: "相似信息之间可能产生记忆干扰" }, answer: "D" },
    { id: "t0_interference_life_2", category: "interference", question: "复习两个容易混淆的历史事件时，下列做法更可能减少干扰的是（ ）", options: { A: "分别整理时间、人物和结果，再对比差异", B: "把两个事件的内容混在同一段中反复读", C: "只看相同点，不区分不同点", D: "同时播放无关视频来分散注意" }, answer: "A" },
    { id: "t0_interference_experiment_1", category: "interference", question: "两组同学先学习同一组词语，之后甲组学习一组相似词语，乙组安静休息。若甲组对原词语的回忆更差，较合理的解释是（ ）", options: { A: "安静休息使乙组临时扩大了智力水平", B: "甲组看到的第一组词语数量更少", C: "后学习的相似词语干扰了甲组对原词语的回忆", D: "只要学习新内容，旧内容就一定全部消失" }, answer: "C" },
    { id: "t0_strategies_concept_1", category: "strategies", question: "下列做法最符合“主动回忆”的是（ ）", options: { A: "一直看着答案重复朗读", B: "合上资料，尝试说出刚学过的要点", C: "把课本放在桌上但不阅读", D: "只在考试前快速浏览标题" }, answer: "B" },
    { id: "t0_strategies_life_1", category: "strategies", question: "学习包含许多因果关系的知识时，下列方法更有助于看清信息之间的联系的是（ ）", options: { A: "只记住每页的页码", B: "把所有句子连续抄写多遍", C: "打乱知识点的先后关系", D: "绘制概念图或流程图进行整理" }, answer: "D" },
    { id: "t0_strategies_life_2", category: "strategies", question: "小华想长期记住一组英语单词，下列做法更合理的是（ ）", options: { A: "多次尝试回忆，并把单词与图像或情境联系起来", B: "只在第一天连续抄写，之后不再复习", C: "每次只看中文意思，不尝试说出英文", D: "同时背几组高度相似的单词且不作区分" }, answer: "A" },
    { id: "t0_strategies_life_3", category: "strategies", question: "面对“记住诗句”和“理解科学概念之间的关系”两种任务，较合理的做法是（ ）", options: { A: "两种任务都只采用机械抄写", B: "无论任务是什么都使用同一种方法", C: "根据材料和目标选择复述、联想或结构整理等策略", D: "只选择花费时间最少的方法" }, answer: "C" },
    { id: "t0_strategies_experiment_1", category: "strategies", question: "两组同学用相同时间学习同一份材料，甲组反复抄写，乙组合上资料多次尝试回忆。之后乙组回忆得更好，这一结果更支持（ ）", options: { A: "抄写次数越多，任何材料都一定记得越牢", B: "主动提取信息可能比单纯重复抄写更有效", C: "学习策略与记忆效果没有关系", D: "乙组的学习材料一定比甲组简单" }, answer: "B" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));

  global.BrainKnowledgePretestQuestions = Object.freeze(questions);
})(window);
