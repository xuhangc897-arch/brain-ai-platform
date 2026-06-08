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

function parseBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body || {};
}

function getOpenAIError(data, status) {
  const message = data && data.error && data.error.message ? data.error.message : "";
  if (!message) return `OpenAI 返回错误（HTTP ${status}）。`;
  return `OpenAI 返回错误（HTTP ${status}）：${clean(message, 180)}`;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "只支持 POST 请求。" });
    return;
  }

  let body;
  try {
    body = parseBody(req);
  } catch (error) {
    res.status(400).json({ error: "请求格式不正确，请发送 JSON 数据。" });
    return;
  }

  const question = clean(body.question, MAX_QUESTION_LENGTH);
  if (!question) {
    res.status(400).json({ error: "请输入一个问题。" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "API Key 未配置：请在 Vercel 环境变量中设置 OPENAI_API_KEY，并重新部署。" });
    return;
  }

  const context = {
    studentName: clean(body.studentName, 80),
    studentAge: clean(body.studentAge, 20),
    studentId: clean(body.studentId, 80),
    groupId: clean(body.groupId, 80),
    experimentName: clean(body.experimentName),
    pageTitle: clean(body.pageTitle),
    currentStep: clean(body.currentStep),
    path: clean(body.path, 120)
  };

  const instructions = [
    "你是“脑育智能体学习平台”的科学探究学习助手。",
    "你的职责是帮助中学生理解科学探究任务、阅读材料、实验变量、证据分析和反思表达。",
    "你只提供提示、解释、检查清单和思考方向；不得直接代写研究问题、研究假设、实验结论、反思、问卷答案或本实验标准答案。",
    "如果学生要求直接答案，请用启发式问题引导他们根据材料和数据独立完成。",
    "回答要简短、清晰、温和，适合中学生理解；通常不超过 160 个中文字符，必要时用 2-4 条短要点。",
    "你可以提醒学生回到当前实验阶段和阅读材料中寻找证据。"
  ].join("\n");

  const input = [
    `学生姓名：${context.studentName || "未填写"}`,
    `学生年龄：${context.studentAge || "未填写"}`,
    `学生编号：${context.studentId || "未填写"}`,
    `小组编号：${context.groupId || "未填写"}`,
    `当前页面：${context.pageTitle || "未知"}`,
    `当前实验/模块：${context.experimentName || "未知"}`,
    `当前阶段：${context.currentStep || "未知"}`,
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

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: getOpenAIError(data, response.status) });
      return;
    }

    const answer = extractText(data);
    if (!answer) {
      res.status(502).json({ error: "OpenAI 已响应，但没有返回可显示的文本。" });
      return;
    }

    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: `后端接口无法访问 OpenAI：${clean(error.message || error, 160)}` });
  }
};
