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
    assert(field.placed.every(p => p.orbit.left.period >= 90000 && p.orbit.top.period >= 120000));
  }
});
