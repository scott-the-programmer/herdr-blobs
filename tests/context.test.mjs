import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const source = readFileSync(new URL('../mods/blob-garden/context.js', import.meta.url), 'utf8');
const { contextSize, terminalDirectory, directoryLabel } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('area follows real context fraction; compaction shrinks and unknown stays minimum', () => {
  const low = contextSize({ used: 20000, limit: 200000 });
  const high = contextSize({ used: 180000, limit: 200000 });
  assert(high.diameter > low.diameter);
  assert.match(low.label, /20k tokens · 10%/);
  assert.equal(contextSize({ used: 999999, limit: 200000 }).diameter, 144);
  assert.equal(contextSize(null).diameter, 81);
  assert.equal(contextSize(null).label, 'Context unknown');
  assert.equal(contextSize({ used: NaN, limit: 200000 }).known, false);
  const half = contextSize({ used: 100000, limit: 200000 });
  assert(Math.abs(half.diameter ** 2 - (81 ** 2 + 144 ** 2) / 2) < 0.00001);
});

test('directory label follows foreground program instead of shared space or stale shell cwd', () => {
  assert.equal(terminalDirectory({ cwd: '/old/terraform-provider-minikube', foreground: { cwd: '/work/herdr-blobs' } }), '/work/herdr-blobs');
  assert.equal(directoryLabel('/work/herdr-blobs'), 'work/herdr-blobs');
  assert.equal(directoryLabel('C:\\work\\other-project'), 'work/other-project');
  assert.equal(directoryLabel(null), 'Directory unknown');
});

test('reader returns only exact session counters and respects compaction', () => {
  const result = spawnSync('python3', [fileURLToPath(new URL('./context_reader_test.py', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
