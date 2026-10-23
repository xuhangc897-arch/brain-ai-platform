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
  ["poster", "poster.html", "校园委托行动", "接受校园委托"]
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
assert(introSource.includes('class="case-intro-student"') && introSource.includes('class="case-intro-avatar"'), "实验导入必须同时显示学生与侦探。");
assert(!introSource.includes("case-intro-speaker"), "英文标题下方不得重复显示说话者标签。");
assert(introSource.includes("if (isInteractiveStory()) {") && introSource.includes("finishLine();") && introSource.includes('startButton.textContent = "继续对话"'), "实验对话必须逐句等待操作者推进。");
assert(introSource.includes("dialog.replaceChildren();") && introSource.includes("playStory(activeLineIndex + 1)"), "推进时必须只显示当前一句。");
assert(introStyle.includes(".case-intro.has-student .case-intro-log {\n  grid-template-columns: minmax(0, 1fr);\n  grid-template-rows: minmax(0, 1fr) auto;\n  height: clamp(205px, 24vh, 250px)"), "实验字幕必须占满整行且框高固定。");
assert(introStyle.includes(".case-intro.has-student .case-intro-dialog {\n  width: 100%;") && introStyle.includes("  max-width: none;"), "实验字幕须使用整个对话框宽度，不能被按钮列或最大宽度提前断行。");
assert(introStyle.includes(".case-intro.has-student.is-student-speaking .case-intro-student") && introStyle.includes(".case-intro.has-student:not(.is-student-speaking) .case-intro-avatar") && introStyle.includes("transform: scale(1.05)") && introStyle.includes("transform: scale(0.72)") && introStyle.includes("filter: brightness(0.45)") && introStyle.includes("  animation: none;"), "学生和侦探讲话时必须放大，未讲话时缩小变暗，且不能被入场动画覆盖。");
assert(introStyle.includes('.case-intro[data-avatar="xiaoyu"] .case-intro-student-pose--thinking {\n  clip-path: polygon('), "小雨思考立绘必须遮掉左侧残影。");
assert(!introSource.includes("!route || hasSeen(caseId)"), "已观看案件仍应再次进入剧情场景。");
assert(introSource.includes("return Object.freeze({ open, close, isOpen, hasSeen })"), "CaseIntro 控制器公共接口不完整。");

function mockElement() {
  const classes = new Set();
  const listeners = {};
  return {
    children: [], dataset: {}, textContent: "", hidden: false, disabled: false,
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute() {}, focus() {},
    addEventListener(name, listener) { listeners[name] = listener; },
    click() { listeners.click(); },
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    querySelectorAll() { return []; }
  };
}

const introRoot = mockElement();
const introParts = Object.fromEntries([
  ".case-intro-number", ".case-intro-title", ".case-intro-dialog", ".case-intro-live",
  ".case-intro-return", ".case-intro-skip", ".case-intro-start"
].map((selector) => [selector, mockElement()]));
introRoot.querySelector = (selector) => introParts[selector];
const storage = new Map();
const navigation = [];
const fakeDocument = {
  body: { appendChild() {}, classList: mockElement().classList },
  createElement(tag) { return tag === "section" ? introRoot : mockElement(); },
  getElementById() { return null; },
  activeElement: null
};
const fakeWindow = {
  matchMedia() { return { matches: true }; },
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); }
  }
};
vm.runInNewContext(introSource, { window: fakeWindow, document: fakeDocument }, { filename: "assets/case-intro.js" });
const controller = fakeWindow.CaseIntro.create({
  platform: { storage: { scopedKey(key) { return `student-a:${key}`; } } },
  stories,
  onNavigate(route) { navigation.push(route); }
});
const dialog = introParts[".case-intro-dialog"];
const advance = introParts[".case-intro-start"];
const skip = introParts[".case-intro-skip"];
controller.open({ caseId: "memory", route: "memory.html" });
assert(skip.hidden && dialog.children.length === 1 && dialog.children[0].textContent.startsWith("小禾："), "首次进入必须只显示第一句学生台词且不能跳过。");
assert(advance.textContent === "继续对话" && introRoot.classList.contains("is-student-speaking"), "学生发言结束后必须等待点击继续。");
advance.click();
assert(dialog.children.length === 1 && dialog.children[0].textContent.includes("刚转身"), "点击继续应只显示第二句。");
advance.click();
assert(dialog.children.length === 1 && dialog.children[0].textContent.includes("六七样"), "第三句应独立显示。");
advance.click();
assert(dialog.children.length === 1 && dialog.children[0].textContent.startsWith("侦探：") && !introRoot.classList.contains("is-student-speaking"), "最后一句须切换为侦探发言。");
assert(advance.textContent === "调查记忆容量" && navigation.length === 0, "全部对话结束前不得进入实验。");
advance.click();
assert(navigation[0] === "memory.html" && controller.hasSeen("memory"), "末句结束后方可进入实验并记录观看状态。");
controller.open({ caseId: "memory", route: "memory.html" });
assert(!skip.hidden && dialog.children.length === 1, "再次进入仍从第一句开始且可跳过。");
skip.click();
assert(dialog.children.length === 1 && dialog.children[0].textContent.startsWith("侦探：") && advance.textContent === "调查记忆容量", "跳过后只显示末句并允许进入实验。");

console.log("Six case intro stories, card mappings, routes and replay contracts passed.");
