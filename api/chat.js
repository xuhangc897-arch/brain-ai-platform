const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
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

function buildContext(body, question) {
  const lines = [
    `学生姓名：${clean(body.studentName, 80) || "未填写"}`,
    `学生年龄：${clean(body.studentAge, 20) || "未填写"}`,
    `学生编号：${clean(body.studentId, 80) || "未填写"}`,
    `小组编号：${clean(body.groupId, 80) || "未填写"}`,
    `当前页面：${clean(body.pageTitle) || "未知"}`,
    `当前实验/模块：${clean(body.experimentName) || "未知"}`,
    `当前阶段：${clean(body.currentStep) || "未知"}`,
    `页面路径：${clean(body.path, 120) || "未知"}`,
    `学生问题：${question}`
  ];
  return lines.join("\n");
}

async function readDeepSeekError(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return `DeepSeek 返回错误（HTTP ${response.status}）。`;

  try {
    const data = JSON.parse(raw);
    const message = data && data.error && data.error.message
      ? data.error.message
      : raw;
    return `DeepSeek 返回错误（HTTP ${response.status}）：${clean(message, 220)}`;
  } catch (error) {
    return `DeepSeek 返回错误（HTTP ${response.status}）：${clean(raw, 220)}`;
  }
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

  const systemPrompt = "你是一个科学探究学习助手。\n你只负责启发、提示和帮助学生梳理思路。\n不要直接给出实验答案。\n回答尽量简洁，控制在100字以内。";

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildContext(body, question) }
        ],
        max_tokens: 220,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      sendJson(res, 502, { error: await readDeepSeekError(response) });
      return;
    }

    const data = await response.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message
      ? clean(data.choices[0].message.content, 1200)
      : "";

    if (!reply) {
      sendJson(res, 502, { error: "DeepSeek 已响应，但没有返回可显示的文本。" });
      return;
    }

    sendJson(res, 200, { reply });
  } catch (error) {
    sendJson(res, 500, {
      error: `DeepSeek 接口请求失败：${clean(error && error.message ? error.message : "未知错误", 220)}`
    });
  }
};
