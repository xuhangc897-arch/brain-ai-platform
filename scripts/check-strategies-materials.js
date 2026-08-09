const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "strategies.html"), "utf8");

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `无法提取代码片段：${startMarker}`);
  return source.slice(start, end);
}

const materialSource = sliceBetween("function createMaterial", "const MEMORY_STRATEGIES");
const selectionSource = sliceBetween("function getLastUsedOrder", "function recordGeneratedMaterials");
const shuffleMatch = source.match(/function shuffle\(items\) \{[^\n]+\}/);
assert(shuffleMatch, "缺少 shuffle()。 ");

const context = {};
vm.createContext(context);
vm.runInContext(`${materialSource}\n${selectionSource}\n${shuffleMatch[0]}\nthis.bank = materialBank; this.select = selectMaterialsForPlan;`, context);

const bank = context.bank;
const allItems = [];
for (const type of ["word", "poem", "idiom"]) {
  for (const difficulty of ["low", "mid", "high"]) {
    assert.strictEqual(bank[type][difficulty].length, 24, `${type}.${difficulty} 必须有24项材料`);
    for (const item of bank[type][difficulty]) {
      assert.deepStrictEqual(Object.keys(item), ["id", "type", "difficulty", "display", "answer"], `${item.id} 字段形状发生变化`);
      assert.strictEqual(item.type, type);
      assert.strictEqual(item.difficulty, difficulty);
      allItems.push(item);
    }
  }
}
assert.strictEqual(allItems.length, 216, "候选材料总数必须为216项");
assert.strictEqual(new Set(allItems.map((item) => item.id)).size, 216, "材料ID必须全局唯一");

const englishLengths = { low: [3, 5], mid: [5, 7], high: [6, 10] };
for (const difficulty of ["low", "mid", "high"]) {
  const [min, max] = englishLengths[difficulty];
  for (const item of bank.word[difficulty]) {
    assert(/^[a-z]+$/.test(item.answer), `${item.id} 必须是单个英文词`);
    assert(item.answer.length >= min && item.answer.length <= max, `${item.id} 不符合英文长度梯度`);
    assert(item.display.startsWith(`${item.answer} `), `${item.id} 必须保留中文释义`);
  }
}
for (const banned of ["circumference", "photosynthesis", "mitochondrion", "electromagnetism", "metamorphosis", "renaissance", "biodiversity"]) {
  assert(!source.includes(`${banned} `), `仍含旧专业词：${banned}`);
}

const expectedSentenceCounts = { low: 1, mid: 2, high: 4 };
for (const difficulty of ["low", "mid", "high"]) {
  for (const item of bank.poem[difficulty]) {
    const sentenceCount = (item.answer.match(/[，。！？；]/g) || []).length;
    assert.strictEqual(sentenceCount, expectedSentenceCounts[difficulty], `${item.id} 的诗句信息单元数不符合梯度`);
    assert(!/[《》]/.test(item.display), `${item.id} 不应包含篇名`);
  }
}
for (const banned of ["潋滟", "烟渚", "蓑笠", "姑苏", "万仞", "羌笛", "岐王", "崔九", "屐齿", "柴扉", "风簸", "茱萸", "泗水滨", "瑟瑟"]) {
  assert(!bank.poem.low.concat(bank.poem.mid, bank.poem.high).some((item) => item.answer.includes(banned)), `仍含高知识负荷诗词表达：${banned}`);
}

const expectedChineseUnits = { low: 1, mid: 2, high: 3 };
for (const difficulty of ["low", "mid", "high"]) {
  for (const item of bank.idiom[difficulty]) {
    const units = item.answer.split(/\s+/);
    assert.strictEqual(units.length, expectedChineseUnits[difficulty], `${item.id} 的中文信息单元数不符合梯度`);
    assert(units.every((unit) => /^[\u4e00-\u9fff]{2}$/.test(unit)), `${item.id} 必须全部由双字常用词组成`);
    assert.strictEqual(new Set(units).size, units.length, `${item.id} 内部存在重复词`);
  }
}

const plan = { difficultyCounts: { low: 2, mid: 2, high: 2 } };
const usage = [];
const firstTwelve = [];
for (let index = 0; index < 12; index += 1) {
  const selected = context.select(bank.word, plan, usage);
  assert.strictEqual(selected.length, 6, "每次模拟应抽取6项");
  assert.strictEqual(new Set(selected.map((item) => item.id)).size, 6, "同次抽取不得重复");
  firstTwelve.push(selected);
  usage.push({ itemIds: selected.map((item) => item.id) });
}
assert.strictEqual(new Set(firstTwelve.flat().map((item) => item.id)).size, 72, "材料未耗尽前不得重复");

const thirteenth = context.select(bank.word, plan, usage);
const previousIds = new Set(firstTwelve[11].map((item) => item.id));
assert(thirteenth.every((item) => !previousIds.has(item.id)), "耗尽回退时不应连续重复上一轮材料");
for (const difficulty of ["low", "mid", "high"]) {
  const oldestIds = new Set(firstTwelve[0].filter((item) => item.difficulty === difficulty).map((item) => item.id));
  assert(thirteenth.filter((item) => item.difficulty === difficulty).every((item) => oldestIds.has(item.id)), `${difficulty} 未优先回退到最久未使用材料`);
}

assert(source.includes("recordGeneratedMaterials(history, plan.materialType, selectedItems);\n      return selectedItems;"), "材料必须在返回会话前立即登记");
const resetLine = source.split("\n").find((line) => line.includes('document.getElementById("resetBtn")')) || "";
assert(resetLine.includes("removeItem(STORAGE_KEY)"), "重置逻辑应继续清理实验状态");
assert(!resetLine.includes("MATERIAL_USAGE_STORAGE_KEY"), "重置实验状态不得清除材料使用历史");
assert(!sliceBetween("const defaultState", "let state = loadState()").includes("materialUsage"), "不得向实验状态增加材料历史字段");

console.log("Experiment 4 material checks passed: 216 items, difficulty gradients, local history fallback, and schema isolation.");
