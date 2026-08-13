(function (global) {
  "use strict";

  const questions = [
    { id: "t0_memory_concept_1", category: "memory", question: "短时记忆最主要的作用是（ ）", options: { A: "把重要信息长期保存，供以后提取", B: "暂时保持当前任务需要的少量信息", C: "从环境中快速筛选值得注意的信息", D: "把零散知识整理成有意义的结构" }, answer: "B" },
    { id: "t0_memory_life_1", category: "memory", question: "小林需要短时间记住电话号码“13579862410”，下列做法更容易成功的是（ ）", options: { A: "按原顺序快速多读几遍，不作停顿", B: "先记开头和结尾，再补中间数字", C: "把号码分成“135-7986-2410”几段来记", D: "给每个数字配一个熟悉物品再逐个联想" }, answer: "C" },
    { id: "t0_memory_life_2", category: "memory", question: "老师口头布置了四项任务，小周怎样做更有利于准确记住？", options: { A: "按任务顺序记录关键词，听完后再核对", B: "反复默念最后一项，完成后再回想前面内容", C: "先理解每项任务的意义，不记录具体要求", D: "把四项任务连成一句话，只记大致内容" }, answer: "A" },
    { id: "t0_memory_life_3", category: "memory", question: "小雨刚看完一串数字，准备立即复述时旁边有人大声说话。她复述出错，较合理的解释是（ ）", options: { A: "声音改变了数字原有的排列顺序", B: "她把数字理解得不够深入，因而无法长期保存", C: "数字本身缺少意义，所以不能被短时间保持", D: "声音分散了注意，使正在保持的信息受到干扰" }, answer: "D" },
    { id: "t0_memory_experiment_1", category: "memory", question: "某小组让同学分别记忆4位、6位和8位数字，每种长度测试10次，平均整串正确次数为9次、7次和4次。下列解释最合理的是（ ）", options: { A: "练习次数增加使后面的8位数字更难", B: "序列变长后，需要同时保持的信息更多", C: "4位数字比8位数字更容易进入长时记忆", D: "数字位数改变了同学对数字含义的理解" }, answer: "B" },

    { id: "t0_nback_concept_1", category: "nback", question: "做多步骤心算时，既要记住中间结果，又要继续运算。这主要体现工作记忆能够（ ）", options: { A: "暂时保持信息并同时进行加工", B: "把计算方法转化为熟练的动作程序", C: "从长期积累的知识中提取运算规则", D: "优先注意题目中最醒目的数字" }, answer: "A" },
    { id: "t0_nback_concept_2", category: "nback", question: "阅读较长段落时，小文读到结尾才能理解开头一句的含义。这最需要他（ ）", options: { A: "记住每个字在页面上的具体位置", B: "把段落内容逐句转为长期记忆", C: "根据关键词猜测后文而不再检查", D: "暂时保持前文，并与后文联系起来" }, answer: "D" },
    { id: "t0_nback_life_1", category: "nback", question: "小陈听到指令：“拿出作业本，翻到第12页，完成第3题后交到前面。”下列做法最能减轻当前信息处理负担的是（ ）", options: { A: "先执行自己最熟悉的一步，再回想其他要求", B: "反复默念整句话，同时观察同学如何行动", C: "记下“本子—12页—3题—上交”等关键词", D: "先理解老师布置任务的目的，再开始行动" }, answer: "C" },
    { id: "t0_nback_life_2", category: "nback", question: "同一名学生分别完成两项任务：甲只需口算一道两步题，乙要边口算边记住三个条件。乙的错误更多，较合理的解释是（ ）", options: { A: "乙需要同时保持和处理的信息更多", B: "乙出现了更多数字，所以计算规则发生改变", C: "甲的题目更容易引起注意，因此记得更久", D: "甲只使用短时记忆，乙只使用长时记忆" }, answer: "A" },
    { id: "t0_nback_experiment_1", category: "nback", question: "小组比较“边听通知边回复消息”和“只听通知”两种情况下遗漏要点的数量。要更公平地比较，两种情况下还应保持相同的是（ ）", options: { A: "通知主题和回复消息的内容", B: "参与者人数和每人的手机型号", C: "通知长度和参与者原有分组", D: "通知内容、播放速度和测试环境" }, answer: "D" },

    { id: "t0_interference_concept_1", category: "interference", question: "小明先记住旧密码，后来设置新密码；一段时间后，新密码使他更难想起旧密码。这种现象更符合（ ）", options: { A: "旧信息促进新信息的学习", B: "旧信息干扰新信息的提取", C: "新信息干扰旧信息的回忆", D: "新旧信息被组合成一个记忆" }, answer: "C" },
    { id: "t0_interference_concept_2", category: "interference", question: "转学后，小琪填写新班级时总先写出原来的班级。较合理的解释是（ ）", options: { A: "新班级信息干扰了旧班级信息", B: "旧班级信息干扰了新班级信息", C: "两个班级信息都没有被注意到", D: "新班级信息已经取代了旧信息" }, answer: "B" },
    { id: "t0_interference_life_1", category: "interference", question: "小安连续学习两组拼写相似的英语单词，测试时常把两组单词混在一起。最合理的解释是（ ）", options: { A: "两组单词的共同部分形成了记忆线索", B: "连续学习使第二组单词练习得更充分", C: "第一组单词占用了更多注意时间", D: "相似信息的线索重叠，回忆时容易相互干扰" }, answer: "D" },
    { id: "t0_interference_life_2", category: "interference", question: "复习两个容易混淆的历史事件时，下列做法更可能减少干扰的是（ ）", options: { A: "按时间、人物和结果列成对照表", B: "先连续朗读两个事件，再分别抄写一遍", C: "把共同点合并记忆，差异留到考前复习", D: "交替阅读两段材料，保持相同学习速度" }, answer: "A" },
    { id: "t0_interference_experiment_1", category: "interference", question: "两组同学先学习同一组词，之后甲组学习相似词，乙组学习不相似词。原词回忆正确率分别为55%和78%。较合理的推断是（ ）", options: { A: "乙组学习的新词数量可能比甲组少", B: "不相似词提高了乙组对原词的理解", C: "相似的新词对原词回忆产生了更强干扰", D: "甲组对原词的最初学习时间可能更短" }, answer: "C" },

    { id: "t0_strategies_concept_1", category: "strategies", question: "下列做法最符合“主动回忆”的是（ ）", options: { A: "看着每句开头复述后半句，再对照原文", B: "合上资料，尝试说出要点后检查遗漏", C: "边看提纲边把重点内容完整讲述一遍", D: "先抄写关键词，再根据课文补充内容" }, answer: "B" },
    { id: "t0_strategies_life_1", category: "strategies", question: "学习包含许多因果关系的知识时，下列方法更有助于看清信息之间的联系的是（ ）", options: { A: "按课本顺序给每个知识点编号", B: "用不同颜色标出原因和结果的句子", C: "把每段内容压缩成一句话分别记忆", D: "绘制带有箭头和层级的概念图" }, answer: "D" },
    { id: "t0_strategies_life_2", category: "strategies", question: "小华想较长时间记住一组英语单词，下列安排更合理的是（ ）", options: { A: "分几天练习回忆，并把单词用于句子中", B: "第一天集中抄写较多遍，第二天统一检测", C: "每天重新阅读单词表，重点看不熟悉的词", D: "按字母顺序分组，每组连续朗读几遍" }, answer: "A" },
    { id: "t0_strategies_life_3", category: "strategies", question: "面对“准确背诵诗句”和“理解科学概念关系”两种任务，较合理的做法是（ ）", options: { A: "两种任务都先抄写，再反复朗读", B: "诗句画概念图，科学概念按原文背诵", C: "根据任务分别选择复述和结构整理策略", D: "先选自己最熟悉的策略，再增加练习时间" }, answer: "C" },
    { id: "t0_strategies_experiment_1", category: "strategies", question: "甲、乙两组用相同时间学习同一材料。甲组重读4遍，乙组阅读1遍后进行3次回忆练习；测试正确率分别为68%和82%。该结果更支持（ ）", options: { A: "阅读次数减少是乙组成绩较高的原因", B: "在这些条件下，回忆练习比单纯重读更有效", C: "乙组使用的材料比甲组更容易理解", D: "只要加入测试，学习时间就可以缩短" }, answer: "B" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));

  global.BrainKnowledgePretestQuestions = Object.freeze(questions);
})(window);
