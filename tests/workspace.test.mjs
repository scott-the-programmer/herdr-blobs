import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const helpers = readFileSync(new URL('../mods/blob-workspace/state.js', import.meta.url), 'utf8');
const { findNode, spaceFor, finished } = await import(`data:text/javascript,${encodeURIComponent(helpers)}`);
const source = readFileSync(new URL('../mods/blob-workspace/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default class BlobWorkspace', 'globalThis.BlobWorkspace = class BlobWorkspace');
const layoutSource = readFileSync(new URL('../layouts/blobs.json', import.meta.url), 'utf8');

function setup() {
  const calls = [], tasks = [], saved = new Map();
  let tree = JSON.parse(layoutSource);
  const spaces = [
    { id: 's1', name: 'Local', active: true, folder: '/repo', tabs: [{ id: 'tab1', active: true }] },
    { id: 'remote/s2', name: 'Remote', machine: 'remote', folder: '/remote/repo', tabs: [{ id: 'remote/tab2', active: true }] }
  ];
  const terminals = [
    { address: 't1', state: 'live', status: 'working', cwd: '/repo' },
    { address: 't2', state: 'live', status: 'working', parent: 't1', cwd: '/repo' },
    { address: 'remote/t3', state: 'live', status: 'working', cwd: '/remote/repo' }
  ];
  const panes = [{ tab: 'tab1', terminal: 't1', cwd: '/repo' }, { tab: 'remote/tab2', terminal: 'remote/t3', cwd: '/remote/repo' }];
  const focus = { terminal: 't1' };
  let execute = async cmd => cmd === 'git' ? { code: 0, stdout: ' M file.js\n' } : { code: 1, stdout: '' };
  const cx = { notify() {}, spawn(fn) { tasks.push(Promise.resolve().then(() => fn(cx))); } };
  const sandbox = { View: class {}, Map, Set, findNode, spaceFor, finished,
    spaces: () => spaces, terminals: () => terminals, panes: () => panes, focused: () => focus,
    layout: () => structuredClone(tree), props: () => ({ role: 'test' }),
    localStorage: { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) },
    run(name, args) {
      calls.push([name, args]);
      if (name === 'layout.set') tree = structuredClone(args.layout);
      if (name === 'layout.hide' || name === 'layout.show') findNode(tree, args.id).hidden = name === 'layout.hide';
      if (name === 'layout.select') findNode(tree, args.stack).active = args.child;
    },
    exec: (...args) => { calls.push(['exec', ...args]); return execute(...args); },
    openOverlay: args => calls.push(['overlay', args]), notify: args => calls.push(['notify', args])
  };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const workspace = new sandbox.BlobWorkspace(); workspace.init({}, cx);
  return { workspace, cx, calls, spaces, terminals, panes, focus, saved, tasks,
    tree: () => tree, execute: fn => { execute = fn; },
    async flush() { while (tasks.length) await Promise.all(tasks.splice(0)); },
    switchSpace() { spaces[0].active = !spaces[0].active; spaces[1].active = !spaces[1].active; }
  };
}

test('pinning persists per space, survives tab switches, and unpins without killing', async () => {
  const h = setup(); h.workspace.pin();
  assert.equal(findNode(h.tree(), 'blob-desk').hidden, false);
  assert.equal(findNode(h.tree(), 'blob-desk-stack').active, 'blob-desk-t1');
  h.workspace.syncDesk(h.spaces[0]);
  assert.equal(findNode(h.tree(), 'blob-desk-stack').children.length, 2, 'no duplicate terminal blocks');
  h.switchSpace(); h.workspace.syncDesk(h.spaces[1]);
  assert.equal(findNode(h.tree(), 'blob-desk').hidden, true);
  h.focus.terminal = 'remote/t3'; h.workspace.pin();
  assert.equal(findNode(h.tree(), 'blob-desk-stack').active, 'blob-desk-remote/t3');
  h.switchSpace(); h.workspace.syncDesk(h.spaces[0]);
  assert.equal(findNode(h.tree(), 'blob-desk-stack').active, 'blob-desk-t1');
  await h.workspace.command('unpin', h.cx);
  assert.equal(findNode(h.tree(), 'blob-desk').hidden, true);
  assert(!h.calls.some(([name]) => name === 'terminal.kill'));
  assert.equal(JSON.parse(h.saved.get('desks-v1'))['remote/s2'], 'remote/t3');
});

