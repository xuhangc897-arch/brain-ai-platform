const MODEL = "deepseek-chat";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const MAX_QUESTION_LENGTH = 500;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.status(statusCode).json(payload);
}

function clean(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body || {};
}

function getDeepSeekError(error) {
  const status = error && error.status ? `HTTP ${error.status}` : "未知状态";
  const message = error && error.message ? clean(error.message, 180) : "未返回具体错误。";
  return `DeepSeek 返回错误（${status}）：${message}`;
}

function getOpenAIClient() {
  const OpenAI = require("openai");
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: DEEPSEEK_BASE_URL
  });
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "只支持 POST 请求。" });
    return;
  }

  let body;
  try {
    body = parseBody(req);
  } catch (error) {
    sendJson(res, 400, { error: "请求格式不正确，请发送 JSON 数据。" });
    return;
  }

  const question = clean(body.question, MAX_QUESTION_LENGTH);
  if (!question) {
    sendJson(res, 400, { error: "请输入一个问题。" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, { error: "OPENAI_API_KEY 未配置。" });
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

  const systemPrompt = [
    "你是“脑育智能体学习平台”的科学探究学习助手。",
    "你的职责是帮助中学生理解科学探究任务、阅读材料、实验变量、证据分析和反思表达。",
    "你只提供提示、解释、检查清单和思考方向；不得直接代写研究问题、研究假设、实验结论、反思、问卷答案或本实验标准答案。",
    "如果学生要求直接答案，请用启发式问题引导他们根据材料和数据独立完成。",
    "回答要简短、清晰、温和，适合中学生理解；通常不超过 160 个中文字符，必要时用 2-4 条短要点。",
    "你可以提醒学生回到当前实验阶段和阅读材料中寻找证据。"
  ].join("\n");

  const userPrompt = [
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
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 350,
      temperature: 0.4
    });

    const answer = completion && completion.choices && completion.choices[0] && completion.choices[0].message
      ? clean(completion.choices[0].message.content, 1200)
      : "";

    if (!answer) {
      sendJson(res, 502, { error: "DeepSeek 已响应，但没有返回可显示的文本。" });
      return;
    }

    sendJson(res, 200, { answer });
  } catch (error) {
    sendJson(res, 500, { error: getDeepSeekError(error) });
  }
};
