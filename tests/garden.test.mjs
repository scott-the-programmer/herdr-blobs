import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const contextSource = readFileSync(new URL('../mods/blob-garden/context.js', import.meta.url), 'utf8');
const contextHelpers = await import(`data:text/javascript,${encodeURIComponent(contextSource)}`);
const demoSource = readFileSync(new URL('../mods/blob-garden/demo.js', import.meta.url), 'utf8');
const { demoProperties } = await import(`data:text/javascript,${encodeURIComponent(demoSource)}`);
const native = {
  demoProperties,
  ...contextHelpers,
  svg: path => element().asset(path), image: path => element().asset(path),
  PathBuilder: { fill: () => element(), stroke: width => element().strokeWidth(width) },
  window: { paint_path: (path, color) => element().path(path).paint(color) }
};
const { contextSize, directoryLabel, terminalDirectory } = contextHelpers;
const positionSource = readFileSync(new URL('../mods/blob-garden/positions.js', import.meta.url), 'utf8');
const { pinAt, positionField, attachField, descendants, tidyPins } = await import(`data:text/javascript,${encodeURIComponent(positionSource)}`);
Object.assign(native, { attachField, descendants, tidyPins });
const typeSource = readFileSync(new URL('../mods/blob-garden/types.js', import.meta.url), 'utf8');
const { TYPES, blobType } = await import(`data:text/javascript,${encodeURIComponent(typeSource)}`);
native.TYPES = TYPES;
const namingSource = readFileSync(new URL('../mods/blob-garden/naming.js', import.meta.url), 'utf8');
const naming = await import(`data:text/javascript,${encodeURIComponent(namingSource)}`);
Object.assign(native, naming);

function element() {
  const data = { nodes: [], attrs: {} };
  let proxy;
  proxy = new Proxy(data, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === 'child') data.nodes.push(args[0]);
      else if (key === 'children') data.nodes.push(...args[0]);
      else if (key === 'map') return args[0](proxy);
      else if (key === 'when') { if (args[0]) args[1](proxy); }
      else data.attrs[key] = args;
      return proxy;
    };
  }});
  return proxy;
}

test('garden zoom buttons change scale, clamp limits, and reset to fit', () => {
  const sandbox = { ...native, View: class {}, contextSize, directoryLabel, terminalDirectory, pinAt, positionField, div: element, h_flex: element, v_flex: element,
    props: () => ({ role: 'board' }), agents: () => [], terminals: () => [], focused: () => null,
    setAgentOrder() {}, arrange: () => ({ placed: [] }) };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.fieldSize = { width: 950, height: 300 }; garden.zoom = 1;
  const cx = { notify() {} };
  const flatten = node => node && typeof node === 'object' ? [node, ...node.nodes.flatMap(flatten)] : [];
  const click = id => flatten(garden.render()).find(n => n.attrs.id?.[0] === id).attrs.on_click[0]({}, cx);
  click('zoom-in'); assert.equal(garden.zoom, 1.1);
  click('zoom-out'); assert.equal(garden.zoom, 1);
  for (let i = 0; i < 30; i++) click('zoom-out');
  assert.equal(garden.zoom, 0.1);
  for (let i = 0; i < 50; i++) click('zoom-in');
  assert.equal(garden.zoom, 4);
  click('zoom-reset'); assert.equal(garden.zoom, 1);
  const scroll = flatten(garden.render()).find(n => n.attrs.id?.[0] === 'garden-scroll');
  assert('overflow_hidden' in scroll.attrs);
  assert(!('overflow_x_scrollbar' in scroll.attrs));
});

