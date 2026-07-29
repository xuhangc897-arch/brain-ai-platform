"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const pages = [
  { file: "memory.html", id: "memory", steps: 8 },
  { file: "nback.html", id: "nback", steps: 8 },
  { file: "interference.html", id: "interference", steps: 8 },
  { file: "strategies.html", id: "strategies", steps: 8 },
  { file: "poster.html", id: "poster", steps: 6 }
];
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const partnerScript = read("assets/memory-partner.js");
const partnerStyle = read("assets/memory-partner.css");
const voiceScript = read("assets/voice-assistant.js");

["ai", "voice", "task", "progress"].forEach((mode) => {
  expect(
    partnerScript.includes(`data-partner-mode="${mode}"`),
    `assets/memory-partner.js: missing ${mode} entry`
  );
});
expect(partnerScript.includes("global.VirtualAgent"), "assets/memory-partner.js: missing VirtualAgent API");
expect(partnerScript.includes("global.MemoryPartner"), "assets/memory-partner.js: missing MemoryPartner compatibility API");
expect(partnerScript.includes("getLearningState"), "assets/memory-partner.js: missing learning-state adapter");
expect(
  partnerScript.indexOf('document.body.appendChild(root)') <
    partnerScript.indexOf('document.body.classList.add("has-memory-partner", "has-virtual-agent")'),
  "assets/memory-partner.js: original assistant entries must only hide after successful attachment"
);
expect(
  partnerStyle.includes("--virtual-agent-image"),
  "assets/memory-partner.css: missing replaceable image variable"
);
expect(
  partnerStyle.includes("@media (prefers-reduced-motion: reduce)"),
  "assets/memory-partner.css: missing reduced-motion support"
);
expect(voiceScript.includes("data-voice-write"), "assets/voice-assistant.js: missing write-back action");
expect(voiceScript.includes('new Event("input", { bubbles: true })'), "assets/voice-assistant.js: missing input event");
expect(voiceScript.includes('new Event("change", { bubbles: true })'), "assets/voice-assistant.js: missing change event");

const seenIds = new Set();
pages.forEach(({ file, id, steps }) => {
  const source = read(file);
  const aiIndex = source.indexOf('src="assets/ai-assistant.js');
  const voiceIndex = source.indexOf('src="assets/voice-assistant.js"');
  const partnerIndex = source.indexOf('src="assets/memory-partner.js"');
  const initIndex = source.indexOf("window.VirtualAgent.init({");
  const descriptionCount = (source.match(/\btaskDescription\s*:/g) || []).length;
  const idMatch = source.match(/experimentId:\s*"([^"]+)"/);

  expect(aiIndex >= 0, `${file}: missing AI assistant`);
  expect(voiceIndex > aiIndex, `${file}: voice assistant must load after AI assistant`);
  expect(partnerIndex > voiceIndex, `${file}: virtual agent must load after voice assistant`);
  expect(initIndex > partnerIndex, `${file}: VirtualAgent.init must run after component load`);
  expect(source.includes("if (window.VirtualAgent)"), `${file}: missing component failure guard`);
  expect(idMatch?.[1] === id, `${file}: expected experimentId "${id}"`);
  expect(descriptionCount === steps, `${file}: expected ${steps} task descriptions, found ${descriptionCount}`);
  expect(!seenIds.has(id), `${file}: duplicate experimentId "${id}"`);
  seenIds.add(id);
});

if (failures.length) {
  console.error(`Virtual agent contract failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Virtual agent contracts passed for five experiment pages.");
}
