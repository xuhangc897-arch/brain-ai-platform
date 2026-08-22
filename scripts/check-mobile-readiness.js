"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const studentPages = [
  "index.html",
  "login.html",
  "pretest.html",
  "memory.html",
  "nback.html",
  "interference.html",
  "strategies.html",
  "poster.html",
  "review.html",
  "diagnosis.html"
];

studentPages.forEach((file) => {
  const viewport = read(file).match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i)?.[1] || "";
  assert(
    viewport.includes("width=device-width") && /initial-scale=1(?:\.0)?(?:,|$)/.test(viewport),
    `${file}: missing mobile viewport contract`
  );
});

const home = read("index.html");
assert(home.includes('id="arrivalVideo"') && home.includes('preload="none"'), "index.html: arrival video must not preload");
assert(home.includes('data-src="assets/new-frontpage/首页视频-web.mp4"'), "index.html: arrival video must hydrate after first paint");
assert(home.includes('data-src="assets/new-frontpage/第二页面视频-web.mp4"'), "index.html: second video must be deferred");
assert(home.includes('data-src="assets/new-frontpage/导航图背景-web.webp"'), "index.html: navigation background must be deferred");
assert(home.includes("scheduleArrivalVideo") && home.includes("connection?.saveData"), "index.html: weak-network media guard missing");
assert(home.includes("function hydrateScene"), "index.html: scene asset hydration missing");
assert(home.includes("is-navigation-active"), "index.html: mobile case-navigation state missing");
assert(home.includes("compact ? distance !== 0"), "index.html: mobile carousel must expose one clear active card");
assert(home.includes("左右滑动或点击箭头切换"), "index.html: mobile carousel touch guidance missing");

const theme = read("assets/experiment-theme.css");
[
  "mobile-progress-current",
  "mobile-actions-toggle",
  "overflow-x: clip",
  "min-height: 44px",
  "左右滑动查看完整表格",
  "font-size: 16px"
].forEach((marker) => assert(theme.includes(marker), `assets/experiment-theme.css: missing ${marker}`));

const themeScript = read("assets/experiment-theme.js");
assert(themeScript.includes("setupMobileExperimentChrome"), "assets/experiment-theme.js: mobile header setup missing");
assert(themeScript.includes("MutationObserver"), "assets/experiment-theme.js: current-step observer missing");

const memory = read("memory.html");
assert(memory.includes('data-plan-move="-1"') && memory.includes('data-plan-move="1"'), "memory.html: touch ordering controls missing");
assert(memory.includes("updatePlanMoveButtons"), "memory.html: touch ordering state update missing");

const partnerStyle = read("assets/memory-partner.css");
const aiStyle = read("assets/ai-assistant.css");
const voiceStyle = read("assets/voice-assistant.css");
assert(partnerStyle.includes("memory-detective-states.webp"), "virtual agent must use the optimized sprite");
assert(aiStyle.includes("max-height: min(78dvh, 680px)"), "AI assistant mobile drawer missing");
assert(voiceStyle.includes("max-height: min(78dvh, 680px)"), "voice assistant mobile drawer missing");

const build = read("scripts/build-site.js");
[
  "assets/headband-guide.png",
  "assets/home-hero-bg.png",
  "assets/memory-detective-states.png",
  "assets/poster-example.png"
].forEach((asset) => assert(build.includes(`"${asset}"`), `build-site.js: ${asset} must be excluded from deployment`));

assert(fs.statSync(path.join(root, "assets/memory-detective-states.webp")).size < 500000, "optimized virtual-agent sprite must stay below 500 KB");

console.log("Mobile layout, touch target and deferred-media contracts passed.");