const source = readFileSync(new URL('../mods/blob-garden/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default class BlobGarden', 'globalThis.BlobGarden = class BlobGarden');

test('wheel zoom keeps world point under cursor fixed through repeated zoom and limits', () => {
  const sandbox = { View: class {} };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.fieldSize = { width: 950, height: 400 }; garden.zoom = 0.6; garden.pan = { x: 48, y: -29 };
  const point = { x: 132, y: 301 }, center = { x: 475, y: 200 };
  const worldPoint = () => ({
    x: center.x + (point.x - center.x - garden.pan.x) / garden.zoom,
    y: center.y + (point.y - center.y - garden.pan.y) / garden.zoom
  });
  const before = worldPoint();
  let stopped = 0;
  const cx = { notify() {}, stop_propagation() { stopped++; } };
  for (const delta of [83, -47, 2000, -4000, 100]) {
    garden.wheel({ position: { x: point.x + 24, y: point.y + 100 }, bounds: { x: 24, y: 100 },
      delta: { x: 0, y: delta }, modifiers: {} }, cx);
    assert(Math.abs(worldPoint().x - before.x) < 1e-9);
    assert(Math.abs(worldPoint().y - before.y) < 1e-9);
    assert(garden.zoom >= 0.1 && garden.zoom <= 4);
  }
  assert.equal(stopped, 5);
  const zoom = garden.zoom, pan = { ...garden.pan };
  garden.wheel({ local_position: point, delta: { x: 23, y: -45 }, modifiers: { shift: true } }, cx);
  assert.equal(garden.zoom, zoom);
  assert.equal(garden.pan.x, pan.x + 23);
  assert.equal(garden.pan.y, pan.y - 45);
});

test('dragging a blob at non-default zoom converts screen coordinates back into world pins', () => {
  const sandbox = { View: class {}, pinAt };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.zoom = 2; garden.pan = { x: 70, y: -30 }; garden.pins = {};
  const field = { width: 950, height: 400, cellWidth: 160, cellHeight: 256, scale: 1 };
  garden.beginGesture('blob', { position: { x: 300, y: 200 }, bounds: { x: 285, y: 180 } }, 't1');
  const world = { x: 520, y: 70 }, origin = { x: 24, y: 100 };
  garden.moveGesture({ position: {
    x: origin.x + world.x * 2 - 475 + 70 + 15,
    y: origin.y + world.y * 2 - 200 - 30 + 20
  }, bounds: origin }, field, { notify() {} });
  assert.deepEqual(garden.pins.t1, pinAt(world.x, world.y, field));
});

test('dragging a blob moves it by pointer delta, whatever the mouse-down bounds say', () => {
  const sandbox = { View: class {}, pinAt, descendants };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const field = { width: 950, height: 400, cellWidth: 160, cellHeight: 256, scale: 1 };
  for (const bounds of [undefined, { x: -5000, y: 9000 }]) {
    const garden = new sandbox.BlobGarden();
    garden.zoom = 2; garden.pan = { x: 70, y: -30 }; garden.pins = {};
    garden.spawnField = { ...field, placed: [{ a: { address: 't1' }, x: 300, y: 80 }] };
    garden.beginGesture('blob', { position: { x: 400, y: 300 }, bounds }, 't1');
    garden.moveGesture({ position: { x: 450, y: 320 }, bounds: { x: 24, y: 100 } }, field, { notify() {} });
    assert.deepEqual(garden.pins.t1, pinAt(325, 90, field));
  }
});

test('zooming out shrinks body and cell together without delayed body-size animation', () => {
  const sandbox = { ...native, View: class {}, div: element, h_flex: element, v_flex: element,
    blobType, focused: () => null };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  const a = { address: 't1', status: 'idle', demo: { type: 'pebble', context: { used: 80000, limit: 200000 } } };
  let previous = Infinity;
  for (const scale of [2, 1, 0.6, 0.1]) {
    const cell = garden.blob(a, 0, 160 * scale, 256 * scale, scale);
    const body = cell.nodes[0];
    assert(body.attrs.w[0] < previous);
    assert.equal(body.attrs.w[0], contextSize(a.demo.context).diameter * scale);
    assert.equal(body.attrs.transition, undefined);
    assert.equal(cell.attrs.w[0], 160 * scale);
    previous = body.attrs.w[0];
  }
});

test('native body motion and blinking scale with zoom, keep identity, and pause bobbing during gestures', () => {
  const animatedElement = () => {
    const node = element();
    node.loops = {};
    node.loop = (property, policy) => { node.loops[property] = policy; return node; };
    return node;
  };
  const sandbox = { ...native, View: class {}, div: animatedElement, h_flex: animatedElement,
    v_flex: animatedElement, blobType, focused: () => null };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  const agent = { address: 't42', status: 'working' };
  const render = (scale = 1, index = 0) => garden.blob(agent, index, 160 * scale, 256 * scale, scale);
  const body = render().nodes[0];
  assert.equal(body.loops.top.to, -5);
  assert.equal(render(0.5).nodes[0].loops.top.to, -2.5);
  assert.equal(render(1, 8).nodes[0].loops.top.period, body.loops.top.period);
  const eyes = body.nodes[0].nodes[1].nodes;
  assert.equal(eyes[0].loops.height.period, eyes[1].loops.height.period);
  assert.equal(eyes[0].loops.height.to, 1.5);
  assert(eyes[0].loops.height.from > eyes[0].loops.height.to);
  agent.status = 'idle';
  const idle = render().nodes[0];
  assert.equal(idle.loops.top.to, -2);
  assert(idle.loops.top.period > body.loops.top.period);
  assert(idle.nodes[0].nodes[1].nodes.every(eye => eye.loops.height.from <= 3));
  for (const kind of ['blob', 'pan']) {
    garden.gesture = { kind, address: 'other' };
    assert(render().nodes[0].loops.top, `${kind} gesture on another blob keeps this one bobbing`);
  }
  garden.gesture = { kind: 'selection' };
  assert.equal(render().nodes[0].loops.top, undefined);
  garden.gesture = { kind: 'blob', address: agent.address, moved: true };
  assert.equal(render().nodes[0].loops.top, undefined, 'the dragged blob stops bobbing');
});

test('drag, pan, and selection divide pointer distance by app zoom', () => {
  const sandbox = { View: class {}, pinAt, descendants };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const field = { width: 950, height: 400, cellWidth: 160, cellHeight: 256, scale: 1 };
  const canvas = { x: 24, y: 100, width: 950 * 0.7, height: 400 * 0.7 };
  const cx = { notify() {} };
  const garden = new sandbox.BlobGarden();
  garden.zoom = 2; garden.pan = { x: 70, y: -30 }; garden.pins = {};
  garden.spawnField = { ...field, placed: [{ a: { address: 't1' }, x: 300, y: 80 }] };
  garden.beginGesture('blob', { position: { x: 400, y: 300 } }, 't1');
  garden.moveGesture({ position: { x: 435, y: 314 }, bounds: canvas }, field, cx);
  const pin = garden.pins.t1, want = pinAt(325, 90, field);
  assert(Math.abs(pin.x - want.x) < 1e-9 && Math.abs(pin.y - want.y) < 1e-9);
  garden.endGesture(cx);
  garden.beginGesture('pan', { position: { x: 400, y: 300 } });
  garden.moveGesture({ position: { x: 470, y: 300 }, bounds: canvas }, field, cx);
  assert(Math.abs(garden.pan.x - 170) < 1e-9);
});

test('right-drag selects visible bodies in either direction after camera zoom and pan', () => {
  const overlays = [];
  const list = ['t1', 't2', 't3'].map(address => ({ address, title: address, status: 'idle' }));
  const sandbox = { ...native, View: class {}, agents: () => list, terminals: () => [],
    openOverlay: spec => overlays.push(spec) };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  const world = { width: 1000, height: 600, cellWidth: 160, cellHeight: 256, scale: 1,
    placed: list.map((a, i) => ({ a, x: 100 + i * 250, y: 100,
      orbit: { left: { from: 100 + i * 250, to: 100 + i * 250 }, top: { from: 100, to: 100 } } })) };
  const cx = { notify() {}, stop_propagation() {} };
  for (const zoom of [0.5, 1, 2]) {
    garden.selection = [];
    const view = positionField(world, {}, { x: 40, y: -20 }, zoom);
    garden.selectionField = view;
    const first = view.placed[0], second = view.placed[1];
    const start = { x: first.x + 20 * zoom + 24, y: first.y + 40 * zoom + 100 };
    const end = { x: second.x + 140 * zoom + 24, y: second.y + 150 * zoom + 100 };
    garden.beginSelection({ position: end }, cx);
    garden.moveGesture({ position: start, bounds: { x: 24, y: 100 } }, world, cx);
    assert.deepEqual([...garden.selection], ['t1', 't2']);
    garden.finishSelection(cx);
    assert.equal(overlays.length, 0, 'drag must not open menu');
    assert.equal(garden.selectionBox, null);
    garden.beginSelection({ position: start }, cx, 't1');
    garden.finishSelection(cx);
    assert.equal(overlays.pop().props.targets.length, 2, 'clicking selected member keeps group');
    garden.selection = ['t3'];
    garden.beginSelection({ position: start, modifiers: { shift: true } }, cx);
    garden.moveGesture({ position: end, bounds: { x: 24, y: 100 } }, world, cx);
    assert.deepEqual([...garden.selection].sort(), ['t1', 't2', 't3']);
    garden.endGesture(cx);
    assert.equal(overlays.length, 0);
    garden.beginSelection({ position: { x: 0, y: 0 } }, cx);
    garden.moveGesture({ position: { x: 10, y: 10 }, bounds: { x: 0, y: 0 } }, world, cx);
    garden.finishSelection(cx);
    assert.equal(garden.selection.length, 0, 'empty box clears selection');
  }
});

test('group actions require kill confirmation and kill only captured targets once', () => {
  const calls = [], overlays = [];
  let current = { role: 'selection-menu', overlay: 'menu', targets: [
    { terminal: 't1', name: 'One' }, { terminal: 'remote/t2', name: 'Two' }, { terminal: 't1', name: 'One' }
  ] };
  const sandbox = { ...native, View: class {}, props: () => current, theme: () => ({}),
    div: element, h_flex: element, v_flex: element,
    closeOverlay: id => calls.push(['close', id]), openOverlay: spec => overlays.push(spec),
    run: (command, args) => calls.push([command, args?.terminal]) };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  const flatten = node => node && typeof node === 'object' ? [node, ...node.nodes.flatMap(flatten)] : [];
  const click = id => flatten(garden.render()).find(n => n.attrs.id?.[0] === id).attrs.on_click[0]();
  click('selection-kill');
  assert.equal(calls.some(c => c[0] === 'terminal.kill'), false);
  assert.equal(overlays[0].kind, 'dialog');
  current = { ...overlays[0].props, overlay: 'confirm' };
  click('kill-cancel');
  assert.equal(calls.some(c => c[0] === 'terminal.kill'), false);
  click('kill-confirm'); click('kill-confirm');
  assert.deepEqual(calls.filter(c => c[0] === 'terminal.kill'), [
    ['terminal.kill', 't1'], ['terminal.kill', 'remote/t2']
  ]);
});

test('hover text stays within two short lines even for long titles and directories', () => {
  const sandbox = { ...native, View: class {}, div: element, h_flex: element, v_flex: element,
    blobType, focused: () => null };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  const a = { address: 't1', title: 'Long title '.repeat(30), cwd: '/long/path/'.repeat(40), status: 'working' };
  const text = garden.blob(a, 0, 160, 256, 1).nodes[0].attrs.tooltip[0];
  assert.equal(text.split('\n').length, 2);
  assert(text.length <= 80);
  assert(!text.includes(a.cwd));
});

for (const child of [false, true]) {
  test(`right-click opens action menu for exact ${child ? 'sub-agent' : 'agent'} without selecting or killing it`, () => {
    const calls = [];
    const overlays = [];
    const agent = { address: 'remote/t42', title: 'Agent', status: 'working', child };
    const sandbox = { ...native, View: class {}, contextSize, directoryLabel, terminalDirectory, pinAt, positionField, div: element, h_flex: element, v_flex: element,
      blobType, focused: () => ({ agent: 't1' }), agents: () => [agent], terminals: () => [],
      openOverlay: spec => overlays.push(spec),
      run: (command, args) => calls.push({ command, terminal: args.terminal }) };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    const garden = new sandbox.BlobGarden(); garden.growth = {};
    const blob = garden.blob(agent, 0, 150, 160, 1).nodes[0];
    const [button, kill] = blob.attrs.on_mouse_down;
    assert.equal(button, 'right');
    let stopped = false;
    kill({ position: { x: 100, y: 120 } }, { stop_propagation() { stopped = true; } });
    assert.equal(overlays.length, 0);
    garden.finishSelection({ notify() {} });
    assert.equal(stopped, true);
    assert.deepEqual(calls, []);
    assert.equal(overlays[0].kind, 'popup');
    assert.equal(overlays[0].mod, 'blob-garden');
    assert.equal(overlays[0].props.role, 'selection-menu');
    assert.equal(overlays[0].props.targets[0].terminal, agent.address);
    assert.equal(overlays[0].props.targets[0].name, agent.title);
    assert.equal(blob.attrs.tooltip[0].split('\n').length, 2);
    calls.length = 0;
    blob.attrs.on_click[0]();
    assert.deepEqual(calls, [
      { command: 'agent.focus', terminal: agent.address },
      { command: 'pane.focus', terminal: agent.address },
      ...(child ? [{ command: 'terminal.show', terminal: agent.address }] : [])
    ]);
  });
}

for (const type of TYPES) {
  test(`${type.name} renders silhouette, harness logo, state color, and selection without type labels`, () => {
    let selected = false;
    const sandbox = { ...native, View: class {}, contextSize, directoryLabel, terminalDirectory, pinAt, positionField, div: element, h_flex: element, v_flex: element,
      blobType: () => type, focused: () => selected ? { agent: 't1' } : null };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    const garden = new sandbox.BlobGarden(); garden.growth = {};
    for (const status of ['working', 'idle', 'done', 'blocked']) {
      const agent = { address: 't1', title: 'Agent', status };
      const tree = garden.blob(agent, 0, 128, 208, 1);
      const body = tree.nodes[0];
      const star = ['frost', 'cosmic'].includes(type.id);
      const color = { working: '#b8bb26', idle: '#83a598', done: '#8ec07c', blocked: '#fe8019' }[status];
      assert.equal(star ? body.nodes[0].attrs.paint[0] : body.attrs.bg[0], color);
      if (star) {
        const points = body.nodes[0].attrs.path[0].attrs.add_polygon[0];
        assert.equal(points.length, 10);
        assert(points.flat().every(v => /%$/.test(v) && parseFloat(v) >= 0 && parseFloat(v) <= 100), 'points are percentages of the body');
        assert.equal(body.nodes[1].attrs.paint[0], type.accent);
      } else {
        assert(body.attrs.rounded_tl[0] !== body.attrs.rounded_br[0] || type.id === 'ripple');
      }
      assert(tree.nodes[1].nodes.includes('Agent'));
      assert(!tree.nodes.some(n => n.nodes?.includes(`${type.name} · ${type.rarity}`)));
      assert.equal(body.nodes.length, star ? 3 : 1, 'silhouette and face render');
      const logo = body.nodes.at(-1).nodes[0].nodes[0];
      assert.equal(logo.attrs.asset[0], 'icons/agent.svg');
    }
    selected = true;
    const body = garden.blob({ address: 't1', status: 'working' }, 0, 128, 208, 1).nodes[0];
    if (['frost', 'cosmic'].includes(type.id)) {
      assert.equal(body.nodes[1].attrs.paint[0], '#ebdbb2');
      assert.equal(body.nodes[1].attrs.path[0].attrs.strokeWidth[0], 3);
    } else {
      assert.equal(body.attrs.border_color[0], '#ebdbb2');
      assert.equal(body.attrs.border[0], 3);
    }
  });
}

test('star path uses percentages so it fills its hit box at any app zoom', () => {
  const type = TYPES.find(t => t.id === 'cosmic');
  for (const zoom of [0.7, 1, 1.5]) {
    const sandbox = { ...native, View: class {}, contextSize, directoryLabel, terminalDirectory, pinAt, positionField, div: element, h_flex: element, v_flex: element,
      blobType: () => type, focused: () => null, settings: () => ({ zoom }) };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    sandbox.readAppZoom();
    const garden = new sandbox.BlobGarden(); garden.growth = {};
    const body = garden.blob({ address: 't1', status: 'working' }, 0, 128, 208, 1).nodes[0];
    const points = body.nodes[0].attrs.path[0].attrs.add_polygon[0].map(p => p.map(parseFloat));
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    assert(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 50) < 0.01, `centred at zoom ${zoom}`);
    assert(Math.min(...ys) >= 0 && Math.max(...ys) <= 100, `inside box at zoom ${zoom}`);
    assert(Math.min(...ys) < 5, `fills box at zoom ${zoom}`);
    assert.equal(body.nodes[1].attrs.path[0].attrs.strokeWidth[0], 2 * zoom, `stroke follows zoom ${zoom}`);
  }
});

