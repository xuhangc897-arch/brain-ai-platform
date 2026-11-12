(function (global) {
  "use strict";

  const questions = [
    { id: "t5_memory_concept_1", category: "memory", question: "看完一张临时取件码后，小宁走到柜台立即报出号码。这里主要用到短时记忆的哪种作用？", options: { A: "把取件经历长期保存以便下次回想", B: "从周围信息中选出最醒目的提示", C: "暂时保留眼前任务需要的少量信息", D: "将取件步骤整理成稳定的知识结构" }, answer: "C" },
    { id: "t5_memory_life_1", category: "memory", question: "要在几秒内记住一串数字“4629183756”，下列方法较可能帮助准确复述的是（ ）", options: { A: "按“462-918-3756”分段记忆", B: "只重复最前面的三位数", C: "逐个数字反复读，始终不分组", D: "先猜这串数字可能代表什么" }, answer: "A" },
    { id: "t5_memory_life_2", category: "memory", question: "老师连续说了四项实验准备要求，小岚担心漏掉其中一步。怎样做更稳妥？", options: { A: "先记住最后一项，其他要求随后向同学询问", B: "只记每项要求的共同目的，不记具体动作", C: "听到熟悉的要求就先做，剩下的再回想", D: "按顺序写下关键词，听完再核对四项要求" }, answer: "D" },
    { id: "t5_memory_life_3", category: "memory", question: "小哲刚看完六位验证码，正要输入时被人连续提问，结果输错了。较合理的解释是（ ）", options: { A: "验证码被提问者改变了原有的数字顺序", B: "提问占用了注意，使临时保持的数字受到干扰", C: "验证码没有意义，因此无法形成任何记忆", D: "他没有理解数字含义，所以不能长期保存" }, answer: "B" },
    { id: "t5_memory_experiment_1", category: "memory", question: "某班分别呈现3位、5位、7位数字序列，各测10次，整串复述正确的平均次数依次为10次、8次、5次。最合适的解释是（ ）", options: { A: "较长序列的呈现速度可能更快", B: "数字越长，学生越难看清每个数字", C: "序列增长使同时需要保持的信息增多", D: "正确次数下降证明数字已进入长时记忆" }, answer: "C" },

    { id: "t5_nback_concept_1", category: "nback", question: "按地图规划路线时，小羽要记住刚经过的路口，同时决定下一步转向。这主要体现工作记忆能够（ ）", options: { A: "把行走动作变成较熟练的习惯", B: "暂时保持路线信息并对它进行加工", C: "优先注意地图上最醒目的地标", D: "从以往经验中提取熟悉的路线" }, answer: "B" },
    { id: "t5_nback_concept_2", category: "nback", question: "读到故事结尾时，小乐才明白开头提到的“那封信”是谁寄的。这需要他（ ）", options: { A: "记住每句话在书页上的具体位置", B: "把开头的每个字都背诵下来", C: "只根据结尾一句猜测整篇故事", D: "暂时保留前面的线索并结合后文理解" }, answer: "D" },
    { id: "t5_nback_life_1", category: "nback", question: "活动负责人一次交代了“取材料、核对编号、分发到各组、登记剩余数量”四步。哪种做法最能减轻当前信息处理负担？", options: { A: "把四步缩写在纸上，执行时逐项核对", B: "反复默念最后一步，并先完成它", C: "先观察别人怎么做，再凭印象执行", D: "记住活动目的，具体步骤临时决定" }, answer: "A" },
    { id: "t5_nback_life_2", category: "nback", question: "同一名学生做两次口头计算：甲只计算一道两步题；乙计算同样的题时还须记住三个额外条件。乙错得更多，较合理的解释是（ ）", options: { A: "额外条件使计算规则自动改变", B: "甲只依靠长期记忆，乙只依靠感觉记忆", C: "乙必须同时保持和处理更多信息", D: "乙做题较晚，因此一定已经疲劳" }, answer: "C" },
    { id: "t5_nback_experiment_1", category: "nback", question: "研究“边阅读说明边回复消息”是否增加遗漏时，另一条件是“只阅读说明”。为了公平比较，两种条件下应保持相同的是（ ）", options: { A: "回复消息的字数和手机品牌", B: "说明内容、呈现时间和测试环境", C: "阅读者最喜欢的消息类型", D: "阅读后各自选择的复习方式" }, answer: "B" },

    { id: "t5_interference_concept_1", category: "interference", question: "小佳先学会旧门锁密码，换了新密码后，回忆旧密码反而常想起新密码。这更符合（ ）", options: { A: "旧密码促进了新密码的记忆", B: "旧密码妨碍新密码的提取", C: "两个密码被合并成同一个记忆", D: "新密码干扰了旧密码的回忆" }, answer: "D" },
    { id: "t5_interference_concept_2", category: "interference", question: "公交线路改道后，小康去新站点时仍常先走向以前的站点。较合理的解释是（ ）", options: { A: "新路线阻碍了旧路线的形成", B: "两条路线都未被他注意到", C: "旧路线干扰了新路线的使用", D: "新路线已经完全取代旧路线" }, answer: "C" },
    { id: "t5_interference_life_1", category: "interference", question: "小组连续学习两组名称很相近的植物，测验时常把它们的特征配错。最合理的解释是（ ）", options: { A: "两组植物的相似处让第二组学得更快", B: "相似名称和特征的线索重叠，提取时容易混淆", C: "先学的一组必然比后学的一组记得更牢", D: "连续学习使两组植物的实际特征发生变化" }, answer: "B" },
    { id: "t5_interference_life_2", category: "interference", question: "复习两个名称相近、特点不同的科学概念时，哪种方法更可能减少混淆？", options: { A: "按定义、适用条件和例子制作对照表", B: "把两段定义连在一起反复朗读", C: "先只记相同之处，考前再看差异", D: "交替抄写两段定义，不标出区别" }, answer: "A" },
    { id: "t5_interference_experiment_1", category: "interference", question: "两组学生先以相同时间记住同一批图形。之后甲组学习相似图形，乙组学习不同图形；原图形的回忆正确率分别为58%和80%。更有依据的推断是（ ）", options: { A: "甲组最初记住的原图形可能比乙组少", B: "不同的新图形促进了乙组对原图形的理解", C: "两组正确率差异主要来自原图形的学习时间", D: "相似的新图形对原图形回忆造成了更强干扰" }, answer: "D" },

    { id: "t5_strategies_concept_1", category: "strategies", question: "复习地理概念时，下列做法最符合“主动回忆”的是（ ）", options: { A: "合上笔记说出要点，再打开笔记检查遗漏", B: "看着笔记逐句朗读，读完后换页", C: "边看关键词边照原句写出定义", D: "把课本中的重点句子再抄写一遍" }, answer: "A" },
    { id: "t5_strategies_life_1", category: "strategies", question: "学习生态系统中多种因素的因果关系时，哪种方法更有助于看清它们之间的联系？", options: { A: "分别用两种颜色标出原因和结果的句子", B: "画出带箭头和层级的关系图", C: "把每个因素分别概括成一句话来记忆", D: "按课本出现的顺序给每个因素编号" }, answer: "B" },
    { id: "t5_strategies_life_2", category: "strategies", question: "小涵希望几周后仍能记住一批历史事件。下列安排更合理的是（ ）", options: { A: "第一天集中抄写多遍，最后一天再检测", B: "每天重新阅读事件列表，重点看不熟悉的", C: "分几天尝试回忆，并用事件解释相关现象", D: "按发生年代分组，每组连续朗读几遍" }, answer: "C" },
    { id: "t5_strategies_life_3", category: "strategies", question: "一项任务要求准确说出操作口令，另一项要求理解几个科学概念的关系。怎样选择记忆方法更合适？", options: { A: "两项都只用抄写，以免方法不同", B: "口令只画关系图，概念只逐字背诵", C: "先选自己熟悉的方法，再决定任务目标", D: "分别采用复述练习和结构整理" }, answer: "D" },
    { id: "t5_strategies_experiment_1", category: "strategies", question: "两组用相同时间学习同一材料。甲组重复阅读3次，乙组阅读1次后做2次闭卷回忆；测验正确率分别为64%和79%。这组结果更支持（ ）", options: { A: "在这些条件下，闭卷回忆练习比单纯重读更有效", B: "乙组成绩较高只是因为阅读次数较少", C: "乙组学到的材料比甲组简单", D: "只要安排测验，就无需控制学习时间" }, answer: "A" }
  ].map((item) => Object.freeze({ ...item, options: Object.freeze({ ...item.options }) }));

  global.BrainKnowledgePosttestQuestions = Object.freeze(questions);
})(window);
