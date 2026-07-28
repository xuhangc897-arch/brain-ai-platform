"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const removedPaths = ["ai-assistant.js", "脑育智能体"];
const requiredDebtNotes = [
  "教师后台临时免登录",
  "服务端授权",
  "CloudBase Node.js 运行时",
  "数据库备份"
];

for (const relativePath of removedPaths) {
  if (fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`低风险遗留仍存在：${relativePath}`);
  }
}

const guidePath = path.join(root, "修改须知.md");
if (!fs.existsSync(guidePath)) {
  throw new Error("缺少根目录 修改须知.md。");
}
const guide = fs.readFileSync(guidePath, "utf8");
for (const note of requiredDebtNotes) {
  if (!guide.includes(note)) {
    throw new Error(`修改须知未登记遗留项：${note}`);
  }
}

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
if (readme.trim() === "Test from Codex") {
  throw new Error("README.md 仍是历史占位内容。");
}

console.log("Legacy cleanup and retained-debt register checks passed.");
