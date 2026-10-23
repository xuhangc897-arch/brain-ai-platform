(function (global) {
  "use strict";

  function freezeDialog(dialog) {
    return Object.freeze(dialog.map((entry) => Object.freeze(entry)));
  }

  const entries = [
    {
      id: "screening",
      caseNumber: "PRELUDE",
      title: "侦探资格审查",
      avatar: "detective",
      dialog: freezeDialog([
        { text: "欢迎加入记忆侦探社。", pose: "normal" },
        { text: "在正式成为记忆侦探之前，你需要完成资格审查。", pose: "normal" },
        { text: "我们需要确认：你是否能够观察现象，提出问题，并利用证据进行推理。", pose: "thinking" }
      ]),
      buttonText: "开始资格审查"
    },
    {
      id: "memory",
      caseNumber: "CASE 01",
      title: "少拿的美术材料",
      avatar: "xiaohe",
      dialog: freezeDialog([
        { speaker: "小禾", text: "今天美术课前，老师让我去柜子里拿材料。她说了彩纸、胶棒、剪刀，后面还有好几样。", pose: "normal" },
        { speaker: "小禾", text: "我当时还在心里念呢，刚转身就想不起后面是什么了。最后少拿了两样，又跑回去问了一遍。", pose: "thinking" },
        { speaker: "小禾", text: "要是只说三样，我一般不会漏；一下说六七样，脑子里就乱了。明明刚听过，怎么就记不全了？", pose: "thinking" },
        { speaker: "侦探", avatar: "detective", text: "那我们先查查，人刚听完一串信息时，到底能准确记住多少。", pose: "thinking" }
      ]),
      buttonText: "调查记忆容量"
    },
    {
      id: "nback",
      caseNumber: "CASE 02",
      title: "跟丢的口算接龙",
      avatar: "xiaoming",
      dialog: freezeDialog([
        { speaker: "小明", text: "今天数学课又做口算接龙。老师说从 12 开始，先加 5，再接着减 3、乘 2，大家得一直跟着算。", pose: "normal" },
        { speaker: "小明", text: "加 5 我知道是 17，可下一步来了，我脑子里有时还冒出最开始的 12。等我想清楚，老师已经说到后面了。", pose: "thinking" },
        { speaker: "小明", text: "这些算式拆开来我都会，连在一起就容易乱。我到底是在哪一步跟丢的？", pose: "thinking" },
        { speaker: "侦探", avatar: "detective", text: "每来一步，你都得留住最新的结果，再接着处理下一步。我们来看看，信息不断更新时，任务变难会带来什么变化。", pose: "thinking" }
      ]),
      buttonText: "追踪工作记忆"
    },
    {
      id: "interference",
      caseNumber: "CASE 03",
      title: "串在一起的古诗",
      avatar: "xiaoyu",
      dialog: freezeDialog([
        { speaker: "小雨", text: "周一我背熟了一首写秋天的诗，当天背给同桌听，一句也没错。周二又学了一首，写的也是秋天，有些句子读起来还挺像。", pose: "normal" },
        { speaker: "小雨", text: "今天默写第一首，我写着写着，竟把第二首的句子接了进去。改完以后我自己都觉得奇怪。", pose: "thinking" },
        { speaker: "小雨", text: "是隔了两天忘了，还是新背的那首把我弄混了？", pose: "thinking" },
        { speaker: "侦探", avatar: "detective", text: "现在还不好说。我们试着查查，后来学的内容会不会影响原来记住的内容。", pose: "thinking" }
      ]),
      buttonText: "调查遗忘原因"
    },
    {
      id: "strategies",
      caseNumber: "CASE 04",
      title: "看熟了却写不出",
      avatar: "xiaolan",
      dialog: freezeDialog([
        { speaker: "小岚", text: "周五要听写单词。我昨天把单词表从头到尾读了好几遍，看的时候觉得每个都认识。", pose: "normal" },
        { speaker: "小岚", text: "可同桌把书一合，随便念了几个让我写，我就卡住了。翻开书一看答案，又觉得“这个我明明会啊”。", pose: "thinking" },
        { speaker: "小岚", text: "有人说要合上书自己测，有人喜欢给单词编联想。我是继续多看几遍，还是换个办法试试？", pose: "thinking" },
        { speaker: "侦探", avatar: "detective", text: "光觉得眼熟，还不知道过一会儿能不能想起来。我们用相近的内容试试不同记法，看回忆结果有什么不同。", pose: "thinking" }
      ]),
      buttonText: "破解记忆策略"
    },
    {
      id: "poster",
      caseNumber: "CASE 05",
      title: "记忆侦探社：校园委托行动",
      avatar: "detective",
      dialog: freezeDialog([
        { text: "四次实验历练已经完成，记忆侦探社开始接受校园里的委托。", pose: "normal" },
        { text: "请寻找一位在学习或校园活动中遇到具体记忆难题的同学。", pose: "normal" },
        { text: "查清他要完成什么、在哪一步出错，以及时间和条件限制。", pose: "thinking" },
        { text: "接下来，回看四份实验报告，为这位同学规划能实际使用的海报。", pose: "normal" }
      ]),
      buttonText: "接受校园委托"
    }
  ].map((entry) => Object.freeze(entry));

  const frozenEntries = Object.freeze(entries);
  const entriesById = Object.freeze(Object.fromEntries(
    frozenEntries.map((entry) => [entry.id, entry])
  ));

  global.MemoryCaseStories = Object.freeze({
    version: 1,
    entries: frozenEntries,
    get(caseId) {
      return entriesById[String(caseId || "")] || null;
    }
  });
})(window);