test('ended pins hide desk and cannot pin another space accidentally', () => {
  const h = setup(); h.focus.terminal = 'remote/t3'; h.workspace.pin();
  assert.equal(h.workspace.pins.s1, undefined);
  h.focus.terminal = 't1'; h.workspace.pin(); h.terminals[0].state = 'exited';
  h.workspace.syncDesk(h.spaces[0]);
  assert.equal(findNode(h.tree(), 'blob-desk').hidden, true);
  assert.equal(findNode(h.tree(), 'blob-desk-stack').children.length, 1);
});

test('files/changes toggle independently and worktree actions preserve space identity', () => {
  const h = setup();
  h.workspace.panel('blob-files');
  assert.equal(findNode(h.tree(), 'blob-panel-stack').active, 'blob-files');
  assert.equal(findNode(h.tree(), 'blob-panel').hidden, false);
  h.workspace.panel('blob-changes');
  assert.equal(findNode(h.tree(), 'blob-panel').hidden, false);
  h.workspace.panel('blob-changes');
  assert.equal(findNode(h.tree(), 'blob-panel').hidden, true);
  h.switchSpace(); h.workspace.worktree('new');
  assert.equal(h.calls.at(-1)[1].props.space, 'remote/s2');
  assert.equal(h.calls.at(-1)[1].props.action, 'new');
});

test('completion review skips initial done, sub-agents, repeats, and clean trees', async () => {
  const h = setup(); h.terminals[0].status = 'done';
  h.workspace.observe(h.cx); await h.flush();
  assert(!h.calls.some(([name]) => name === 'exec'));
  h.terminals[1].status = 'done'; h.workspace.observe(h.cx); await h.flush();
  assert(!h.calls.some(([name]) => name === 'exec'), 'child completion waits for parent');
  h.terminals[0].status = 'working'; h.workspace.observe(h.cx);
  h.execute(async () => ({ code: 0, stdout: '' }));
  h.terminals[0].status = 'done'; h.workspace.observe(h.cx); await h.flush();
  const count = h.calls.filter(([name]) => name === 'exec').length;
  assert.equal(count, 1);
  h.workspace.observe(h.cx); await h.flush();
  assert.equal(h.calls.filter(([name]) => name === 'exec').length, count);
  assert(!h.calls.some(([name]) => name === 'tab.new'));
});

test('remote completion defers until its space is shown and fallback opens Changes', async () => {
  const h = setup(); h.workspace.observe(h.cx);
  h.terminals[2].status = 'done'; h.workspace.observe(h.cx); await h.flush();
  assert(h.workspace.pending.has('remote/s2'));
  assert(!h.calls.some(([name]) => name === 'exec'));
  h.switchSpace(); h.workspace.observe(h.cx); await h.flush();
  assert.equal(h.calls.find(([name]) => name === 'exec')[3].on, 'remote');
  assert.equal(findNode(h.tree(), 'blob-panel-stack').active, 'blob-changes');
  assert.equal(findNode(h.tree(), 'blob-panel').hidden, false);
});

test('review reuses main-area terminal, avoids duplicate launches, and opens foreign PR explicitly', async () => {
  const h = setup();
  h.terminals.push({ address: 'review-terminal', state: 'live', labels: { 'blob.role': 'review', 'blob.space': 's1' } });
  await h.workspace.review(h.spaces[0]);
  assert.equal(findNode(h.tree(), 'blob-main-stack').active, 'blob-review-review-terminal');
  assert(!h.calls.some(([name]) => name === 'tab.new'));
  h.terminals.pop(); h.calls.length = 0;
  h.execute(async (cmd, args) => {
    if (cmd === 'git') return { code: 0, stdout: ' M file.js' };
    if (cmd === 'tuicr') return { code: 0, stdout: 'tuicr 1' };
    if (cmd === 'hc') return { code: 0, stdout: '{"address":"review-new"}' };
    return { code: 0, stdout: args[0] === 'pr' ? '{"number":42,"author":{"login":"someone"}}' : 'me\n' };
  });
  await Promise.all([h.workspace.review(h.spaces[0]), h.workspace.review(h.spaces[0])]);
  const launches = h.calls.filter(([name, cmd]) => name === 'exec' && cmd === 'hc');
  assert.equal(launches.length, 1);
  assert.deepEqual(Array.from(launches[0][2]).slice(-4), ['tuicr', 'pr', '42', '--no-update-check']);
  assert.equal(findNode(h.tree(), 'blob-main-stack').active, 'blob-review-review-new');
  assert(!h.calls.some(([name]) => name.startsWith('tab.')));
  await h.workspace.command('garden', h.cx);
  assert.equal(findNode(h.tree(), 'blob-main-stack').active, 'garden-board');
});

