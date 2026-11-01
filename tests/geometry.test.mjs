import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../mods/blob-garden/geometry.js', import.meta.url), 'utf8');
const { arrange } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

for (const count of [1, 7, 20, 64]) {
  test(`${count} agents remain visible without overlap across narrow and short fields`, () => {
    const agents = Array.from({ length: count }, (_, i) => ({ address: `t${i}`, status: 'working' }));
    for (const [width, height] of [[950, 110], [950, 400], [280, 170], [100, 80]]) {
      const field = arrange(agents, width, height);
      assert.equal(field.placed.length, count);
      assert.equal(new Set(field.placed.map(p => p.a.address)).size, count);
      for (const p of field.placed) {
        assert(p.x >= -0.001 && p.y >= -0.001);
        assert(p.x + field.cellWidth <= width + 0.001, `horizontal clipping at ${width}x${height}`);
        assert(p.y + field.cellHeight <= height + 0.001, `vertical clipping at ${width}x${height}`);
        for (const q of field.placed) if (p !== q) {
          assert(p.x + field.cellWidth <= q.x + 0.001 || q.x + field.cellWidth <= p.x + 0.001 ||
            p.y + field.cellHeight <= q.y + 0.001 || q.y + field.cellHeight <= p.y + 0.001, 'overlap');
        }
      }
      const changed = arrange(agents.map(a => ({ ...a, status: 'idle' })), width, height);
      assert.deepEqual(changed.placed.map(({ x, y }) => [x, y]), field.placed.map(({ x, y }) => [x, y]));
    }
  });
}

test('native orbital paths keep full labels in bounds and avoid neighboring paths', () => {
  const agents = Array.from({ length: 20 }, (_, i) => ({ address: `t${i}` }));
  for (const [width, height] of [[950, 110], [950, 400], [280, 170]]) {
    const field = arrange(agents, width, height);
    const envelopes = field.placed.map(p => ({
      x: Math.min(p.orbit.left.from, p.orbit.left.to), y: Math.min(p.orbit.top.from, p.orbit.top.to),
      right: Math.max(p.orbit.left.from, p.orbit.left.to) + field.cellWidth,
      bottom: Math.max(p.orbit.top.from, p.orbit.top.to) + field.cellHeight
    }));
    for (const e of envelopes) {
      assert(e.x >= -0.001 && e.y >= -0.001 && e.right <= width + 0.001 && e.bottom <= height + 0.001);
      for (const f of envelopes) if (e !== f) assert(e.right <= f.x || f.right <= e.x || e.bottom <= f.y || f.bottom <= e.y);
    }
    assert(field.placed.every(p => p.orbit.left.period >= 45000 && p.orbit.left.period <= 57000 &&
      p.orbit.top.period >= 60000 && p.orbit.top.period <= 72000));
  }
});

test('zoom scales cells and orbital paths while keeping all content reachable without overlap', () => {
  const agents = Array.from({ length: 20 }, (_, i) => ({ address: `t${i}` }));
  const fit = arrange(agents, 280, 170);
  for (const zoom of [0.5, 1.1, 2]) {
    const field = arrange(agents, 280, 170, zoom);
    assert.equal(field.scale, fit.scale * zoom);
    assert.equal(field.cellWidth, fit.cellWidth * zoom);
    if (zoom > 1) assert(field.width > 280 || field.height > 170, 'zoomed content can be scrolled');
    const envelopes = field.placed.map(p => ({
      left: p.orbit.left.from, right: p.orbit.left.to + field.cellWidth,
      top: p.orbit.top.to, bottom: p.orbit.top.from + field.cellHeight
    }));
    for (const e of envelopes) {
      assert(e.left >= 0 && e.top >= 0 && e.right <= field.width && e.bottom <= field.height);
      for (const f of envelopes) if (e !== f) assert(e.right <= f.left || f.right <= e.left || e.bottom <= f.top || f.bottom <= e.top);
    }
  }
});