test('forehead uses harness icon and scales with zoom', () => {
  const sandbox = { ...native, View: class {}, contextSize, directoryLabel, terminalDirectory, pinAt, positionField, div: element, h_flex: element, v_flex: element };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  for (const tint of [true, false]) {
    const logo = garden.harnessLogo({ program: { icon: 'icons/codex.svg', tint } }, TYPES[0], 2).nodes[0];
    assert.equal(logo.attrs.asset[0], 'icons/codex.svg');
    assert.equal(logo.attrs.size[0], 32);
    assert.equal(Boolean(logo.attrs.text_color), tint);
  }
});


test('kill dialog cancels without killing and confirms exact target once', () => {
  const calls = [];
  const sandbox = { View: class {}, contextSize, directoryLabel, terminalDirectory, pinAt, positionField, div: element, h_flex: element, v_flex: element,
    props: () => ({ role: 'kill-dialog', terminal: 'remote/t42', name: 'Agent', overlay: 'kill-overlay' }),
    theme: () => ({}), closeOverlay: id => calls.push(['close', id]),
    run: (command, args) => calls.push([command, args.terminal]) };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  const flatten = node => node && typeof node === 'object' ? [node, ...node.nodes.flatMap(flatten)] : [];
  const nodes = flatten(garden.render());
  const click = id => nodes.find(n => n.attrs.id?.[0] === id).attrs.on_click[0]();
  assert.deepEqual(calls, []);
  click('kill-cancel'); assert.deepEqual(calls, [['close', 'kill-overlay']]);
  calls.length = 0;
  click('kill-confirm'); click('kill-confirm');
  assert.deepEqual(calls, [['close', 'kill-overlay'], ['terminal.kill', 'remote/t42']]);
});

