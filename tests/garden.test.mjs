import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function element() {
  const data = { nodes: [], attrs: {} };
  let proxy;
  proxy = new Proxy(data, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === 'child') data.nodes.push(args[0]);
      else if (key === 'when') { if (args[0]) args[1](proxy); }
      else data.attrs[key] = args;
      return proxy;
    };
  }});
  return proxy;
}

const source = readFileSync(new URL('../mods/blob-garden/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default class BlobGarden', 'globalThis.BlobGarden = class BlobGarden');

for (const child of [false, true]) {
  test(`right-click kills exact ${child ? 'sub-agent' : 'agent'} without selecting it`, () => {
    const calls = [];
    const agent = { address: 'remote/t42', title: 'Agent', status: 'working', child };
    const sandbox = { View: class {}, div: element, h_flex: element, v_flex: element,
      focused: () => ({ agent: 't1' }), agents: () => [agent], terminals: () => [],
      run: (command, args) => calls.push({ command, terminal: args.terminal }) };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    const garden = new sandbox.BlobGarden(); garden.growth = {};
    const blob = garden.blob(agent, 0, 150, 160, 1).nodes[0];
    const [button, kill] = blob.attrs.on_mouse_down;
    assert.equal(button, 'right');
    let stopped = false;
    kill({}, { stop_propagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.deepEqual(calls, [{ command: 'terminal.kill', terminal: agent.address }]);
    assert.match(blob.attrs.tooltip[0], /Right-click to kill agent and its sub-agents/);
    calls.length = 0;
    blob.attrs.on_click[0]();
    assert.deepEqual(calls, [
      { command: 'agent.focus', terminal: agent.address },
      { command: 'pane.focus', terminal: agent.address },
      ...(child ? [{ command: 'terminal.show', terminal: agent.address }] : [])
    ]);
  });
}
