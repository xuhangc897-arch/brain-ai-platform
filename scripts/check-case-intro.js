"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadBrowserScript(relativePath, window) {
  vm.runInNewContext(read(relativePath), { window }, { filename: relativePath });
}

const browserWindow = {};
loadBrowserScript("assets/experiment-registry.js", browserWindow);
loadBrowserScript("assets/case-stories.js", browserWindow);

const registry = browserWindow.BrainExperimentRegistry;
const stories = browserWindow.MemoryCaseStories;
const index = read("index.html");
const introSource = read("assets/case-intro.js");
const expectedCases = [
  ["screening", "pretest.html", "侦探资格审查", "开始资格审查"],
  ["memory", "memory.html", "消失的数字档案", "调查记忆容量"],
  ["nback", "nback.html", "动态记忆文件", "追踪工作记忆"],
  ["interference", "interference.html", "被污染的记忆现场", "调查遗忘原因"],
  ["strategies", "strategies.html", "破解记忆密码", "破解记忆策略"],
  ["poster", "poster.html", "重建记忆档案", "提交调查报告"]
];

assert(registry && stories, "案件注册表或剧情配置未加载。");
assert(stories.entries.length === expectedCases.length, "剧情配置必须包含六个案件。");

const cardTags = Array.from(index.matchAll(/<button\b[^>]*\bclass="case-card"[^>]*>/g), (match) => match[0]);
assert(cardTags.length === expectedCases.length, "首页必须包含六张案件卡片。");

expectedCases.forEach(([id, route, title, buttonText], indexPosition) => {
  const story = stories.get(id);
  const registryEntry = registry.get(id);
  const cardTag = cardTags[indexPosition];

  assert(story, `缺少案件剧情：${id}`);
  assert(registryEntry, `实验注册表缺少案件：${id}`);
  assert(registryEntry.route === route, `${id} 的注册表路由必须保持为 ${route}`);
  assert(story.title === title, `${id} 的剧情标题不正确。`);
  assert(story.buttonText === buttonText, `${id} 的开始按钮文案不正确。`);
  assert(Array.isArray(story.dialog) && story.dialog.length >= 3, `${id} 至少需要三段剧情。`);
  assert(story.dialog.every((line) => line.text && ["normal", "thinking"].includes(line.pose)), `${id} 的剧情行必须包含文字和有效姿态。`);
  assert(cardTag.includes(`data-case-id="${id}"`), `第 ${indexPosition + 1} 张卡片缺少正确的 data-case-id。`);
  assert(cardTag.includes(`data-case-route="${route}"`), `${id} 的卡片路由必须保持为 ${route}`);
});

[
  'href="assets/case-intro.css"',
  'src="assets/case-stories.js"',
  'src="assets/case-intro.js"',
  "window.CaseIntro.create",
  "caseIntro.isOpen()"
].forEach((contract) => assert(index.includes(contract), `首页缺少剧情接入契约：${contract}`));

assert(!index.includes("caseDialog"), "旧案件确认弹窗仍然存在。");
assert(introSource.includes('scopedKey(SEEN_STORAGE_KEY)'), "剧情观看记录必须使用用户作用域存储。");
assert(introSource.includes("markSeen(activeStory.id)"), "点击开始调查时必须记录已观看案件。");
assert(introSource.includes("skipButton.hidden = !hasSeen(caseId)"), "首次进入必须隐藏跳过按钮，第二次起才能显示。");
assert(!introSource.includes("!route || hasSeen(caseId)"), "已观看案件仍应再次进入剧情场景。");
assert(introSource.includes("return Object.freeze({ open, close, isOpen, hasSeen })"), "CaseIntro 控制器公共接口不完整。");

console.log("Six case intro stories, card mappings, routes and replay contracts passed.");
