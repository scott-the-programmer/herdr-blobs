import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const codexSource = readFileSync(new URL('../mods/blob-garden/codex.js', import.meta.url), 'utf8');
const { readCounters, parseListing, matchSessions, parseCounter } = await import(`data:text/javascript,${encodeURIComponent(codexSource)}`);

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const meta = (id, cwd, extra = {}) => JSON.stringify({ timestamp: '2026-11-01T00:00:00Z', type: 'session_meta', payload: { id, cwd, ...extra } });
const count = (used, limit = 200000) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count',
  info: { total_token_usage: { total_tokens: used * 9 }, last_token_usage: { total_tokens: used }, model_context_window: limit } } });
const message = text => JSON.stringify({ type: 'response_item', payload: { type: 'message', content: [{ type: 'output_text', text }] } });

// A fake CODEX_HOME with real rollout layout; returns a runner that executes the mod's shell scripts with sh.
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'blob-codex-'));
  const day = join(home, 'sessions', '2026', '11', '01');
  mkdirSync(day, { recursive: true });
  const write = (id, lines, age) => {
    const file = join(day, `rollout-2026-11-01T00-00-00-${id}.jsonl`);
    writeFileSync(file, lines.join('\n') + '\n');
    const when = Date.now() / 1000 - age;
    utimesSync(file, when, when);
    return file;
  };
  const run = (script, args) => {
    const result = spawnSync('sh', ['-c', script, 'sh', ...args], { encoding: 'utf8', env: { ...process.env, CODEX_HOME: home } });
    return Promise.resolve({ code: result.status, stdout: result.stdout });
  };
  return { home, write, run, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test('reader matches by session label or unique directory and returns only counters', async () => {
  const { write, run, cleanup } = fixture();
  try {
    write(ids[0], [meta(ids[0], '/work/alpha'), count(50000), message('secret prompt text'), count(91000, 272000)], 30);
    write(ids[1], [meta(ids[1], '/work/alpha'), count(12000)], 300);
    write(ids[2], [meta(ids[2], '/work/shared'), count(70000)], 20);
    // A first line longer than the 64 KiB window still yields its id and directory.
    write(ids[3], [meta(ids[3], '/work/beta', { instructions: 'x'.repeat(70000) }), count(40000)], 10);
    const result = await readCounters([
      { address: 't1', cwd: '/work/alpha/' },
      { address: 't2', cwd: '/work/shared' }, { address: 't3', cwd: '/work/shared' },
      { address: 't4', cwd: '/elsewhere', session: ids[3] },
      { address: 't5', cwd: '/work/missing' }
    ], run);
    assert.deepEqual(result, { t1: { used: 91000, limit: 272000 }, t4: { used: 40000, limit: 200000 } });
    assert(!JSON.stringify(result).includes('secret'));
  } finally { cleanup(); }
});

test('reader follows compaction and reports unknown until the next counter', async () => {
  const { write, run, cleanup } = fixture();
  try {
    const compacted = JSON.stringify({ type: 'compacted', payload: { message: 'summary' } });
    const file = write(ids[0], [meta(ids[0], '/work/alpha'), count(180000), compacted], 5);
    const target = [{ address: 't1', session: ids[0] }];
    assert.deepEqual(await readCounters(target, run), {});
    writeFileSync(file, [meta(ids[0], '/work/alpha'), count(180000), compacted, count(22000)].join('\n') + '\n');
    assert.deepEqual(await readCounters(target, run), { t1: { used: 22000, limit: 200000 } });
  } finally { cleanup(); }
});

test('reader scans only the last 8 MiB and tolerates a missing Codex home', async () => {
  const { home, write, run, cleanup } = fixture();
  try {
    write(ids[0], [meta(ids[0], '/work/alpha'), count(99000), message('y'.repeat(9 * 1024 * 1024))], 5);
    assert.deepEqual(await readCounters([{ address: 't1', session: ids[0] }], run), {});
    rmSync(home, { recursive: true, force: true });
    assert.deepEqual(await readCounters([{ address: 't1', session: ids[0] }], run), {});
  } finally { cleanup(); }
});

test('reader rejects malformed records and never matches ambiguous directories', () => {
  for (const line of ['', '{', 'null', JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: null } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: -1 }, model_context_window: 1 } } })])
    assert.equal(parseCounter(line), null);
  const sessions = parseListing(`/s/a.jsonl\t${meta(ids[0], '/x')}\n/s/b.jsonl\tnot json\n\n`);
  assert.deepEqual(sessions, [{ file: '/s/a.jsonl', id: ids[0], cwd: '/x' }]);
  assert.deepEqual(matchSessions([{ address: 't1', cwd: '/x' }, { address: 't2', cwd: '/x/' }], sessions), {});
});
