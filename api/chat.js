const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5-mini";
const MAX_QUESTION_LENGTH = 500;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function clean(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST requests are supported." });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (error) {
    res.status(400).json({ error: "请求格式不正确。" });
    return;
  }
  const question = clean(body.question, MAX_QUESTION_LENGTH);
  if (!question) {
    res.status(400).json({ error: "请输入一个问题。" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "AI 后端尚未配置 OPENAI_API_KEY。" });
    return;
  }

  const context = {
    experimentName: clean(body.experimentName),
    pageTitle: clean(body.pageTitle),
    currentStep: clean(body.currentStep),
    path: clean(body.path, 120)
  };

  const instructions = [
    "你是“脑育智能体学习平台”的科学探究学习助手。",
    "你的目标是帮助学生理解材料、概念和科学探究流程。",
    "你可以解释概念、提醒学生查看阅读材料、提示变量/证据/结论之间的关系、鼓励学生自己完成。",
    "不要直接提供本实验的标准答案，不要代写研究问题、研究假设、实验结论、反思或问卷答案。",
    "如果学生要求直接答案，请改用启发式问题或检查清单引导。",
    "回答要简洁，通常不超过 160 个中文字；必要时使用 2-4 条短要点。",
    "语气温和、清楚、适合中学生课堂学习。"
  ].join("\n");

  const input = [
    `当前页面：${context.pageTitle || "未知"}`,
    `当前实验/模块：${context.experimentName || "未知"}`,
    `当前步骤：${context.currentStep || "未知"}`,
    `页面路径：${context.path || "未知"}`,
    `学生问题：${question}`
  ].join("\n");

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input,
        max_output_tokens: 350
      })
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: "AI 助手暂时无法回答，请稍后再试。" });
      return;
    }

    res.status(200).json({ answer: extractText(data) || "我暂时没有生成有效回答。你可以换一种问法试试。" });
  } catch (error) {
    res.status(500).json({ error: "AI 助手连接失败，请稍后再试。" });
  }
};
