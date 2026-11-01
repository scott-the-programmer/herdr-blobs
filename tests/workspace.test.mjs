import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const helpers = readFileSync(new URL('../mods/blob-workspace/state.js', import.meta.url), 'utf8');
const { findNode } = await import(`data:text/javascript,${encodeURIComponent(helpers)}`);
const source = readFileSync(new URL('../mods/blob-workspace/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default class BlobWorkspace', 'globalThis.BlobWorkspace = class BlobWorkspace');
const layoutSource = readFileSync(new URL('../layouts/blobs.json', import.meta.url), 'utf8');

function setup() {
  const calls = [], tasks = [];
  let tree = JSON.parse(layoutSource), picked = '/new/repo', role = 'test';
  const spaces = [
    { id: 's1', name: 'Local', active: true, folder: '/repo', tabs: [{ id: 'tab1', active: true }] },
    { id: 'remote/s2', name: 'Remote', machine: 'remote', folder: '/remote/repo', tabs: [{ id: 'remote/tab2', active: true }] }
  ];
  const cx = { notify() {}, spawn(fn) { tasks.push(Promise.resolve().then(() => fn(cx))); } };
  const sandbox = { View: class {}, findNode,
    spaces: () => spaces, layout: () => structuredClone(tree),
    props: () => (role === 'test' ? { role } : { role, space: 's1', name: 'Local', overlay: 'o1' }),
    pickFolder: async () => picked,
    run(name, args) {
      calls.push([name, args]);
      if (name === 'layout.hide' || name === 'layout.show') findNode(tree, args.id).hidden = name === 'layout.hide';
      if (name === 'layout.select') findNode(tree, args.stack).active = args.child;
    },
    openOverlay: args => calls.push(['overlay', args]), closeOverlay: id => calls.push(['close', id])
  };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const workspace = new sandbox.BlobWorkspace(); workspace.init({}, cx);
  return { workspace, cx, calls, spaces, tree: () => tree,
    pick(folder) { picked = folder; }, role(r) { role = r; },
    switchSpace() { spaces[0].active = !spaces[0].active; spaces[1].active = !spaces[1].active; }
  };
}

test('files/changes toggle independently', () => {
  const h = setup();
  h.workspace.panel('blob-files');
  assert.equal(findNode(h.tree(), 'blob-panel-stack').active, 'blob-files');
  assert.equal(findNode(h.tree(), 'blob-panel').hidden, false);
  h.workspace.panel('blob-changes');
  assert.equal(findNode(h.tree(), 'blob-panel').hidden, false);
  h.workspace.panel('blob-changes');
  assert.equal(findNode(h.tree(), 'blob-panel').hidden, true);
});

test('worktree menu toggles and each action opens the dialog for the active space', async () => {
  const h = setup();
  await h.workspace.command('worktree', h.cx);
  assert.equal(h.workspace.worktreeMenu, true);
  h.switchSpace();
  for (const action of ['new', 'open', 'remove']) {
    await h.workspace.command(`worktree-${action}`, h.cx);
    const [name, args] = h.calls.at(-1);
    assert.equal(name, 'overlay');
    assert.equal(args.mod, 'worktree');
    assert.equal(args.props.space, 'remote/s2');
    assert.equal(args.props.action, action);
  }
  assert.equal(h.workspace.worktreeMenu, false);
});

test('+ Space creates a space from the picked folder and ignores cancel', async () => {
  const h = setup();
  await h.workspace.command('space-new', h.cx);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1))), ['space.new', { folder: '/new/repo' }]);
  h.calls.length = 0; h.pick(null);
  await h.workspace.command('space-new', h.cx);
  assert(!h.calls.some(([name]) => name === 'space.new'));
});

test('removing a space asks first and closes only on confirm', () => {
  const h = setup();
  h.workspace.confirmClose(h.spaces[1]);
  const [name, args] = h.calls.at(-1);
  assert.equal(name, 'overlay');
  assert.equal(args.props.role, 'close-space');
  assert.equal(args.props.space, 'remote/s2');
  assert(!h.calls.some(([n]) => n === 'space.close'));
});

test('workspace occupies main area while terminal section holds only tabs and terminal', () => {
  const tree = JSON.parse(layoutSource), main = findNode(tree, 'blob-main'), session = findNode(tree, 'session');
  for (const id of ['blob-workspace-toolbar', 'blob-panel', 'garden-board']) {
    assert(findNode(main, id));
    assert.equal(findNode(session, id), null);
  }
  assert.equal(findNode(tree, 'blob-desk'), null);
  assert.deepEqual(session.children.map(c => c.id), ['session-label', 'session-terminal']);
});
