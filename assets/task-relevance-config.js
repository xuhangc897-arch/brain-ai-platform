(function (global) {
  "use strict";

  const TASKS = Object.freeze([
    {
      experimentId: "memory", stageId: "question", taskId: "question",
      taskTitle: "研究问题", taskInstruction: "写下你自己真正想探究的问题",
      activityTopic: "探究短时记忆的容量", referenceConcepts: ["短时记忆", "记忆容量", "数字材料"], minimumLength: 10
    },
    {
      experimentId: "memory", stageId: "hypothesis", taskId: "hypothesis",
      taskTitle: "研究假设", taskInstruction: "请填写你自己的研究假设",
      activityTopic: "探究短时记忆的容量", referenceConcepts: ["研究假设", "短时记忆", "记忆容量"], minimumLength: 10
    },
    {
      experimentId: "memory", stageId: "analysis", taskId: "brainFinding",
      taskTitle: "结果图与脑活动记录",
      taskInstruction: "请询问在你进行实验时观察头环的同学，并记录头环观察结果：颜色主要是红/黄/蓝中的哪一种？颜色是否随着任务难度或材料长度变化？前额叶区域是否出现更明显的暖色？哪一次任务中颜色变化最明显？",
      activityTopic: "探究短时记忆的容量", referenceConcepts: ["头环", "颜色", "任务难度", "材料长度", "前额叶"], minimumLength: 10
    },
    {
      experimentId: "memory", stageId: "conclusion", taskId: "finalConclusion",
      taskTitle: "最终结论", taskInstruction: "结合实验数据、假设和米勒理论写出自己的最终结论",
      activityTopic: "探究短时记忆的容量", referenceConcepts: ["实验数据", "研究假设", "米勒理论", "短时记忆容量"], minimumLength: 10
    },
    {
      experimentId: "memory", stageId: "reflection", taskId: "designImprove",
      taskTitle: "实验设计有哪些地方可以进一步完善？",
      taskInstruction: "可以从数字材料的长度设置、呈现方式、记录过程、测试次数、是否容易受到注意力影响等方面思考。",
      activityTopic: "探究短时记忆的容量", referenceConcepts: ["实验设计", "数字材料", "呈现方式", "测试次数", "注意力"], minimumLength: 10
    },
    {
      experimentId: "memory", stageId: "reflection", taskId: "teamwork",
      taskTitle: "合作过程是否高效？有哪些需要改进？",
      taskInstruction: "可以从分工是否清楚、记录是否及时、讨论是否充分、遇到分歧时如何解决等方面思考。",
      activityTopic: "探究短时记忆的容量", referenceConcepts: ["合作", "分工", "记录", "讨论", "分歧"], minimumLength: 10
    },
    {
      experimentId: "memory", stageId: "reflection", taskId: "inquiryReflection",
      taskTitle: "科学探究各环节中哪些表现较好？哪些还需要提高？",
      taskInstruction: "可以从提出问题、作出假设、制定计划、搜集证据、处理数据、得出结论和表达交流等环节回顾自己的表现。",
      activityTopic: "探究短时记忆的容量", referenceConcepts: ["科学探究", "提出问题", "作出假设", "处理数据", "得出结论"], minimumLength: 10
    },
    {
      experimentId: "nback", stageId: "question", taskId: "researchQuestion",
      taskTitle: "研究问题", taskInstruction: "写下你自己真正想探究的问题",
      activityTopic: "探究工作记忆与 N-back 任务", referenceConcepts: ["N-back", "工作记忆", "任务难度", "正确率"], minimumLength: 10
    },
    {
      experimentId: "nback", stageId: "hypothesis", taskId: "hypothesis",
      taskTitle: "研究假设", taskInstruction: "请填写你自己的研究假设",
      activityTopic: "探究工作记忆与 N-back 任务", referenceConcepts: ["研究假设", "N-back", "工作记忆", "任务难度"], minimumLength: 10
    },
    {
      experimentId: "nback", stageId: "analysis", taskId: "headbandObservation",
      taskTitle: "头环观察记录",
      taskInstruction: "请询问在你进行实验时观察头环的同学，并记录头环观察结果：不同 N-back 难度下头环颜色有什么变化？是否出现红色或黄色区域增多？哪种条件下前额叶区域激活更明显？",
      activityTopic: "探究工作记忆与 N-back 任务", referenceConcepts: ["N-back", "头环", "难度", "颜色", "前额叶"], minimumLength: 10
    },
    {
      experimentId: "nback", stageId: "conclusion", taskId: "conclusion",
      taskTitle: "结论", taskInstruction: "根据结果写出你自己的结论",
      activityTopic: "探究工作记忆与 N-back 任务", referenceConcepts: ["实验结果", "N-back", "工作记忆", "正确率"], minimumLength: 10
    },
    {
      experimentId: "nback", stageId: "reflection", taskId: "improvement",
      taskTitle: "实验设计有什么可以改进？",
      taskInstruction: "可以从任务难度设置、练习时间、测试次数、材料呈现速度、参与者状态和注意力控制等方面思考。",
      activityTopic: "探究工作记忆与 N-back 任务", referenceConcepts: ["实验设计", "任务难度", "测试次数", "呈现速度", "注意力"], minimumLength: 10
    },
    {
      experimentId: "nback", stageId: "reflection", taskId: "persuasiveness",
      taskTitle: "如何提高结果的说服力？",
      taskInstruction: "可以从数据是否完整、不同条件是否具有可比性、结果是否稳定、是否需要多次测试或更多参与者等方面思考。",
      activityTopic: "探究工作记忆与 N-back 任务", referenceConcepts: ["数据完整", "条件可比", "结果稳定", "多次测试", "参与者"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "question", taskId: "lifeFactors",
      taskTitle: "生活中想到的干扰因素", taskInstruction: "请写下你自己想到的生活中的干扰因素",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["生活", "干扰因素", "长时记忆"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "question", taskId: "materialFactors",
      taskTitle: "材料中列出的干扰因素", taskInstruction: "请根据阅读材料自行填写",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["阅读材料", "干扰因素", "长时记忆"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "hypothesis", taskId: "hypothesis",
      taskTitle: "研究假设", taskInstruction: "写下你自己对结果的预测",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["研究假设", "结果预测", "干扰", "长时记忆"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "plan", taskId: "interferenceStagePlan",
      taskTitle: "干扰阶段", taskInstruction: "请写出干扰阶段参与者需要做的事",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["干扰阶段", "参与者", "实验流程"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "plan", taskId: "independentVariablePlan",
      taskTitle: "自变量", taskInstruction: "填写两轮实验中需要改变的条件",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["自变量", "两轮实验", "改变条件"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "plan", taskId: "dependentVariablePlan",
      taskTitle: "因变量", taskInstruction: "填写实验中观察和记录的变化",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["因变量", "观察", "记录", "变化"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "plan", taskId: "controlVariablePlan",
      taskTitle: "无关变量", taskInstruction: "填写两轮实验中必须保持不变的条件",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["无关变量", "两轮实验", "保持不变"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "analysis", taskId: "headband",
      taskTitle: "头环观察记录",
      taskInstruction: "请询问在你进行实验时观察头环的同学，并记录头环观察结果：不同干扰条件下头环颜色有什么变化？哪种条件下暖色区域更多？颜色变化是否和记忆成绩变化有关？",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["头环", "干扰条件", "暖色区域", "记忆成绩"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "conclusion", taskId: "conclusion",
      taskTitle: "结论", taskInstruction: "通过实验，我得到以下结论。结论需要回到数据：哪一轮或哪一条件正确率更低，是否说明该因素造成了更强干扰。",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["实验数据", "正确率", "干扰因素", "结论"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "reflection", taskId: "strengths",
      taskTitle: "实验设计有什么优点？",
      taskInstruction: "可以从干扰因素选择、变量控制、实验流程、材料设置和数据记录方式等方面思考。",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["实验设计", "干扰因素", "变量控制", "实验流程", "数据记录"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "reflection", taskId: "improvements",
      taskTitle: "还有哪些可以改进？",
      taskInstruction: "可以从干扰条件是否清楚、无关因素是否控制、测试时间是否合理、数据是否充分等方面思考。",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["干扰条件", "无关因素", "测试时间", "数据"], minimumLength: 10
    },
    {
      experimentId: "interference", stageId: "reflection", taskId: "learningInsight",
      taskTitle: "本实验结论对学习有什么启发？",
      taskInstruction: "可以思考实验结果与平时学习、复习安排、材料相似性、情绪状态或学习环境之间有什么联系。",
      activityTopic: "探究干扰对长时记忆的影响", referenceConcepts: ["实验结果", "学习", "复习安排", "材料相似性", "学习环境"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "question", taskId: "brainstormIndividual",
      taskTitle: "头脑风暴",
      taskInstruction: "回忆自己学习的经历，为什么有些信息更容易长期记住？哪些方法可以帮助我们更好地记住学习内容？请开始头脑风暴。",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["学习经历", "长期记忆", "学习内容", "记忆方法"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "hypothesis", taskId: "hypothesis1",
      taskTitle: "策略 1 假设", taskInstruction: "请阅读材料一至四，提出你的策略1假设。",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["研究假设", "记忆策略", "长时记忆"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "hypothesis", taskId: "hypothesis2",
      taskTitle: "策略 2 假设", taskInstruction: "请阅读材料一至四，提出你的策略2假设。",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["研究假设", "记忆策略", "长时记忆"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "analysis", taskId: "headband",
      taskTitle: "头环观察",
      taskInstruction: "请询问在你进行实验时观察头环的同学，并记录头环观察结果：使用不同记忆策略时头环颜色有什么变化？哪种策略下前额叶区域更活跃？颜色变化是否和记忆效果有关？",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["头环", "记忆策略", "前额叶", "记忆效果"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "conclusion", taskId: "conclusion",
      taskTitle: "结论", taskInstruction: "结论应结合两个阶段的回忆率、策略评分和头环观察，说明哪种策略更有效。",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["回忆率", "策略评分", "头环观察", "记忆策略"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "reflection", taskId: "designImprove",
      taskTitle: "实验设计有什么可以改进？",
      taskInstruction: "可以从策略选择、比较方式、材料难度、测试次数、时间安排和变量控制等方面思考。",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["实验设计", "策略选择", "材料难度", "测试次数", "变量控制"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "reflection", taskId: "surprise",
      taskTitle: "结果是否出乎意料？为什么？",
      taskInstruction: "可以结合不同策略的表现差异、自己原来的预测、使用策略时的感受和数据结果进行分析。",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["策略表现", "预测", "感受", "数据结果"], minimumLength: 10
    },
    {
      experimentId: "strategies", stageId: "reflection", taskId: "applicability",
      taskTitle: "以上策略适用于所有学习内容吗？",
      taskInstruction: "可以思考不同策略适合哪些学习任务，是否会受到材料类型、学习目标、时间长短和个人习惯的影响。",
      activityTopic: "改善长时记忆的策略有哪些", referenceConcepts: ["记忆策略", "学习任务", "材料类型", "学习目标", "个人习惯"], minimumLength: 10
    }
  ].map(Object.freeze));

  const taskMap = new Map(TASKS.map((task) => [`${task.experimentId}:${task.taskId}`, task]));

  function get(experimentId, taskId) {
    return taskMap.get(`${String(experimentId || "")}:${String(taskId || "")}`) || null;
  }

  global.TaskRelevanceConfig = Object.freeze({ tasks: TASKS, get });
})(window);
