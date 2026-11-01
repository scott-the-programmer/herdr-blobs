import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load = async path => import(`data:text/javascript,${encodeURIComponent(readFileSync(new URL(path, import.meta.url), 'utf8'))}`);
const { arrange } = await load('../mods/blob-garden/geometry.js');
const { pinAt, positionField } = await load('../mods/blob-garden/positions.js');

test('dragged positions follow pointer beyond fit bounds at every camera zoom', () => {
  const world = arrange([{ address: 't1' }, { address: 't2' }], 950, 400);
  const pan = { x: 120, y: -40 };
  for (const zoom of [0.1, 0.6, 1, 4]) {
    for (const target of [{ x: 20, y: 20 }, { x: 900, y: 350 }, { x: -200, y: 800 }]) {
      const x = (target.x - pan.x - world.width / 2 * (1 - zoom)) / zoom;
      const y = (target.y - pan.y - world.height / 2 * (1 - zoom)) / zoom;
      const pins = { t1: pinAt(x, y, world) };
      const placed = positionField(world, pins, pan, zoom).placed.find(p => p.a.address === 't1');
      assert(Math.abs(placed.x - target.x) < 0.000001, `x wall at zoom ${zoom}`);
      assert(Math.abs(placed.y - target.y) < 0.000001, `y wall at zoom ${zoom}`);
    }
  }
});

test('dragged positions retain proportional coordinates after resize', () => {
  const field = arrange([{ address: 't1' }], 950, 400);
  const pin = pinAt(-100, 9999, field);
  assert(pin.x < 0 && pin.y > 1);
  for (const [width, height] of [[950, 400], [300, 150], [100, 80]]) {
    const resized = arrange([{ address: 't1' }], width, height);
    const p = positionField(resized, { t1: pin }).placed[0];
    const restored = pinAt(p.x, p.y, resized);
    assert(Math.abs(restored.x - pin.x) < 0.000001);
    assert(Math.abs(restored.y - pin.y) < 0.000001);
  }
});

test('canvas panning translates cells and full orbital paths together', () => {
  const field = arrange([{ address: 't1' }, { address: 't2' }], 950, 400);
  const moved = positionField(field, {}, { x: 120, y: -40 });
  for (let i = 0; i < field.placed.length; i++) {
    assert.equal(moved.placed[i].x, field.placed[i].x + 120);
    assert.equal(moved.placed[i].orbit.left.from, field.placed[i].orbit.left.from + 120);
    assert.equal(moved.placed[i].orbit.top.to, field.placed[i].orbit.top.to - 40);
  }
});

test('camera zoom scales pinned and unpinned positions, spacing, and orbits together', () => {
  const world = arrange([{ address: 't1' }, { address: 't2' }], 950, 400);
  const pins = { t1: { x: 0.8, y: 0.2 } };
  const fit = positionField(world, pins);
  for (const zoom of [0.1, 0.6, 1.7, 4]) {
    const view = positionField(world, pins, { x: 31, y: -17 }, zoom);
    assert.equal(view.cellWidth, fit.cellWidth * zoom);
    assert.equal(view.cellHeight, fit.cellHeight * zoom);
    for (let i = 0; i < fit.placed.length; i++) {
      const p = fit.placed[i], q = view.placed[i];
      assert.equal(q.x, p.x * zoom + 475 * (1 - zoom) + 31);
      assert.equal(q.y, p.y * zoom + 200 * (1 - zoom) - 17);
      assert.equal(q.orbit.left.from, p.orbit.left.from * zoom + 475 * (1 - zoom) + 31);
    }
  }
});
