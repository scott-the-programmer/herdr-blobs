import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../mods/blob-garden/demo.js', import.meta.url), 'utf8');
const { demoProperties } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('demo labels require explicit opt-in and reject invalid override fields', () => {
  for (const value of [undefined, '', '{', 'null', '[]', '{"type":"cosmic"}'])
    assert.equal(demoProperties({ 'blob.demo': value }), null);
  const result = demoProperties({ 'blob.demo': JSON.stringify({
    run: 'demo', type: 'fake', used: -1, limit: 0, zoom: 9, x: -2, y: 3
  }) });
  assert.deepEqual(result, { run: 'demo', pin: { x: 0, y: 1 } });
});
