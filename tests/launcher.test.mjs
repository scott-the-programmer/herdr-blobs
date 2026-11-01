import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const optionsSource = readFileSync(new URL('../mods/blob-launcher/options.js', import.meta.url), 'utf8');
const { modes, family, launchRequest } = await import(`data:text/javascript,${encodeURIComponent(optionsSource)}`);
const codex = { key: 'codex', name: 'Codex', installed: true, run: ['/usr/local/bin/codex'] };
const claude = { key: 'claude', name: 'Claude', installed: true, run: ['claude'] };

test('new agent uses a new tab, with folder/model/task preserved as argv data', () => {
  const request = launchRequest(codex, 'default', { space: 'workspace', folder: '/work/my repo', model: 'custom-model', task: 'Fix login' });
  assert.equal(request.command, 'tab.new');
  assert.equal(request.args.space, 'workspace');
  assert.equal(request.args.folder, '/work/my repo');
  assert.equal(request.args.task, 'Fix login');
  assert.deepEqual(request.args.argv, ['/usr/local/bin/codex', '--model', 'custom-model']);
  assert.deepEqual(codex.run, ['/usr/local/bin/codex']);
});

test('Codex modes override conflicting configured permission flags', () => {
  const configured = { ...codex, run: ['codex', '--sandbox=danger-full-access', '-a', 'never', '--yolo', '--model', 'old'] };
  const safe = launchRequest(configured, 'read-only', { model: 'new' }).args.argv;
  assert.deepEqual(safe, ['codex', '--sandbox', 'read-only', '--ask-for-approval', 'on-request', '--model', 'new']);
  assert.deepEqual(launchRequest(codex, 'auto').args.argv, ['/usr/local/bin/codex', '--sandbox', 'workspace-write', '--ask-for-approval', 'never']);
  assert.deepEqual(launchRequest(codex, 'yolo').args.argv, ['/usr/local/bin/codex', '--dangerously-bypass-approvals-and-sandbox']);
});

test('Claude offers plan, accept-edits and explicit YOLO', () => {
  assert(modes(claude).some(m => m.id === 'plan'));
  const configured = { ...claude, run: ['claude', '--dangerously-skip-permissions', '--permission-mode', 'bypassPermissions'] };
  assert.deepEqual(launchRequest(configured, 'auto').args.argv, ['claude', '--permission-mode', 'acceptEdits']);
  assert.deepEqual(launchRequest(claude, 'yolo').args.argv, ['claude', '--dangerously-skip-permissions']);
});

test('unsupported modes and absent agents fail before launch; empty setup creates a space', () => {
  const custom = { key: 'custom', name: 'Custom', installed: true, run: ['my-agent'] };
  assert.equal(family(custom), null);
  assert.deepEqual(modes(custom).map(m => m.id), ['default']);
  assert.throws(() => launchRequest(custom, 'yolo'), /not supported/);
  assert.throws(() => launchRequest({ ...codex, installed: false }, 'default'), /installed agent/);
  assert.equal(launchRequest(codex, 'default').command, 'space.new');
});

test('active tab drives bottom terminal and + Terminal creates a tab', () => {
  const layout = JSON.parse(readFileSync(new URL('../layouts/blobs.json', import.meta.url)));
  const session = layout.children.find(n => n.id === 'session');
  const body = session.children.find(n => n.id === 'session-body');
  assert.deepEqual(body.children.find(n => n.id === 'session-terminal').content, { tab: 'active' });
  assert.equal(session.children[0].content.mod, 'blob-tabs');
  const calls = [];
  function element() {
    const data = { nodes: [], attrs: {} };
    let proxy;
    proxy = new Proxy(data, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'child') data.nodes.push(args[0]);
        else if (key === 'children') data.nodes.push(...args[0]);
        else data.attrs[key] = args;
        return proxy;
      };
    }});
    return proxy;
  }
  const source = readFileSync(new URL('../mods/blob-tabs/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default class BlobTabs', 'globalThis.BlobTabs = class BlobTabs');
  const sandbox = { View: class {}, div: element, h_flex: element,
    spaces: () => [{ id: 'space1', active: true, tabs: [{ id: 'tab1', name: 'Shell', active: true }] }],
    run: (...args) => calls.push(args) };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const flatten = node => typeof node === 'object' && node ? [node, ...node.nodes.flatMap(flatten)] : [];
  const nodes = flatten(new sandbox.BlobTabs().render());
  nodes.find(n => n.attrs.id?.[0] === 'new-terminal-tab').attrs.on_click[0]();
  assert.equal(calls.at(-1)[0], 'tab.new'); assert.equal(calls.at(-1)[1].space, 'space1');
  nodes.find(n => n.attrs.id?.[0] === 'session-tab-tab1').attrs.on_click[0]();
  assert.equal(calls.at(-1)[0], 'tab.select'); assert.equal(calls.at(-1)[1].id, 'tab1');
});

