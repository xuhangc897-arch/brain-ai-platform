const fs = require('fs');
const path = require('path');

const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'spanish-picture-bank.json'), 'utf8'));
const FIRST_ROUND_VARIANTS = 8640; // (5P3) × (4P3) × (3P2)
const ROUND_LENGTH_QUOTAS = { 2: [4, 3, 3], 3: [5, 4, 3], 4: [6, 4, 4] };

function lengthGroup(item) {
  const length = [...item.word].length;
  return length <= 5 ? 0 : length <= 7 ? 1 : 2;
}

function shuffle(items, seed) {
  const result = items.slice();
  let state = seed >>> 0 || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function orderedSelection(items, count, rank) {
  const remaining = items.slice();
  const selected = [];
  for (let i = 0; i < count; i++) {
    const position = rank % remaining.length;
    rank = Math.floor(rank / remaining.length);
    selected.push(remaining.splice(position, 1)[0]);
  }
  return selected;
}

function firstRoundItems(items, formId) {
  let rank = (formId * 37 + 19) % FIRST_ROUND_VARIANTS;
  const groups = [0, 1, 2].map(group => items.filter(item => lengthGroup(item) === group));
  const short = orderedSelection(groups[0], 3, rank % 60);
  rank = Math.floor(rank / 60);
  const medium = orderedSelection(groups[1], 3, rank % 24);
  rank = Math.floor(rank / 24);
  const long = orderedSelection(groups[2], 2, rank);
  const selected = [short, medium, long];
  const indices = [0, 0, 0];
  return shuffle([0, 0, 0, 1, 1, 1, 2, 2], formId + 9029)
    .map(group => selected[group][indices[group]++]);
}

function laterRoundItems(items, round, formId) {
  const selected = ROUND_LENGTH_QUOTAS[round].flatMap((count, group) => {
    const candidates = items.filter(item => lengthGroup(item) === group);
    return shuffle(candidates, Math.imul(formId + 1, 2654435761) ^ Math.imul(round * 3 + group + 1, 1597334677))
      .slice(0, count);
  });
  return shuffle(selected, formId ^ (round * 104729 + 7));
}

function makeRound(round, formId) {
  const pool = bank.items.filter(item => item.round === round);
  const count = round === 0 ? bank.practiceCount : bank.roundCounts[round - 1];
  const selected = round === 1
    ? firstRoundItems(pool, formId)
    : round === 0 ? shuffle(pool, formId + 1) : laterRoundItems(pool, round, formId);
  const study = selected.map(item => ({ itemId: item.id, word: item.word, pictureId: item.id, pictureAsset: item.pictureAsset }));
  const pictures = Object.fromEntries(selected.map(item => [item.id, item.pictureAsset]));
  const jolOrder = shuffle(selected.map(item => item.id), formId ^ (round * 104729 + 11));
  const restudyDisplayOrder = shuffle(selected.map(item => item.id), formId ^ (round * 104729 + 23));
  const testOrder = shuffle(selected, formId ^ (round * 104729 + 37));
  const recognitionTrials = testOrder.map((item, index) => {
    const choices = [item, ...[1, 2, 3].map(offset => testOrder[(index + offset) % count])];
    const options = shuffle(choices.map(choice => choice.id), formId ^ (round * 104729 + index * 101 + 53));
    return {
      itemId: item.id,
      word: item.word,
      optionPictureIds: options,
      correctOptionIndex: options.indexOf(item.id)
    };
  });
  const withdrawalOrder = shuffle(selected.map(item => item.id), formId ^ (round * 104729 + 71));
  return { round, count, study, pictures, jolOrder, restudyDisplayOrder, recognitionTrials, withdrawalOrder };
}

function createForm(formId) {
  if (!Number.isSafeInteger(formId) || formId < 0 || formId >= FIRST_ROUND_VARIANTS) {
    throw new RangeError(`formId must be an integer from 0 to ${FIRST_ROUND_VARIANTS - 1}`);
  }
  return { bankVersion: bank.version, formId, rounds: [0, 1, 2, 3, 4].map(round => makeRound(round, formId)) };
}

if (require.main === module) {
  const formId = Number(process.argv[2]);
  process.stdout.write(`${JSON.stringify(createForm(formId), null, 2)}\n`);
}

module.exports = { createForm };
