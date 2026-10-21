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
const introStyle = read("assets/case-intro.css");
const expectedCases = [
  ["screening", "pretest.html", "侦探资格审查", "开始资格审查"],
  ["memory", "memory.html", "少拿的美术材料", "调查记忆容量"],
  ["nback", "nback.html", "跟丢的口算接龙", "追踪工作记忆"],
  ["interference", "interference.html", "串在一起的古诗", "调查遗忘原因"],
  ["strategies", "strategies.html", "看熟了却写不出", "破解记忆策略"],
  ["poster", "poster.html", "重建记忆档案", "提交调查报告"]
];
const studentCases = [
  ["memory", "xiaohe", "小禾", "彩纸、胶棒、剪刀"],
  ["nback", "xiaoming", "小明", "从 12 开始"],
  ["interference", "xiaoyu", "小雨", "第二首的句子"],
  ["strategies", "xiaolan", "小岚", "合上书自己测"]
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

studentCases.forEach(([id, avatar, speaker, storyDetail]) => {
  const story = stories.get(id);
  assert(story.avatar === avatar && story.dialog.length === 4, `${id} 必须使用对应学生和四句对话。`);
  assert(story.dialog.slice(0, 3).every((line) => line.speaker === speaker && !line.avatar), `${id} 前三句必须由学生讲述。`);
  assert(story.dialog[3].speaker === "侦探" && story.dialog[3].avatar === "detective", `${id} 末句必须切回侦探。`);
  assert(story.dialog.some((line) => line.text.includes(storyDetail)), `${id} 缺少情境关键内容。`);
  const sprite = `assets/case-characters/${avatar}.webp`;
  assert(fs.existsSync(path.join(root, sprite)), `${id} 缺少学生双表情立绘。`);
  assert(fs.statSync(path.join(root, sprite)).size < 200000, `${id} 立绘必须保持轻量。`);
  assert(introStyle.includes(`case-characters/${avatar}.webp`), `${id} 的立绘未接入样式。`);
});

assert(stories.get("screening").avatar === "detective" && stories.get("poster").avatar === "detective", "资格审查与最终报告应保留侦探形象。");

[
  'href="assets/case-intro.css"',
  'src="assets/case-stories.js"',
  'src="assets/case-intro.js"',
  "window.CaseIntro.create",
  "caseIntro?.isOpen()"
].forEach((contract) => assert(index.includes(contract), `首页缺少剧情接入契约：${contract}`));

[
  ['href="admin/initStudents.html"', "学生名单导入"],
  ['href="admin/dashboard.html"', "后台数据管理"],
  ['id="teacherMenuButton"', "教师端菜单按钮"],
  ['id="teacherMenuPanel"', "教师端菜单面板"]
].forEach(([contract, label]) => assert(index.includes(contract), `首页缺少${label}：${contract}`));

assert(!index.includes("caseDialog"), "旧案件确认弹窗仍然存在。");
assert(introSource.includes('scopedKey(SEEN_STORAGE_KEY)'), "剧情观看记录必须使用用户作用域存储。");
assert(introSource.includes("markSeen(activeStory.id)"), "点击开始调查时必须记录已观看案件。");
assert(introSource.includes("skipButton.hidden = !hasSeen(caseId)"), "首次进入必须隐藏跳过按钮，第二次起才能显示。");
assert(introSource.includes("setEntry(entry)"), "剧情播放必须按说话者切换角色。 ");
assert(introSource.includes("followLatestLine()"), "长台词播放时必须保持最新文字可见。");
assert(!introSource.includes("!route || hasSeen(caseId)"), "已观看案件仍应再次进入剧情场景。");
assert(introSource.includes("return Object.freeze({ open, close, isOpen, hasSeen })"), "CaseIntro 控制器公共接口不完整。");

console.log("Six case intro stories, card mappings, routes and replay contracts passed.");