test('fresh launcher starts with defaults and dispatches selected mode before closing', async () => {
  const actions = [];
  const tasks = [];
  const input = initial => ({ text: initial?.value || '', value() { return this.text; }, set_value(value) { this.text = value; }, on() {} });
  const source = readFileSync(new URL('../mods/blob-launcher/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default class BlobLauncher', 'globalThis.BlobLauncher = class BlobLauncher');
  const cx = { spawn(fn) { tasks.push(fn(cx)); }, notify() {} };
  const sandbox = { View: class {}, InputState: { new: input },
    spaces: () => [{ id: 'space1', active: true, folder: '/work' }], focused: () => ({ cwd: '/work/current' }),
    knownAgents: async () => [codex, claude], props: () => ({ overlay: 'launcher' }), shared: () => null, setShared() {},
    run: (...args) => actions.push(['run', ...args]), closeOverlay: id => actions.push(['close', id]),
    modes, family, launchRequest };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const launcher = new sandbox.BlobLauncher(); launcher.init({}, cx); await Promise.all(tasks);
  assert.equal(launcher.mode, 'default'); assert.equal(actions.length, 0);
  launcher.selected = 'claude'; launcher.mode = 'yolo'; launcher.start(cx);
  assert.equal(actions[0][0], 'run'); assert.equal(actions[0][1], 'tab.new');
  assert.deepEqual(actions[0][2].argv, ['claude', '--dangerously-skip-permissions']);
  assert.equal(actions[0][2].folder, '/work/current');
  assert.deepEqual(actions[1], ['close', 'launcher']);
  launcher.start(cx); assert.equal(actions.length, 2, 'double submission must not create another tab');
  const fresh = new sandbox.BlobLauncher(); fresh.init({}, cx); assert.equal(fresh.mode, 'default');
});

test('launcher remembers agent selection across dialogs and reloads, with installed-agent fallback', async () => {
  const saved = new Map();
  let installed = [codex, claude];
  const source = readFileSync(new URL('../mods/blob-launcher/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default class BlobLauncher', 'globalThis.BlobLauncher = class BlobLauncher');
  const actions = new Map();
  function element() {
    let node;
    node = new Proxy({}, { get: () => (...args) => {
      if (typeof args[0] === 'boolean' && args[0]) args[1](node);
      return node;
    }});
    return node;
  }
  function load() {
    const sandbox = { View: class {}, div: element, h_flex: element, v_flex: element,
      InputState: { new: initial => ({ value: () => initial?.value || '', on() {}, set_value() {} }) },
      Input: { new: element }, spaces: () => [], focused: () => null,
      knownAgents: async () => installed, modes, family, launchRequest,
      shared: key => saved.get(key), setShared: (key, value) => saved.set(key, value) };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    return sandbox.BlobLauncher;
  }
  async function open(Launcher) {
    const tasks = [];
    const cx = { spawn(fn) { tasks.push(fn(cx)); }, notify() {} };
    const launcher = new Launcher(); launcher.init({}, cx); await Promise.all(tasks);
    launcher.button = (id, _text, _active, action) => { actions.set(id, () => action({}, cx)); return element(); };
    return launcher;
  }
  const Launcher = load();
  const first = await open(Launcher);
  assert.equal(first.selected, 'codex');
  first.render(); actions.get('launch-claude')();
  assert.equal(first.selected, 'claude');
  const reopened = await open(Launcher);
  assert.equal(reopened.selected, 'claude', 'selection survives closing without starting');
  assert.equal(reopened.mode, 'default');
  assert.equal((await open(load())).selected, 'claude', 'selection survives a fresh module context');
  installed = [codex, { ...claude, installed: false }];
  assert.equal((await open(Launcher)).selected, 'codex', 'uninstalled selection falls back');
  installed = [];
  assert.equal((await open(Launcher)).selected, undefined);
});


test('new blobs retain last launched permission and model arguments per agent across reloads', async () => {
  const saved = new Map();
  const launched = [];
  const source = readFileSync(new URL('../mods/blob-launcher/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default class BlobLauncher', 'globalThis.BlobLauncher = class BlobLauncher');
  async function open() {
    const tasks = [];
    const input = initial => ({ text: initial?.value || '', value() { return this.text; }, set_value(value) { this.text = value; }, on() {} });
    const sandbox = { View: class {}, InputState: { new: input },
      spaces: () => [{ id: 'space1', active: true }], focused: () => ({ cwd: '/current' }),
      knownAgents: async () => [codex, claude], props: () => ({ overlay: 'launcher' }),
      shared: key => saved.get(key), setShared: (key, value) => saved.set(key, value),
      run: (_command, args) => launched.push(args), closeOverlay() {}, modes, family, launchRequest };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    const cx = { spawn(fn) { tasks.push(fn(cx)); }, notify() {} };
    const launcher = new sandbox.BlobLauncher(); launcher.init({}, cx); await Promise.all(tasks);
    return { launcher, cx };
  }
  const first = await open();
  first.launcher.mode = 'yolo'; first.launcher.model.set_value('custom-model');
  first.launcher.task.set_value('One-time task'); first.launcher.start(first.cx);
  const next = await open();
  assert.equal(next.launcher.selected, 'codex');
  assert.equal(next.launcher.mode, 'yolo');
  assert.equal(next.launcher.model.value(), 'custom-model');
  assert.equal(next.launcher.task.value(), '');
  next.launcher.start(next.cx);
  assert.deepEqual(launched[1].argv, launched[0].argv);
  assert.equal(launched[1].task, undefined);
  next.launcher.selectAgent('claude');
  assert.equal(next.launcher.mode, 'default'); assert.equal(next.launcher.model.value(), '');
  const other = await open(); other.launcher.selectAgent('claude');
  other.launcher.mode = 'plan'; other.launcher.start(other.cx);
  const reopened = await open();
  assert.equal(reopened.launcher.selected, 'claude'); assert.equal(reopened.launcher.mode, 'plan');
  reopened.launcher.selectAgent('codex');
  assert.equal(reopened.launcher.mode, 'yolo'); assert.equal(reopened.launcher.model.value(), 'custom-model');
  reopened.launcher.mode = 'default'; reopened.launcher.model.set_value(''); reopened.launcher.start(reopened.cx);
  const reset = await open();
  assert.equal(reset.launcher.mode, 'default'); assert.equal(reset.launcher.model.value(), '');
  saved.set('blob-launcher.last-options.codex', { mode: 'plan', model: 123 });
  const invalid = await open();
  assert.equal(invalid.launcher.mode, 'default'); assert.equal(invalid.launcher.model.value(), '');
});
