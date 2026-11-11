const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createForm } = require('./generate-spanish-picture-form');

const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'spanish-picture-bank.json'), 'utf8'));
const expectedPools = [4, 12, 15, 18, 21];
const expectedPoolLengthMix = [[5, 4, 3], [6, 5, 4], [7, 6, 5], [9, 6, 6]];
const expectedLengthMix = [[3, 3, 2], [4, 3, 3], [5, 4, 3], [6, 4, 4]];
assert.deepStrictEqual(expectedPools.map((_, round) => bank.items.filter(item => item.round === round).length), expectedPools);
assert.strictEqual(new Set(bank.items.map(item => item.id)).size, bank.items.length);
assert.strictEqual(new Set(bank.items.map(item => item.word)).size, bank.items.length);
assert(bank.items.every(item => item.word && item.pictureZh && item.meaningZh));
for (const item of bank.items) {
  assert.strictEqual(item.pictureAsset, `docs/spanish-picture-bank-images/${item.id}.jpg`);
  const file = path.join(__dirname, '..', item.pictureAsset);
  const bytes = fs.readFileSync(file);
  assert.strictEqual(bytes.subarray(0, 3).toString('hex'), 'ffd8ff');
  assert(bytes.length < 100000);
}
for (let round = 1; round <= 4; round++) {
  const words = bank.items.filter(item => item.round === round).map(item => item.word);
  assert.deepStrictEqual([
    words.filter(word => [...word].length <= 5).length,
    words.filter(word => [...word].length >= 6 && [...word].length <= 7).length,
    words.filter(word => [...word].length >= 8).length
  ], expectedPoolLengthMix[round - 1]);
}

const firstRoundKeys = new Set();
for (let formId = 0; formId < 8640; formId++) {
  const form = createForm(formId);
  assert.deepStrictEqual(form.rounds.map(round => round.count), [4, 8, 10, 12, 14]);
  assert.deepStrictEqual(form, createForm(formId));
  firstRoundKeys.add(form.rounds[1].study.map(item => item.itemId).join(','));
  const allItems = form.rounds.flatMap(round => round.study.map(item => item.itemId));
  assert.strictEqual(new Set(allItems).size, allItems.length);
  for (const round of form.rounds) {
    const selected = new Set(round.study.map(item => item.itemId));
    assert.strictEqual(selected.size, round.count);
    assert.strictEqual(round.recognitionTrials.length, round.count);
    assert.deepStrictEqual(Object.keys(round.pictures).sort(), [...selected].sort());
    assert(round.study.every(item => round.pictures[item.itemId] === item.pictureAsset));
    if (round.round > 0) {
      const words = round.study.map(item => item.word);
      const mix = [
        words.filter(word => [...word].length <= 5).length,
        words.filter(word => [...word].length >= 6 && [...word].length <= 7).length,
        words.filter(word => [...word].length >= 8).length
      ];
      assert.deepStrictEqual(mix, expectedLengthMix[round.round - 1]);
    }
    for (const trial of round.recognitionTrials) {
      assert.strictEqual(trial.optionPictureIds.length, 4);
      assert.strictEqual(new Set(trial.optionPictureIds).size, 4);
      assert(trial.optionPictureIds.every(id => selected.has(id)));
      assert.strictEqual(trial.optionPictureIds[trial.correctOptionIndex], trial.itemId);
    }
  }
}
assert.strictEqual(firstRoundKeys.size, 8640);
console.log('Spanish picture bank: 70 unique items, fixed length mix and 8640 distinct reproducible forms checked.');
