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
      title: "消失的数字档案",
      avatar: "detective",
      dialog: freezeDialog([
        { text: "侦探，我们收到了一份异常档案。", pose: "normal" },
        { text: "管理员发现：刚刚记录的信息正在快速消失。", pose: "thinking" },
        { text: "你的任务，是调查人类记忆容量的秘密。", pose: "thinking" }
      ]),
      buttonText: "调查记忆容量"
    },
    {
      id: "nback",
      caseNumber: "CASE 02",
      title: "动态记忆文件",
      avatar: "detective",
      dialog: freezeDialog([
        { text: "新的线索出现。", pose: "normal" },
        { text: "这一次，信息并没有消失，而是正在被大脑不断加工和更新。", pose: "thinking" },
        { text: "你的任务，是调查工作记忆如何保持并处理信息。", pose: "thinking" }
      ]),
      buttonText: "追踪工作记忆"
    },
    {
      id: "interference",
      caseNumber: "CASE 03",
      title: "被污染的记忆现场",
      avatar: "detective",
      dialog: freezeDialog([
        { text: "警报！一份重要证词出现错误。", pose: "normal" },
        { text: "原本准确的记忆，似乎受到了其他信息影响。", pose: "thinking" },
        { text: "你的任务，是寻找遗忘和干扰背后的原因。", pose: "thinking" }
      ]),
      buttonText: "调查遗忘原因"
    },
    {
      id: "strategies",
      caseNumber: "CASE 04",
      title: "破解记忆密码",
      avatar: "detective",
      dialog: freezeDialog([
        { text: "最后的案件已经开启。", pose: "normal" },
        { text: "我们发现：优秀侦探并不是拥有更大的记忆空间，而是掌握了更好的记忆方法。", pose: "thinking" },
        { text: "你的任务，是寻找提升记忆效果的方法。", pose: "thinking" }
      ]),
      buttonText: "破解记忆策略"
    },
    {
      id: "poster",
      caseNumber: "CASE 05",
      title: "重建记忆档案",
      avatar: "detective",
      dialog: freezeDialog([
        { text: "四份调查报告已经完成。", pose: "normal" },
        { text: "现在需要整理所有证据。", pose: "normal" },
        { text: "制作最终调查报告，向记忆侦探总部提交你的发现。", pose: "thinking" }
      ]),
      buttonText: "提交调查报告"
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