test('workspace occupies main area while terminal section holds only tabs and terminal', () => {
  const tree = JSON.parse(layoutSource), main = findNode(tree, 'blob-main'), session = findNode(tree, 'session');
  for (const id of ['blob-workspace-toolbar', 'blob-desk', 'blob-panel', 'garden-board']) {
    assert(findNode(main, id));
    assert.equal(findNode(session, id), null);
  }
  assert.deepEqual(session.children.map(c => c.id), ['session-label', 'session-terminal']);
});

test('main-area review follows space changes and remote terminal addresses', async () => {
  const h = setup(); h.switchSpace();
  h.execute(async cmd => {
    if (cmd === 'git') return { code: 0, stdout: ' M file' };
    if (cmd === 'tuicr') return { code: 0, stdout: 'tuicr 1' };
    if (cmd === 'hc') return { code: 0, stdout: '{"address":"t99"}' };
    return { code: 1, stdout: '' };
  });
  await h.workspace.review(h.spaces[1]);
  assert.equal(findNode(h.tree(), 'blob-main-stack').active, 'blob-review-remote/t99');
  assert.equal(h.calls.find(([name, cmd]) => name === 'exec' && cmd === 'hc')[3].on, 'remote');
  h.terminals.push({ address: 'remote/t99', state: 'live', labels: { 'blob.role': 'review', 'blob.space': 'remote/s2' } });
  h.switchSpace(); h.workspace.syncReview(h.spaces[0]);
  assert.equal(findNode(h.tree(), 'blob-main-stack').active, 'garden-board');
  h.switchSpace(); h.workspace.syncReview(h.spaces[1]);
  assert.equal(findNode(h.tree(), 'blob-main-stack').active, 'blob-review-remote/t99');
  h.terminals.pop(); h.workspace.syncReview(h.spaces[1]);
  assert.equal(findNode(h.tree(), 'blob-main-stack').active, 'garden-board');
});

test('auto review toggle clears queued reviews and persists choice', async () => {
  const h = setup(); h.workspace.observe(h.cx);
  h.terminals[2].status = 'done'; h.workspace.observe(h.cx);
  await h.workspace.command('auto-review', h.cx);
  assert.equal(h.workspace.pending.size, 0);
  assert.equal(h.saved.get('auto-review'), 'false');
  h.terminals[0].status = 'done'; h.workspace.observe(h.cx); await h.flush();
  assert(!h.calls.some(([name]) => name === 'exec'));
});

test('switching space during review queues completion without stealing focus', async () => {
  const h = setup();
  let resolve;
  h.execute(() => new Promise(done => { resolve = done; }));
  const reviewing = h.workspace.review(h.spaces[0], true);
  h.switchSpace();
  resolve({ code: 0, stdout: ' M file.js' });
  await reviewing;
  assert.equal(h.workspace.pending.get('s1'), '/repo');
  assert(!h.calls.some(([name]) => name === 'tab.new' || name === 'tab.select' || name === 'layout.show'));
});

test('space resolution supports descendants, remote addresses, and cyclic parents', () => {
  const h = setup();
  assert.equal(spaceFor('t2', h.terminals, h.panes, h.spaces).id, 's1');
  assert.equal(spaceFor('remote/t3', h.terminals, h.panes, h.spaces).id, 'remote/s2');
  assert.equal(spaceFor('cycle', [{ address: 'cycle', parent: 'cycle' }], [], []), null);
  assert.equal(finished(undefined, 'done'), false);
  assert.equal(finished('working', 'idle'), true);
  assert.equal(finished('blocked', 'done'), true);
});
