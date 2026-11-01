import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as demo from '../demo/workspace.mjs';

const script = fileURLToPath(new URL('../demo/workspace.mjs', import.meta.url));

// Fake Herdr: records every app command and hc call, answers with fresh IDs.
function herdr({ space = 'main-space', codex = true } = {}) {
  const calls = [], core = [], printed = [], kills = [];
  const io = {
    output(file, args) {
      if (file === 'herdr-app' && args[0] === 'status') return JSON.stringify(space ? { space } : {});
      if (file === 'herdr-app' && args[0] === 'do') {
        calls.push([args[1], JSON.parse(args[2])]);
        return JSON.stringify({ space: 'new-space', tab: `tab${calls.length}`, terminal: `t${calls.length}` });
      }
      core.push(args);
      return args[0] === 'get' ? JSON.stringify({ reported: true, foreground: { pid: 4242 } }) : '{}';
    },
    which: name => codex && name === 'codex',
    kill: (pid, signal) => kills.push([pid, signal]),
    print: text => printed.push(text),
    error() {},
  };
  return { io, calls, core, printed, kills };
}

test('default has eight varied blobs', () => {
  const config = demo.validate(demo.preset());
  assert.equal(config.blobs.length, 8);
  assert.equal(config.zoom, 0.6);
  assert.deepEqual(new Set(config.blobs.map(b => b.type)), new Set(demo.TYPES));
  assert.deepEqual(new Set(config.blobs.map(b => b.status)), new Set(demo.STATES));
  assert.equal(new Set(config.blobs.map(b => `${b.x},${b.y}`)).size, 8);
  assert(Math.max(...config.blobs.map(b => b.limit)) >= 1000000);
  assert.equal(new Set(config.blobs.map(b => b.used / b.limit)).size, 5);
});

test('default spreads blobs without aligned rows or columns', () => {
  const blobs = demo.preset().blobs;
  for (const axis of ['x', 'y']) {
    assert.equal(new Set(blobs.map(b => b[axis])).size, blobs.length);
    const values = blobs.map(b => b[axis]);
    assert(Math.max(...values) - Math.min(...values) > 0.6);
  }
  let nearest = Infinity;
  blobs.forEach((a, i) => blobs.slice(i + 1).forEach(b => { nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y)); }));
  assert(nearest > 0.13);
  assert.deepEqual(blobs, demo.preset().blobs);
  for (const count of [1, 6, 100]) assert.equal(demo.validate(demo.preset(count)).blobs.length, count);
});

test('bad config never opens sessions', () => {
  const config = demo.preset();
  config.blobs[0].used = -1;
  assert.throws(() => demo.validate(config), /Context must satisfy/);
  const fake = herdr();
  fake.io.readFile = () => JSON.stringify(config);
  assert.throws(() => demo.main(['--config', 'bad.json'], fake.io), /Context must satisfy/);
  assert.equal(fake.calls.length, 0);
  assert.equal(fake.core.length, 0);
  for (const title of ['', 'a:b', 'tab\there']) {
    const bad = demo.preset(1); bad.blobs[0].title = title;
    assert.throws(() => demo.validate(bad), /Titles/);
  }
});

test('creates and labels exactly eight sessions in the active space', () => {
  const fake = herdr();
  demo.main([], fake.io);
  assert.equal(fake.calls.filter(([name]) => name === 'space.new').length, 0);
  const tabs = fake.calls.filter(([name]) => name === 'tab.new');
  assert.equal(tabs.length, 8);
  assert(tabs.every(([, args]) => args.space === 'main-space'));
  const result = JSON.parse(fake.printed.at(-1));
  assert.equal(result.space, 'main-space');
  assert.equal(result.created_space, false);
  const labels = fake.core.filter(args => args[0] === 'label');
  assert.equal(labels.length, 8);
  assert.equal(JSON.parse(labels[0][2].slice('blob.demo='.length)).zoom, 0.6);
  assert(labels.every(args => args[2].startsWith('blob.demo=')));
  assert.equal(fake.kills.length, 8);
  assert.equal(tabs[0][1].argv[0], process.execPath);
});

test('creates a space only when none is active', () => {
  const fake = herdr({ space: null });
  demo.main(['--count', '2'], fake.io);
  assert.deepEqual(fake.calls.map(([name]) => name), ['space.new', 'tab.new', 'tab.select']);
  assert.equal(fake.calls[1][1].space, 'new-space');
  assert.equal(JSON.parse(fake.printed.at(-1)).created_space, true);
});

test('live mode launches read-only agents without script signals', () => {
  const fake = herdr();
  demo.main(['--live', '--count', '2'], fake.io);
  const launches = fake.calls.filter(([name]) => name === 'space.new' || name === 'tab.new');
  assert.equal(launches.length, 2);
  assert(launches.every(([name, args]) => name === 'tab.new' && args.space === 'main-space'));
  for (const [, { argv }] of launches) {
    assert.equal(argv[0], 'codex');
    assert(argv.includes('--no-daemon'));
    assert.equal(argv[argv.indexOf('--sandbox') + 1], 'read-only');
    assert.match(argv.at(-1), /do not edit files/);
  }
  assert.equal(fake.kills.length, 0);
  assert.throws(() => demo.main(['--live'], herdr({ codex: false }).io), /requires Codex/);
});

test('command line prints a dry run and rejects bad counts', () => {
  const dry = spawnSync(process.execPath, [script, '--dry-run', '--count', '3'], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(dry.stdout).blobs.length, 3);
  const bad = spawnSync(process.execPath, [script, '--count', '0'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--count must be between 1 and 100/);
});
