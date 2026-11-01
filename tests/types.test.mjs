import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../mods/blob-garden/types.js', import.meta.url), 'utf8');
const { TYPES, typeForRoll, blobType } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('all roll boundaries produce exact type and rarity odds', () => {
  const counts = new Map(TYPES.map(type => [type.id, 0]));
  const rarities = {};
  for (let roll = 0; roll < 10000; roll++) {
    const type = typeForRoll(roll);
    counts.set(type.id, counts.get(type.id) + 1);
    rarities[type.rarity] = (rarities[type.rarity] || 0) + 1;
  }
  for (const type of TYPES) assert.equal(counts.get(type.id), type.weight);
  assert.deepEqual(rarities, { Common: 8500, Rare: 1400, 'Ultra rare': 100 });
  for (const invalid of [-1, 10000, NaN, 0.5]) assert.throws(() => typeForRoll(invalid), RangeError);
});

test('address assignments survive reload and distribute across sequential addresses', async () => {
  const reloaded = await import(`data:text/javascript,${encodeURIComponent(source)}#reload`);
  const counts = Object.fromEntries(TYPES.map(type => [type.id, 0]));
  for (let i = 0; i < 20000; i++) {
    const address = `local/t${i}`;
    const type = blobType(address);
    assert.equal(type.id, reloaded.blobType(address).id);
    counts[type.id]++;
  }
  for (const type of TYPES) assert(Math.abs(counts[type.id] / 20000 - type.weight / 10000) < 0.015, `${type.id} distribution`);
});