test('dragging distinguishes click from movement, persists pins and pan, and Fit recenters', () => {
  const saved = {};
  const sandbox = { ...native, View: class {}, div: element, h_flex: element, v_flex: element,
    pinAt, positionField, localStorage: { setItem(key, value) { saved[key] = value; } } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden(); garden.pan = { x: 0, y: 0 }; garden.pins = {}; garden.zoom = 1.5;
  const cx = { notify() {} };
  const field = { width: 950, height: 400, cellWidth: 128, cellHeight: 208, scale: 1 };
  garden.beginGesture('blob', { position: { x: 100, y: 100 }, bounds: { x: 80, y: 80 } }, 't1');
  garden.moveGesture({ position: { x: 102, y: 101 }, bounds: { x: 0, y: 0 } }, field, cx);
  assert.equal(garden.suppressClick, null);
  garden.moveGesture({ position: { x: 300, y: 200 }, bounds: { x: 0, y: 0 } }, field, cx);
  assert.equal(garden.suppressClick, 't1'); assert(garden.pins.t1);
  garden.endGesture(cx); assert(JSON.parse(saved['positions-v1']).t1);
  garden.beginGesture('pan', { position: { x: 50, y: 60 } });
  garden.moveGesture({ position: { x: 150, y: 40 } }, field, cx);
  garden.endGesture(cx); assert.equal(garden.pan.x, 100); assert.equal(garden.pan.y, -20);
  garden.resetView(cx); assert.equal(garden.pan.x, 0); assert.equal(garden.zoom, 1); assert(garden.pins.t1);
});


test('demo overrides render chosen rarity and context while unlabelled agents use telemetry', () => {
  const sandbox = { ...native, View: class {}, div: element, h_flex: element, v_flex: element,
    blobType, focused: () => null };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.context = { t1: { used: 0, limit: 200000 } };
  const a = { address: 't1', status: 'working', demo: demoProperties({ 'blob.demo': JSON.stringify({
    run: 'demo', type: 'cosmic', used: 1000000, limit: 1000000
  }) }) };
  const demoBody = garden.blob(a, 0, 160, 256, 1).nodes[0];
  assert.equal(demoBody.attrs.w[0], 144);
  assert.match(demoBody.attrs.tooltip[0], /1000k tokens · 100%/);
  delete a.demo;
  assert.equal(garden.blob(a, 0, 160, 256, 1).nodes[0].attrs.w[0], 81);
});

test('demo view applies zoom once, keeps manual controls, restores previous view, and respects drags', () => {
  const sandbox = { ...native, View: class {} };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.zoom = 1.2; garden.pan = { x: 10, y: 20 }; garden.pins = { t1: { x: 0.2, y: 0.3 } };
  const list = [{ address: 't1', demo: { run: 'demo', zoom: 0.6, pin: { x: 1, y: 1 } } }];
  assert.equal(garden.demoView(list).t1.x, 0.2);
  assert.equal(garden.zoom, 0.6); assert.equal(garden.pan.x, 0);
  garden.zoom = 0.8; garden.demoView(list); assert.equal(garden.zoom, 0.8);
  list[0].demo.zoom = 0.7; garden.demoView(list); assert.equal(garden.zoom, 0.7);
  garden.demoView([]); assert.equal(garden.zoom, 1.2); assert.equal(garden.pan.x, 10);
});

test('new blobs spawn beside previous active blob, avoid occupied slots, and persist positions', async () => {
  const geometrySource = readFileSync(new URL('../mods/blob-garden/geometry.js', import.meta.url), 'utf8');
  const { arrange } = await import(`data:text/javascript,${encodeURIComponent(geometrySource)}`);
  let active = 't1';
  const saved = {};
  const sandbox = { View: class {}, pinAt, positionField, focused: () => ({ agent: active }),
    localStorage: { setItem(key, value) { saved[key] = value; } } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden(); garden.pins = {};
  let list = [{ address: 't1' }, { address: 't2' }];
  const render = () => {
    const world = arrange(list, 950, 400);
    garden.spawnView(list, world, { ...garden.pins });
    return garden.spawnField;
  };
  render(); active = 't2';
  const before = render();
  const anchor = before.placed.find(p => p.a.address === 't2');
  active = 't3'; // Creating a terminal switches focus before the garden renders.
  list = [...list, { address: 't3' }, { address: 't4' }];
  const after = render();
  for (const p of before.placed) {
    const q = after.placed.find(q => q.a.address === p.a.address);
    assert(Math.abs(p.x - q.x) < 0.000001);
    assert(Math.abs(p.y - q.y) < 0.000001);
  }
  const first = after.placed.find(p => p.a.address === 't3');
  const steps = Math.abs(first.x - anchor.x) / (after.cellWidth + 36 * after.scale)
    + Math.abs(first.y - anchor.y) / (after.cellHeight + 28 * after.scale);
  assert(Math.abs(steps - 1) < 0.000001, 'new blob uses a free slot immediately beside previous active blob');
  const second = after.placed.find(p => p.a.address === 't4');
  assert(Math.abs(second.x - first.x) >= after.cellWidth || Math.abs(second.y - first.y) >= after.cellHeight);
  assert(JSON.parse(saved['positions-v1']).t3);
  const settled = render();
  assert.deepEqual(settled.placed.map(p => [p.x, p.y]), after.placed.map(p => [p.x, p.y]));
  const demo = { address: 'demo', demo: { pin: { x: 0.1, y: 0.9 } } };
  list.push(demo);
  const world = arrange(list, 950, 400);
  garden.spawnView(list, world, { ...garden.pins, demo: demo.demo.pin });
  assert.equal(garden.pins.demo, undefined, 'explicit demo positions keep precedence');
});

test('sub-agents record their garden parent, spawn beside it, and follow it when dragged', async () => {
  const geometrySource = readFileSync(new URL('../mods/blob-garden/geometry.js', import.meta.url), 'utf8');
  const { arrange } = await import(`data:text/javascript,${encodeURIComponent(geometrySource)}`);
  const terms = [
    { address: 'p', state: 'live' }, { address: 'far', state: 'live' },
    { address: 'sub', state: 'live', parent: 'p', status: 'working' },
    { address: 'orphan', state: 'live', parent: 'gone' }
  ];
  const saved = {};
  const sandbox = { ...native, View: class {}, pinAt, positionField, focused: () => ({ agent: 'far' }),
    agents: () => [{ address: 'p', status: 'idle' }, { address: 'far', status: 'idle' }, { address: 'orphan', status: 'idle' }],
    terminals: () => terms, localStorage: { setItem(key, value) { saved[key] = value; } } };
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.liveAgents = liveAgents;', sandbox);
  const all = sandbox.liveAgents();
  assert.equal(all.find(a => a.address === 'sub').parent, 'p');
  assert.equal(all.find(a => a.address === 'orphan').parent, null, 'parents outside the garden are ignored');

  const garden = new sandbox.BlobGarden(); garden.pins = {};
  let list = all.filter(a => a.address !== 'sub');
  const render = () => { const world = arrange(list, 950, 400); garden.spawnView(list, world, { ...garden.pins }); return world; };
  render(); render();
  list = all;
  const world = render();
  const at = address => garden.spawnField.placed.find(p => p.a.address === address);
  const steps = (a, b) => Math.abs(a.x - b.x) / (world.cellWidth + 36 * world.scale) + Math.abs(a.y - b.y) / (world.cellHeight + 28 * world.scale);
  assert(Math.abs(steps(at('sub'), at('p')) - 1) < 1e-6, 'sub-agent spawns beside its parent, not the active blob');

  const before = { p: { ...garden.pins.p }, sub: { ...garden.pins.sub }, far: { ...garden.pins.far } };
  const cx = { notify() {} };
  garden.beginGesture('blob', { position: { x: 100, y: 100 }, bounds: { x: 90, y: 90 } }, 'p');
  garden.moveGesture({ position: { x: 260, y: 180 }, bounds: { x: 0, y: 0 } }, world, cx);
  assert(garden.dragging('sub') && !garden.dragging('far'));
  const moved = { x: garden.pins.p.x - before.p.x, y: garden.pins.p.y - before.p.y };
  assert(Math.abs(moved.x) > 0.01);
  assert(Math.abs(garden.pins.sub.x - before.sub.x - moved.x) < 1e-6);
  assert(Math.abs(garden.pins.sub.y - before.sub.y - moved.y) < 1e-6);
  assert.deepEqual(garden.pins.far, before.far);
  garden.endGesture(cx);
  assert(JSON.parse(saved['positions-v1']).sub);

  garden.beginGesture('blob', { position: { x: 100, y: 100 }, bounds: { x: 90, y: 90 } }, 'sub');
  const parentPin = { ...garden.pins.p };
  garden.moveGesture({ position: { x: 20, y: 30 }, bounds: { x: 0, y: 0 } }, world, cx);
  assert.deepEqual(garden.pins.p, parentPin, 'dragging a sub-agent leaves its parent in place');
});

test('Tidy button gathers lost blobs into view, keeps the camera, and persists pins', async () => {
  const geometrySource = readFileSync(new URL('../mods/blob-garden/geometry.js', import.meta.url), 'utf8');
  const { arrange } = await import(`data:text/javascript,${encodeURIComponent(geometrySource)}`);
  const saved = {};
  const live = ['t1', 't2', 't3'].map(address => ({ address, title: address, status: 'working' }));
  const sandbox = { ...native, View: class {}, div: element, h_flex: element, v_flex: element, arrange, pinAt, positionField, blobType,
    props: () => ({ role: 'board' }), agents: () => live, terminals: () => [], focused: () => null, setAgentOrder() {},
    localStorage: { setItem(key, value) { saved[key] = value; } } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.fieldSize = { width: 950, height: 400 }; garden.zoom = 0.5; garden.pan = { x: 700, y: -300 };
  garden.pins = { t1: { x: 40, y: -25 }, t2: { x: -60, y: 9 } }; garden.context = {}; garden.selection = [];
  const cx = { notify() {} };
  const flatten = node => node && typeof node === 'object' ? [node, ...node.nodes.flatMap(flatten)] : [];
  const blobs = () => flatten(garden.render()).filter(n => /^orbit-/.test(n.attrs.id?.[0] || ''))
    .map(n => ({ x: n.attrs.left[0], y: n.attrs.top[0] }));
  assert(blobs().some(p => p.x < 0 || p.x > 950 || p.y < 0 || p.y > 400), 'fixture starts with lost blobs');
  flatten(garden.render()).find(n => n.attrs.id?.[0] === 'tidy').attrs.on_click[0]({}, cx);
  assert.deepEqual([garden.zoom, garden.pan.x, garden.pan.y], [0.5, 700, -300]);
  for (const p of blobs()) assert(p.x >= 0 && p.x < 950 && p.y >= 0 && p.y < 400, `blob in view at ${p.x},${p.y}`);
  assert.deepEqual(Object.keys(JSON.parse(saved['positions-v1'])).sort(), ['t1', 't2', 't3']);
});

test('garden shows only the active space, with its own camera, and tidy keeps other spaces pinned', async () => {
  const geometrySource = readFileSync(new URL('../mods/blob-garden/geometry.js', import.meta.url), 'utf8');
  const { arrange } = await import(`data:text/javascript,${encodeURIComponent(geometrySource)}`);
  const saved = {};
  const live = [['a1', 's1', 'alpha'], ['a2', 's1', 'alpha'], ['b1', 's2', 'beta']]
    .map(([address, space, space_name]) => ({ address, space, space_name, title: address, status: 'working' }));
  const terms = [{ address: 'a1', state: 'live' }, { address: 'sub', parent: 'b1', state: 'live', status: 'working' }];
  let space = 's1';
  const sandbox = { ...native, View: class {}, div: element, h_flex: element, v_flex: element, arrange, pinAt, positionField, blobType,
    props: () => ({ role: 'board' }), agents: () => live, terminals: () => terms, focused: () => ({ space }), setAgentOrder() {},
    localStorage: { setItem(key, value) { saved[key] = value; } } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.fieldSize = { width: 950, height: 400 }; garden.context = {}; garden.selection = [];
  garden.pins = { b1: { x: 0.9, y: 0.9 } };
  const cx = { notify() {} };
  const flatten = node => node && typeof node === 'object' ? [node, ...node.nodes.flatMap(flatten)] : [];
  const shown = () => flatten(garden.render()).filter(n => /^orbit-/.test(n.attrs.id?.[0] || '')).map(n => n.attrs.id[0].slice(6)).sort();
  assert.deepEqual(shown(), ['a1', 'a2']);
  assert(flatten(garden.render()).some(n => n.nodes.includes('2 agents in alpha')));
  garden.setZoom(2, cx); garden.selection = ['a1'];
  flatten(garden.render()).find(n => n.attrs.id?.[0] === 'tidy').attrs.on_click[0]({}, cx);
  assert.deepEqual(garden.pins.b1, { x: 0.9, y: 0.9 });

  space = 's2';
  assert.deepEqual(shown(), ['b1', 'sub']);
  assert.deepEqual([garden.zoom, garden.pan.x, garden.pan.y, garden.selection.length], [1, 0, 0, 0]);
  garden.pan = { x: 30, y: 40 }; garden.savePan();

  space = 's1';
  shown();
  assert.equal(garden.zoom, 2);
  assert.deepEqual(Object.keys(JSON.parse(saved['canvas-pan-v2'])).sort(), ['s1', 's2']);
  assert.deepEqual(JSON.parse(saved['canvas-pan-v2']).s2, { x: 30, y: 40 });
});

test('a drag frame reuses host reads instead of asking the host again', () => {
  const calls = { agents: 0, terminals: 0, focused: 0 };
  const list = [{ address: 't1', status: 'idle', space: 's1' }, { address: 't2', status: 'idle', space: 's1' }];
  const sandbox = { ...native, View: class {}, contextSize, directoryLabel, terminalDirectory, pinAt, positionField, div: element, h_flex: element, v_flex: element,
    blobType, props: () => ({ role: 'board' }), setAgentOrder() {}, arrange: () => ({ placed: [], width: 950, height: 400, scale: 1, cellWidth: 160, cellHeight: 256 }),
    agents: () => { calls.agents++; return list; }, terminals: () => { calls.terminals++; return []; },
    focused: () => { calls.focused++; return { agent: 't1', space: 's1' }; } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const garden = new sandbox.BlobGarden();
  garden.fieldSize = { width: 950, height: 400 }; garden.zoom = 1;
  garden.render();
  assert.deepEqual({ ...calls }, { agents: 1, terminals: 1, focused: 1 }, 'one focus read per render, not one per blob');
  garden.gesture = { kind: 'blob', address: 't1', moved: true };
  garden.render(); garden.render();
  assert.deepEqual({ ...calls }, { agents: 1, terminals: 1, focused: 1 });
  garden.gesture = null;
  garden.render();
  assert.equal(calls.agents, 2, 'reads resume once the drag ends');
});

test('shell terminals get their own blob, focus their pane, and stay out of agent navigation', async () => {
  const geometrySource = readFileSync(new URL('../mods/blob-garden/geometry.js', import.meta.url), 'utf8');
  const { arrange } = await import(`data:text/javascript,${encodeURIComponent(geometrySource)}`);
  const calls = [];
  let order = null;
  const terms = [
    { address: 'a1', state: 'live', status: 'working' },
    { address: 'sh', state: 'live', title: 'zsh', cwd: '/tmp/x/y' },
    { address: 'gone', state: 'exited' }
  ];
  const paneList = [
    { pane: 'p1', terminal: 'a1', tab: 'tb1', status: 'working' },
    { pane: 'p2', terminal: 'sh', tab: 'tb1', status: null, title: 'zsh', cwd: '/tmp/x/y', program: { name: 'zsh', icon: 'icons/shell.svg', tint: true } },
    { pane: 'p3', terminal: null, mod: 'blob-files', tab: 'tb1', status: null },
    { pane: 'p4', terminal: 'gone', tab: 'tb1', status: null }
  ];
  const sandbox = { ...native, View: class {}, pinAt, positionField, div: element, h_flex: element, v_flex: element,
    agents: () => [{ address: 'a1', status: 'working', space: 's1', space_name: 'One', tab: 'tb1' }],
    terminals: () => terms, panes: () => paneList,
    spaces: () => [{ id: 's1', name: 'One', tabs: [{ id: 'tb1' }] }],
    focused: () => ({ space: 's1', terminal: 'sh' }), props: () => ({}),
    arrange, blobType, setAgentOrder: list => { order = list; }, run: (command, args) => calls.push({ command, ...args }) };
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.liveAgents = liveAgents;', sandbox);
  const all = sandbox.liveAgents();
  assert.equal(JSON.stringify(all.map(a => a.address)), '["a1","sh"]');
  const shell = all.find(a => a.address === 'sh');
  assert.equal(shell.kind, 'terminal');
  assert.equal(shell.space, 's1');

  const garden = new sandbox.BlobGarden();
  const tree = garden.blob(shell, 0, 128, 208, 1);
  const body = tree.nodes[0];
  assert.equal(body.attrs.bg[0], '#928374');
  assert.equal(body.attrs.border[0], 3, 'focused terminal is outlined');
  assert.equal(body.nodes[0].nodes[0].nodes[0].attrs.asset[0], 'icons/shell.svg');
  const flatten = node => node && typeof node === 'object' ? [node, ...node.nodes.flatMap(flatten)] : [];
  assert(flatten(tree).some(n => n.nodes?.includes('Terminal · zsh')));
  body.attrs.on_click[0]();
  assert.equal(JSON.stringify(calls), JSON.stringify([{ command: 'pane.focus', terminal: 'sh' }]));

  garden.fieldSize = { width: 950, height: 400 };
  const tree2 = garden.render();
  assert.equal(JSON.stringify(order), '["a1"]');
  assert(flatten(tree2).some(n => n.nodes?.includes('1 agent · 1 terminal in One')));
  assert(flatten(tree2).some(n => n.nodes?.includes('Terminal')), 'legend names terminals');
});

test('on the first frame, unpinned blobs spawn clear of pinned ones', async () => {
  const geometrySource = readFileSync(new URL('../mods/blob-garden/geometry.js', import.meta.url), 'utf8');
  const { arrange } = await import(`data:text/javascript,${encodeURIComponent(geometrySource)}`);
  const sandbox = { ...native, View: class {}, pinAt, positionField, focused: () => null, localStorage: { setItem() {} } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const list = ['a', 'b', 'c'].map(address => ({ address, status: 'idle' }));
  const world = arrange(list, 950, 400);
  // Pin "a" exactly onto the grid slot "b" would otherwise take.
  const slotB = world.placed.find(p => p.a.address === 'b');
  const garden = new sandbox.BlobGarden(); garden.pins = { a: pinAt(slotB.x, slotB.y, world) };
  garden.spawnView(list, world, { ...garden.pins });
  const at = address => garden.spawnField.placed.find(p => p.a.address === address);
  const stepX = world.cellWidth + 36 * world.scale, stepY = world.cellHeight + 28 * world.scale;
  for (const [x, y] of [['a', 'b'], ['a', 'c'], ['b', 'c']]) {
    const p = at(x), q = at(y);
    assert(Math.abs(p.x - q.x) >= stepX - 0.01 || Math.abs(p.y - q.y) >= stepY - 0.01, `${x} and ${y} do not overlap`);
  }
});
