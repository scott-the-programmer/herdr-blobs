import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load = async path => import(`data:text/javascript,${encodeURIComponent(readFileSync(new URL(path, import.meta.url), 'utf8'))}`);
const { arrange } = await load('../mods/blob-garden/geometry.js');
const { pinAt, positionField, attachField, descendants, tidyPins } = await load('../mods/blob-garden/positions.js');

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

test('sub-agents drift in lockstep with their root ancestor and get one tether per parent link', () => {
  const list = [{ address: 'p' }, { address: 'c', parent: 'p' }, { address: 'g', parent: 'c' }, { address: 'solo' }];
  const field = attachField(positionField(arrange(list, 950, 400), {}, { x: 30, y: -10 }, 0.8));
  const at = address => field.placed.find(p => p.a.address === address);
  const root = at('p');
  for (const address of ['c', 'g']) {
    const p = at(address);
    assert.equal(p.orbit.left.period, root.orbit.left.period);
    assert.equal(p.orbit.top.period, root.orbit.top.period);
    assert(Math.abs(p.orbit.left.from - p.x - (root.orbit.left.from - root.x)) < 1e-9);
    assert(Math.abs(p.orbit.top.to - p.y - (root.orbit.top.to - root.y)) < 1e-9);
  }
  const links = field.tethers.map(t => `${t.parent.a.address}>${t.child.a.address}`).sort();
  assert.deepEqual(links, ['c>g', 'p>c']);
  assert.equal(field.tethers[0].drift.left.from, root.orbit.left.from - root.x);
  const plain = positionField(arrange(list, 950, 400), {}, { x: 30, y: -10 }, 0.8);
  assert.deepEqual(at('solo').orbit, plain.placed.find(p => p.a.address === 'solo').orbit, 'unrelated blobs keep their own drift');
  assert.deepEqual(descendants(field.placed, 'p').sort(), ['c', 'g']);
  assert.deepEqual(descendants(field.placed, 'c'), ['g']);
  assert.deepEqual(descendants(field.placed, 'solo'), []);
});

test('parent cycles do not hang attachment or descendant search', () => {
  const list = [{ address: 'a', parent: 'b' }, { address: 'b', parent: 'a' }];
  const field = attachField(positionField(arrange(list, 950, 400)));
  assert.equal(field.tethers.length, 2);
  assert.deepEqual(descendants(field.placed, 'a'), ['b']);
});

test('tidy gathers lost blobs into the current view without moving the camera', () => {
  const list = ['t1', 't2', 't3', 't4'].map(address => ({ address }));
  const world = arrange(list, 950, 400);
  const lost = { t1: { x: -40, y: 30 }, t2: { x: 55, y: -12 } };
  for (const zoom of [0.3, 1]) {
    const pan = { x: 900, y: -350 };
    const before = positionField(world, lost, pan, zoom).placed;
    assert(before.some(p => p.x > 950 || p.x < 0 || p.y > 400 || p.y < 0), 'fixture blobs start out of view');
    for (const random of [() => 0, () => 0.5, () => 0.999999, Math.random]) {
      const view = positionField(world, tidyPins(world, pan, zoom, random), pan, zoom);
      for (const p of view.placed) {
        assert(p.x >= 0 && p.x + view.cellWidth <= 950 && p.y >= 0 && p.y + view.cellHeight <= 400 * Math.max(1, zoom) + 1e-6,
          `blob in view at zoom ${zoom}: ${p.x},${p.y}`);
      }
      // Blobs in one row keep enough room for their labels.
      for (const a of view.placed) for (const b of view.placed) {
        if (a !== b && Math.abs(a.y - b.y) < view.cellHeight) assert(Math.abs(a.x - b.x) >= view.cellWidth * 0.9, 'labels clear');
      }
    }
  }
});

test('tidy scatters a single row instead of lining blobs up', () => {
  const list = ['t1', 't2', 't3'].map(address => ({ address }));
  const world = arrange(list, 1200, 700);
  let n = 0;
  const random = () => [0.05, 0.95, 0.5, 0.1, 0.9, 0.3][n++ % 6];
  const ys = positionField(world, tidyPins(world, undefined, 1, random)).placed.map(p => p.y);
  assert(Math.max(...ys) - Math.min(...ys) > 100, `rows spread vertically: ${ys}`);
  const a = tidyPins(world, undefined, 1, () => 0.2), b = tidyPins(world, undefined, 1, () => 0.8);
  assert.notDeepEqual(a, b, 'each tidy draws a new scatter');
});
