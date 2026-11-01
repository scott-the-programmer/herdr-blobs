import { View, div, PathBuilder, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, spaces, focused, run, props, setAgentOrder, openOverlay, closeOverlay, theme, exec, nextCommand, settings } from "herdr";
import { arrange } from "./geometry.js";
import { pinAt, positionField, attachField, descendants, tidyPins } from "./positions.js";
import { contextSize, terminalDirectory, directoryLabel } from "./context.js";
import { readCounters as readCodex } from "./codex.js";
import { readCounters as readClaude } from "./claude.js";
import { blobType, TYPES } from "./types.js";
import { demoProperties } from "./demo.js";
import { blobName, tabRenames } from "./naming.js";

const C = { ink: "#edf0e5", muted: "#9da99c", line: "#303b34", ground: "#101913", working: "#b5d97b", blocked: "#f2b477", done: "#92cfc3", idle: "#a6abc3" };
const WORD = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };

// Include descendants without panes when their parent already appears in the garden.
// Screen pixels per canvas pixel. App zoom scales what the garden draws but not the pointer,
// so pointer distances divide by this before they become canvas distances.
function screenScale(bounds, field) {
  const scale = bounds?.width / field?.width;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

// paint_path draws raw pixels, but layout and hit boxes shrink or grow with app zoom.
// Path coordinates multiply by this so a star or tether lines up with its element.
// Read outside render: settings() is too slow to call for every star on every frame.
let appZoom = 1;
function readAppZoom() {
  try {
    const zoom = Number(typeof settings === "function" ? settings()?.zoom : 1);
    const next = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const changed = next !== appZoom;
    appZoom = next;
    return changed;
  } catch (_) { return false; }
}
function pathZoom() { return appZoom; }

// A loop over absolute positions, rebased to offsets from `rest`.
function drift(loop, rest) {
  return { ...loop, from: loop.from - rest, to: loop.to - rest };
}

function liveAgents() {
  const all = terminals().filter(t => t.state === "live");
  const list = agents().map(a => {
    const terminal = all.find(t => t.address === a.address);
    return { ...a, cwd: terminalDirectory(terminal), parent: terminal?.parent };
  });
  const known = new Set(list.map(a => a.address));
  let added = true;
  while (added) {
    added = false;
    for (const t of all) {
      if (known.has(t.address) || !known.has(t.parent) || !t.status) continue;
      const parent = list.find(a => a.address === t.parent);
      list.push({ address: t.address, title: t.title || t.name || t.program?.name || t.address,
        cwd: terminalDirectory(t) || parent.cwd, space: parent.space, space_name: parent.space_name, program: t.program, status: t.status === "error" ? "blocked" : t.status,
        parent: t.parent, child: true });
      known.add(t.address);
      added = true;
    }
  }
  // A parent counts only when its blob is in the garden too.
  return list.map(a => ({ ...a, parent: a.parent !== a.address && known.has(a.parent) ? a.parent : null,
    demo: demoProperties(all.find(t => t.address === a.address)?.labels), status: WORD[a.status] ? a.status : "idle" }));
}

export default class BlobGarden extends View {
  init(_props, cx) {
    this.fieldSize = { width: 950, height: 300 };
    this.zoom = 1;
    this.context = {};
    this.pins = {};
    this.pan = { x: 0, y: 0 };
    this.views = {};
    this.selection = [];
    try {
      const pins = JSON.parse(localStorage.getItem("positions-v1") || "{}");
      if (pins && typeof pins === "object" && !Array.isArray(pins)) this.pins = pins;
      const pan = JSON.parse(localStorage.getItem("canvas-pan-v1") || "null");
      if (Number.isFinite(pan?.x) && Number.isFinite(pan?.y)) this.pan = pan;
      const pans = JSON.parse(localStorage.getItem("canvas-pan-v2") || "{}");
      for (const [space, pan] of Object.entries(pans && typeof pans === "object" ? pans : {})) {
        if (Number.isFinite(pan?.x) && Number.isFinite(pan?.y)) this.views[space] = { pan };
      }
    } catch (_) {}
    if (props()?.role !== "board") return;
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "clear-selection") { this.selection = []; cx.notify(); }
      }
    });
    cx.spawn(async cx => this.refreshContext(cx));
    cx.timer.every(10000, cx => cx.spawn(async cx => this.refreshContext(cx)));
    this.nameTabs();
    cx.timer.every(3000, () => this.nameTabs());
    readAppZoom();
    cx.timer.every(2000, cx => { if (readAppZoom()) cx.notify(); });
  }

  // Give each agent's tab the topic its agent put in its terminal title.
  nameTabs() {
    let given = {};
    try { given = JSON.parse(localStorage.getItem("tab-names-v1") || "{}") || {}; } catch (_) {}
    const renames = tabRenames(spaces(), agents(), given);
    if (!renames.length) return;
    for (const { id, name } of renames) { run("tab.rename", { id, name }); given[id] = name; }
    const live = new Set(spaces().flatMap(s => (s.tabs || []).map(t => t.id)));
    for (const id of Object.keys(given)) if (!live.has(id)) delete given[id];
    try { localStorage.setItem("tab-names-v1", JSON.stringify(given)); } catch (_) {}
  }

  async refreshContext(cx) {
    if (this.readingContext) return;
    this.readingContext = true;
    try {
      const groups = new Map();
      for (const t of terminals().filter(t => t.state === "live")) {
        const names = [t.program?.key, t.report?.app, t.status?.app, t.foreground?.name].map(value => String(value || ""));
        const agent = names.some(value => value.includes("codex")) ? "codex" : names.some(value => value.includes("claude")) ? "claude" : null;
        if (!agent) continue;
        const machine = t.address.includes("/") ? t.address.split("/")[0] : null;
        if (!groups.has(machine)) groups.set(machine, []);
        groups.get(machine).push({ address: t.address, agent, title: t.title, cwd: terminalDirectory(t), pid: t.foreground?.pid,
          session: t.labels?.["codex.thread"] || t.labels?.["codex.session"] });
      }
      const reports = await Promise.all([...groups].flatMap(([machine, targets]) => {
        const run = (script, args) => exec("sh", ["-c", script, "sh", ...args], machine ? { on: machine } : {});
        // Each agent's reader sees only its own terminals, so a Claude terminal never borrows
        // a Codex log from the same directory.
        return [[readCodex, "codex"], [readClaude, "claude"]].map(async ([read, agent]) => {
          try { return await read(targets.filter(t => t.agent === agent), run); } catch (_) { return {}; }
        });
      }));
      const next = Object.assign({}, ...reports);
      if (JSON.stringify(next) !== JSON.stringify(this.context)) { this.context = next; cx.notify(); }
    } finally { this.readingContext = false; }
  }

  // Each space has its own canvas: pan, zoom, and spawn anchor switch with the space.
  // The first space entered keeps the view loaded at startup.
  enterSpace(space) {
    const key = space ?? "";
    if (this.space !== undefined && key === this.space) return;
    this.views ||= {};
    if (this.space !== undefined) this.views[this.space] = { pan: this.pan, zoom: this.zoom, spawnField: this.spawnField, lastActive: this.lastActive };
    const view = this.views[key];
    if (view || this.space !== undefined) {
      this.pan = view?.pan || { x: 0, y: 0 };
      this.zoom = view?.zoom || 1;
      this.spawnField = view?.spawnField;
      this.lastActive = view?.lastActive;
    }
    this.space = key;
    this.selection = [];
  }

  savePan() {
    this.views ||= {};
    const key = this.space ?? "";
    this.views[key] = { ...this.views[key], pan: this.pan || { x: 0, y: 0 } };
    if (typeof localStorage === "undefined") return;
    const pans = {};
    for (const [space, view] of Object.entries(this.views)) if (view?.pan) pans[space] = view.pan;
    localStorage.setItem("canvas-pan-v2", JSON.stringify(pans));
  }

  demoView(list) {
    const demo = list.find(a => a.demo?.zoom)?.demo;
    const key = demo ? `${demo.run}:${demo.zoom}` : null;
    if (key !== (this.demoKey || null)) {
      if (demo) {
        if (!this.demoKey) this.beforeDemo = { zoom: this.zoom, pan: this.pan };
        this.zoom = demo.zoom;
        this.pan = { x: 0, y: 0 };
      } else if (this.beforeDemo) {
        this.zoom = this.beforeDemo.zoom;
        this.pan = this.beforeDemo.pan;
        this.beforeDemo = null;
      }
      this.demoKey = key;
    }
    const pins = { ...this.pins };
    for (const a of list) {
      if (a.demo?.pin && !pins[a.address]) pins[a.address] = a.demo.pin;
    }
    return pins;
  }

  spawnView(list, world, pins) {
    const previous = this.spawnField;
    const newcomers = previous ? list.filter(a => !previous.placed.some(p => p.a.address === a.address)) : [];
    const spawning = newcomers.filter(a => !pins[a.address]);
    if (spawning.length && previous.placed.length) {
      // Focus may already point at the new terminal, so use the previous active blob.
      const anchor = previous.placed.find(p => p.a.address === this.lastActive)
        || previous.placed.find(p => list.some(a => a.address === p.a.address));
      if (anchor) {
        this.pins ||= {};
        for (const p of previous.placed) {
          if (!list.some(a => a.address === p.a.address) || p.a.demo?.pin && !this.pins[p.a.address]) continue;
          pins[p.a.address] = this.pins[p.a.address] = pinAt(p.x, p.y, world);
        }
        const occupied = positionField(world, pins).placed.filter(p => !spawning.some(a => a.address === p.a.address));
        const spots = new Map(occupied.map(p => [p.a.address, p]));
        const stepX = world.cellWidth + 36 * world.scale;
        const stepY = world.cellHeight + 28 * world.scale;
        // Place parents first so each sub-agent can spawn beside its parent.
        const depth = a => {
          const seen = new Set();
          let d = 0;
          for (let p = a.parent; p && !seen.has(p); p = list.find(b => b.address === p)?.parent) { seen.add(p); d++; }
          return d;
        };
        spawning.sort((a, b) => depth(a) - depth(b));
        for (const a of spawning) {
          const near = spots.get(a.parent) || anchor;
          let spot;
          for (let ring = 1; !spot; ring++) {
            const offsets = [[ring, 0], [-ring, 0], [0, ring], [0, -ring]];
            for (let n = -ring; n <= ring; n++) {
              offsets.push([ring, n], [-ring, n], [n, ring], [n, -ring]);
            }
            for (const [dx, dy] of offsets) {
              const candidate = { x: near.x + dx * stepX, y: near.y + dy * stepY };
              if (occupied.every(p => Math.abs(p.x - candidate.x) >= stepX - 0.001
                || Math.abs(p.y - candidate.y) >= stepY - 0.001)) { spot = candidate; break; }
            }
          }
          pins[a.address] = this.pins[a.address] = pinAt(spot.x, spot.y, world);
          occupied.push(spot);
          spots.set(a.address, spot);
        }
        if (typeof localStorage !== "undefined") localStorage.setItem("positions-v1", JSON.stringify(this.pins));
      }
    }
    this.spawnField = positionField(world, pins);
    const active = (this.focus === undefined ? focused() : this.focus)?.agent;
    if (list.some(a => a.address === active)) this.lastActive = active;
    return pins;
  }

  button(id, label, action) {
    return div().id(id).px(12).py(7).rounded(8).border(1).border_color(C.line)
      .text_size(12).text_color(C.ink).cursor_pointer().hover(s => s.bg("#28362b"))
      .on_click(action).child(label);
  }

  newAgent() {
    openOverlay({ mod: "blob-launcher", kind: "dialog", width: 600, height: 660 });
  }

  setZoom(value, cx, anchor) {
    const previous = this.zoom || 1;
    const next = Math.max(0.1, Math.min(4, value));
    const center = { x: (this.fieldSize?.width || 0) / 2, y: (this.fieldSize?.height || 0) / 2 };
    const point = anchor || center;
    const pan = this.pan || { x: 0, y: 0 };
    const ratio = next / previous;
    this.pan = { x: point.x - center.x - (point.x - center.x - pan.x) * ratio,
      y: point.y - center.y - (point.y - center.y - pan.y) * ratio };
    this.zoom = next;
    this.savePan();
    cx.notify();
  }

  wheel(event, cx, field) {
    if (this.gesture) return;
    const scale = screenScale(event.bounds, field);
    const point = event.bounds ? { x: (event.position.x - event.bounds.x) / scale, y: (event.position.y - event.bounds.y) / scale }
      : event.local_position && { x: event.local_position.x / scale, y: event.local_position.y / scale };
    if (!point) return;
    cx.stop_propagation();
    if (event.modifiers?.shift) {
      const pan = this.pan || { x: 0, y: 0 };
      this.pan = { x: pan.x + event.delta.x / scale, y: pan.y + event.delta.y / scale };
      this.savePan();
      cx.notify();
    } else {
      this.setZoom(this.zoom * Math.exp(event.delta.y * 0.002), cx, point);
    }
  }

  resetView(cx) {
    this.pan = { x: 0, y: 0 };
    this.savePan();
    this.zoom = 1;
    cx.notify();
  }

  // Lost blobs come back: lay out this space's blobs around the current view, keeping pan,
  // zoom, and other spaces' pins.
  tidy(cx) {
    if (!this.world) return;
    this.pins = { ...this.pins, ...tidyPins(this.world, this.pan, this.zoom) };
    if (typeof localStorage !== "undefined") localStorage.setItem("positions-v1", JSON.stringify(this.pins));
    cx.notify();
  }

  beginGesture(kind, event, address) {
    if (!event.position) return;
    this.suppressClick = null;
    this.gesture = { kind, address, start: event.position, pan: { ...(this.pan || { x: 0, y: 0 }) },
      offset: event.bounds ? { x: event.position.x - event.bounds.x, y: event.position.y - event.bounds.y } : { x: 0, y: 0 } };
    // Sub-agents ride along when their parent moves.
    const placed = this.spawnField?.placed;
    // Drag by pointer delta from the blob's settled world position. Mouse-down bounds are
    // missing before first paint.
    const origin = kind === "blob" && placed?.find(p => p.a.address === address);
    if (origin) this.gesture.origin = { x: origin.x, y: origin.y };
    if (kind === "blob" && placed) {
      this.gesture.group = {};
      for (const member of [address, ...descendants(placed, address)]) {
        const p = placed.find(p => p.a.address === member);
        if (p) this.gesture.group[member] = pinAt(p.x, p.y, this.spawnField);
      }
    }
  }

  dragging(address) {
    const gesture = this.gesture;
    return Boolean(gesture?.moved && (gesture.address === address || gesture.group?.[address]));
  }

  beginSelection(event, cx, address) {
    if (!event.position) return;
    this.selectionBox = null;
    this.gesture = { kind: "selection", address, start: event.position, current: event.position,
      previous: event.modifiers?.shift ? [...(this.selection || [])] : [] };
    cx.stop_propagation();
  }

  finishSelection(cx, openMenu = true) {
    const gesture = this.gesture;
    if (gesture?.kind !== "selection") return;
    this.gesture = null;
    this.selectionBox = null;
    if (!gesture.moved && openMenu) {
      if (gesture.address && !this.selection?.includes(gesture.address)) this.selection = [gesture.address];
      const targets = liveAgents().filter(a => this.selection?.includes(a.address))
        .map(a => ({ terminal: a.address, name: blobName(a) }));
      if (targets.length) openOverlay({ mod: "blob-garden", kind: "popup", width: 260, height: 184,
        at: gesture.start, props: { role: "selection-menu", targets } });
    }
    cx.notify();
  }

  moveGesture(event, field, cx) {
    const gesture = this.gesture;
    if (!gesture) return;
    const screenDx = event.position.x - gesture.start.x, screenDy = event.position.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(screenDx, screenDy) < 4) return;
    gesture.moved = true;
    if (event.bounds) gesture.scale = screenScale(event.bounds, field);
    const scale = gesture.scale || 1;
    const dx = screenDx / scale, dy = screenDy / scale;
    if (gesture.kind === "selection") {
      if (!event.bounds) return;
      gesture.current = event.position;
      const left = (Math.min(gesture.start.x, event.position.x) - event.bounds.x) / scale;
      const top = (Math.min(gesture.start.y, event.position.y) - event.bounds.y) / scale;
      const right = (Math.max(gesture.start.x, event.position.x) - event.bounds.x) / scale;
      const bottom = (Math.max(gesture.start.y, event.position.y) - event.bounds.y) / scale;
      this.selectionBox = { left, top, width: right - left, height: bottom - top };
      const hits = (this.selectionField?.placed || []).filter(p => {
        const view = this.selectionField;
        const diameter = contextSize(p.a.demo?.context || this.context?.[p.a.address], view.scale).diameter;
        const x = p.x + (view.cellWidth - diameter) / 2;
        const y = p.y + view.cellHeight - 92 * view.scale - diameter;
        return x <= right && x + diameter >= left && y <= bottom && y + diameter >= top;
      }).map(p => p.a.address);
      this.selection = [...new Set([...gesture.previous, ...hits])];
    } else if (gesture.kind === "pan") this.pan = { x: gesture.pan.x + dx, y: gesture.pan.y + dy };
    else if (gesture.origin || event.bounds) {
      this.pins ||= {};
      const zoom = this.zoom || 1;
      this.pins[gesture.address] = gesture.origin
        ? pinAt(gesture.origin.x + dx / zoom, gesture.origin.y + dy / zoom, field)
        : pinAt(
          ((event.position.x - gesture.offset.x - event.bounds.x) / scale - (this.pan?.x || 0) - field.width / 2 * (1 - zoom)) / zoom,
          ((event.position.y - gesture.offset.y - event.bounds.y) / scale - (this.pan?.y || 0) - field.height / 2 * (1 - zoom)) / zoom, field);
      const base = gesture.group?.[gesture.address], next = this.pins[gesture.address];
      if (base) for (const [member, pin] of Object.entries(gesture.group)) {
        if (member !== gesture.address) this.pins[member] = { x: pin.x + next.x - base.x, y: pin.y + next.y - base.y };
      }
      this.suppressClick = gesture.address;
    }
    cx.notify();
  }

  endGesture(cx) {
    if (!this.gesture) return;
    if (this.gesture.kind === "selection") { this.finishSelection(cx, false); return; }
    if (this.gesture.moved && typeof localStorage !== "undefined") {
      localStorage.setItem("positions-v1", JSON.stringify(this.pins || {}));
      this.savePan();
    }
    this.gesture = null;
    cx.notify();
  }

  select(address) {
    run("agent.focus", { terminal: address });
    run("pane.focus", { terminal: address });
    if (liveAgents().find(a => a.address === address)?.child) {
      run("terminal.show", { terminal: address });
    }
  }

  face(a, scale) {
    // Hash the address so reordering, resizing, and status changes preserve the face.
    let seed = 2166136261;
    for (const char of a.address) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    const styles = [
      { eyes: [[7, 10], [7, 10]], gap: 14, mouth: "smile", width: 16 },
      { eyes: [[6, 6], [6, 6]], gap: 16, mouth: "open", width: 10 },
      { eyes: [[7, 10], [9, 3]], gap: 13, mouth: "smile", width: 15 },
      { eyes: [[9, 4], [9, 4]], gap: 11, mouth: "flat", width: 12 },
      { eyes: [[8, 12], [8, 12]], gap: 12, mouth: "smile", width: 19 },
      { eyes: [[6, 8], [8, 11]], gap: 15, mouth: "flat", width: 9 },
    ];
    const style = styles[seed % styles.length];
    const ink = "#263325";
    const mouth = a.status === "blocked" ? "open" : a.status === "done" ? "smile" : style.mouth;
    const width = (a.status === "blocked" ? 7 + seed % 4 : style.width) * scale;
    const height = (mouth === "flat" ? 3 : mouth === "open" ? 9 : 8) * scale;
    const lips = div().w(width).h(height).flex_none().rounded(5 * scale).bg(ink);
    if (mouth === "smile") {
      lips.relative().overflow_hidden().child(div().absolute().left(0).top(-3 * scale)
        .w(width).h(8 * scale).rounded(4 * scale).bg(C[a.status]));
    } else if (mouth === "open") {
      lips.border(2 * scale).border_color(ink).bg(C[a.status]);
    }
    return v_flex().size_full().items_center().justify_center().gap(7 * scale)
      .child(h_flex().h(12 * scale).gap(style.gap * scale).items_center()
        .children(style.eyes.map(([w, h], eye) => {
          const height = (a.status === "idle" ? Math.min(h, 3) : h) * scale;
          return div().id(`eye-${a.address}-${eye}`).w(w * scale).h(height)
            .flex_none().rounded(5 * scale).bg(ink)
            .loop("height", { from: height, to: Math.min(1.5 * scale, height),
              period: 4200 + seed % 2400, easing: "ease-in" });
        })))
      .child(lips);
  }

  harnessLogo(a, type, diameter, scale) {
    const star = type.id === "frost" || type.id === "cosmic";
    const program = a.program;
    const path = program?.icon || "icons/agent.svg";
    const logo = program?.tint === false ? image(path) : svg(path).text_color("#263325");
    return h_flex().absolute().top(star ? diameter * 0.1 : 2 * scale).left(0).w_full()
      .justify_center().child(logo.size((star ? 12 : 18) * scale).flex_none());
  }

  shape(body, type, diameter, scale, color, selected) {
    if (type.id === "frost" || type.id === "cosmic") {
      const border = (selected ? 3 : 2) * scale;
      const zoom = pathZoom();
      const points = Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = (diameter - border) * (i % 2 ? 0.29 : 0.5);
        return [(diameter / 2 + Math.cos(angle) * radius) * zoom, (diameter / 2 + Math.sin(angle) * radius) * zoom];
      });
      const fill = PathBuilder.fill().add_polygon(points, true).build();
      const outline = PathBuilder.stroke(border * zoom).add_polygon(points, true).build();
      return body.bg("#00000000").border(0)
        .child(window.paint_path(fill, color).absolute().inset_0().size_full())
        .child(window.paint_path(outline, selected ? C.ink : type.accent).absolute().inset_0().size_full());
    }
    const corners = {
      pebble: [0.38, 0.48, 0.32, 0.44],
      sprout: [0.48, 0.28, 0.45, 0.32],
      ripple: [0.28, 0.42, 0.28, 0.42],
      ember: [0.08, 0.5, 0.44, 0.5],
    }[type.id] || [0.5, 0.5, 0.5, 0.5];
    return body.rounded_tl(corners[0] * diameter).rounded_tr(corners[1] * diameter)
      .rounded_br(corners[2] * diameter).rounded_bl(corners[3] * diameter);
  }

  blob(a, index, cellWidth, cellHeight, scale, focus = focused()) {
    const context = contextSize(a.demo?.context || this.context?.[a.address], scale);
    const diameter = context.diameter;
    const selected = focus?.agent === a.address || this.selection?.includes(a.address);
    const color = C[a.status];
    const type = TYPES.find(t => t.id === a.demo?.type) || blobType(a.address);
    const name = blobName(a);
    // Move only the body; labels and context-sized dimensions stay fixed.
    let seed = 2166136261;
    for (const char of a.address) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    const motion = { working: [5, 2000], blocked: [3, 3000], done: [4, 2800], idle: [2, 4800] }[a.status] || [2, 4800];
    return v_flex().w(cellWidth).h(cellHeight).flex_none().items_center().justify_end().gap(8 * scale)
      .child(div().id(`blob-${a.address}`).relative().w(diameter).h(diameter).flex_none().rounded(diameter / 2)
        .bg(color).border((selected ? 3 : type.rarity === "Common" ? 1 : 2) * scale).border_color(selected ? C.ink : type.rarity === "Common" ? color : type.accent)
        .map(el => this.shape(el, type, diameter, scale, color, selected))
        .cursor_pointer().hover(s => s.opacity(0.85))
        .when(this.gesture?.kind !== "selection", el => el.tooltip(`${name.length > 40 ? name.slice(0, 39) + "…" : name}\n${WORD[a.status]} · ${context.label}`))
        .on_click(() => { if (this.suppressClick !== a.address) this.select(a.address); })
        .on_mouse_down("right", (event, cx) => this.beginSelection(event, cx, a.address))
        .child(this.face(a, scale).absolute().inset_0())
        .child(this.harnessLogo(a, type, diameter, scale))
        .when(this.gesture?.kind !== "selection" && !this.dragging(a.address), el => el.top(0).loop("top", {
          from: 0, to: -motion[0] * scale, period: motion[1] + seed % 700
        }))
        .when(a.status === "working", el => el.loop("opacity", { from: 0.78, to: 1, period: 2400 + index * 160 })))
      .child(div().h(18 * scale).flex_none().max_w(cellWidth - 16 * scale).truncate().text_size(13 * scale).text_color(C.ink).child(name))
      .child(div().h(16 * scale).flex_none().max_w(cellWidth - 16 * scale).truncate().text_size(11 * scale).text_color(C.muted).child(`${a.child ? "Sub-agent · " : ""}${directoryLabel(a.cwd)}`))
      .child(h_flex().h(16 * scale).flex_none().max_w(cellWidth - 16 * scale).gap(6 * scale).items_center()
        .child(div().size(5 * scale).rounded(3 * scale).bg(color))
        .child(div().truncate().text_size(11 * scale).text_color(color).child(`${WORD[a.status]} · ${context.label}`)))
      .child(div().h(10 * scale).flex_none());
  }

  // A line from parent body to sub-agent body, drawn under both and drifting with them.
  tether(t, field) {
    const center = p => {
      const diameter = contextSize(p.a.demo?.context || this.context?.[p.a.address], field.scale).diameter;
      return [p.x + field.cellWidth / 2, p.y + field.cellHeight - 92 * field.scale - diameter / 2];
    };
    const [x1, y1] = center(t.parent), [x2, y2] = center(t.child);
    const zoom = pathZoom();
    const path = PathBuilder.stroke(2 * field.scale * zoom).move_to(x1 * zoom, y1 * zoom).line_to(x2 * zoom, y2 * zoom).build();
    return window.paint_path(path, "#9da99c66").id(`tether-${t.child.a.address}`).absolute()
      .left(0).top(0).w(field.width).h(field.height)
      .when(this.gesture?.kind !== "selection", el => el.loop("left", t.drift.left).loop("top", t.drift.top));
  }

  selectionMenu() {
    const { targets = [], overlay } = props();
    const t = theme();
    return v_flex().size_full().p(12).gap(8).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(13).child(`${targets.length} selected`))
      .child(this.button("selection-open", "Open first selected", () => {
        closeOverlay(overlay); if (targets[0]) this.select(targets[0].terminal);
      }))
      .child(this.button("selection-clear-menu", "Clear selection", () => {
        closeOverlay(overlay); run("blob-garden.clear-selection");
      }))
      .child(this.button("selection-kill", "Kill selected…", () => {
        closeOverlay(overlay);
        openOverlay({ mod: "blob-garden", kind: "dialog", width: 420, height: 210,
          props: { role: "kill-dialog", targets } });
      }));
  }

  killDialog() {
    const { terminal, name, targets: group, overlay } = props();
    const targets = group || (terminal ? [{ terminal, name }] : []);
    const t = theme();
    return v_flex().id("kill-dialog").size_full().p(20).gap(12).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(18).font_semibold().child(targets.length > 1 ? `Kill ${targets.length} agents?` : "Kill agent?"))
      .child(div().text_size(13).truncate().child(targets.map(t => t.name || t.terminal).join(", ")))
      .child(div().text_size(12).text_color(t.muted).child("This ends the selected agents and their sub-agents."))
      .child(h_flex().flex_1().items_end().justify_end().gap(8)
        .child(this.button("kill-cancel", "Cancel", () => closeOverlay(overlay)))
        .child(this.button("kill-confirm", "Kill", () => {
          if (this.killing || !targets.length) return;
          this.killing = true;
          closeOverlay(overlay);
          for (const terminal of new Set(targets.map(t => t.terminal))) run("terminal.kill", { terminal });
        }).text_color(t.danger || "#f2b477")));
  }

  render() {
    const role = props()?.role;
    if (role === "kill-dialog") return this.killDialog();
    if (role === "selection-menu") return this.selectionMenu();
    // Each host read is a round trip. A drag frame reuses the last ones: nothing they report
    // changes while a blob is held, and the pointer moves faster than they answer.
    const host = this.gesture?.moved && this.host ? this.host : (this.host = { everyone: liveAgents(), focus: focused() });
    const { everyone, focus } = host;
    this.focus = focus;
    const selected = everyone.find(a => a.address === focus?.agent);
    if (role === "header") return h_flex().size_full().px(24).items_center().justify_between().bg(C.ground)
      .child(h_flex().gap(12).items_center()
        .child(div().size(11).rounded(6).bg(C.working))
        .child(div().text_size(17).font_semibold().text_color(C.ink).child("blobs"))
        .child(div().text_size(11).text_color(C.muted).child("Agent sessions")))
      .child(h_flex().gap(8)
        .child(this.button("new-agent", "+ New agent", () => this.newAgent()))
        .child(this.button("palette", "Commands", () => run("app.palette"))));
    if (role === "terminal-label") return h_flex().size_full().px(20).items_center().justify_between()
      .child(h_flex().gap(10).items_center()
        .child(div().size(6).rounded(3).bg(C[selected?.status] || C.idle))
        .child(div().text_size(11).text_color(C.muted).child("Session"))
        .child(div().text_size(12).text_color(C.ink).truncate().child(selected ? `${blobName(selected)} · ${selected.address}` : "Select an agent above")))
      .child(h_flex().gap(8)
        .child(this.button("prev", "Previous", () => run("agent.prev")))
        .child(this.button("next", "Next", () => run("agent.next"))));
    // The garden shows the active space's agents only.
    const space = focus?.space || null;
    this.enterSpace(space);
    const list = space ? everyone.filter(a => a.space === space) : everyone;
    const pins = this.demoView(list);
    if (this.measuredSize) this.fieldSize = { width: this.measuredSize.width / pathZoom(), height: this.measuredSize.height / pathZoom() };
    const world = arrange(list, this.fieldSize.width, this.fieldSize.height);
    this.world = world;
    this.spawnView(list, world, pins);
    const field = attachField(positionField(world, pins, this.pan, this.zoom));
    this.selection = (this.selection || []).filter(address => list.some(a => a.address === address));
    this.selectionField = field;
    if (!this.gesture?.moved) setAgentOrder(field.placed.map(p => p.a.address));
    return v_flex().id("garden-root").size_full().min_h(0).bg(C.ground).px(24)
      .child(h_flex().h(list.length > 1 ? 34 : 65).flex_none().items_center().justify_between()
        .child(v_flex().gap(4)
          .when(list.length <= 1, el => el.child(div().text_size(24).font_semibold().text_color(C.ink).child("Agent sessions")))
          .child(div().text_size(12).text_color(C.muted).child(`${list.length} agent${list.length === 1 ? "" : "s"} in ${space ? list[0]?.space_name || "this space" : "your spaces"}`))))
      .child(v_flex().id("garden-scroll").flex_1().min_h(0).overflow_hidden()
        .on_size_change((size, cx) => {
          // The size arrives in screen points; the canvas is laid out in app-zoomed pixels.
          const seen = this.measuredSize;
          if (!seen || Math.abs(size.width - seen.width) > 1 || Math.abs(size.height - seen.height) > 1) {
            this.measuredSize = size; cx.notify();
          }
        })
        .when(list.length > 0, el => el.child(div().id("blob-canvas").relative().w(field.width).h(field.height).flex_none()
          .on_scroll_wheel((event, cx) => this.wheel(event, cx, field))
          .on_mouse_down("left", event => this.beginGesture("pan", event))
          .on_mouse_down("right", (event, cx) => this.beginSelection(event, cx))
          .on_mouse_move((event, cx) => this.moveGesture(event, world, cx))
          .on_mouse_up("left", (_event, cx) => this.endGesture(cx))
          .on_mouse_up("right", (_event, cx) => this.finishSelection(cx))
          .on_hover((inside, cx) => { if (!inside) this.endGesture(cx); })
          .children(field.tethers.map(t => this.tether(t, field)))
          // The cell sits at its place; the orbit drifts an inner box by a few pixels. Loops
          // ignore app zoom while left/top follow it, so a loop over whole canvas positions
          // drew blobs far from where drags and hit tests put them.
          .children(field.placed.map((p, index) => div().id(`orbit-${p.a.address}`).absolute().left(p.x).top(p.y)
            .w(field.cellWidth).h(field.cellHeight)
            .on_mouse_down("left", (event, cx) => { cx.stop_propagation(); this.beginGesture("blob", event, p.a.address); })
            .child(this.blob(p.a, index, field.cellWidth, field.cellHeight, field.scale, focus).absolute().left(0).top(0)
              .when(this.gesture?.kind !== "selection", el => el.loop("left", drift(p.orbit.left, p.x)).loop("top", drift(p.orbit.top, p.y))))))
          .when(this.gesture?.kind === "selection" && this.selectionBox, el => el.child(div().absolute()
            .left(this.selectionBox.left).top(this.selectionBox.top).w(this.selectionBox.width).h(this.selectionBox.height)
            .border(1).border_color(C.working).bg("#b5d97b22")))))
        .when(list.length === 0, el => el.child(v_flex().h(210).items_center().justify_center().gap(12)
          .child(div().text_size(20).text_color(C.ink).child("No agents yet"))
          .child(div().text_size(13).text_color(C.muted).child("Start a status-reporting agent in this space. Its blob appears here."))
          .child(this.button("start-menu", "+ New agent", () => this.newAgent())))))
      .child(h_flex().h(42).flex_none().items_center().justify_between()
        .child(h_flex().gap(18).children(Object.keys(WORD).map(status => h_flex().gap(6).items_center()
          .child(div().size(6).rounded(3).bg(C[status]))
          .child(div().text_size(11).text_color(C.muted).child(WORD[status])))))
        .child(h_flex().gap(6).items_center()
          .when(this.selection.length > 0, el => el.child(this.button("selection-clear", `${this.selection.length} selected · Clear`, (_event, cx) => {
            this.selection = []; cx.notify();
          })))
          .when(list.length > 0, el => el.child(this.button("tidy", "Tidy", (_event, cx) => this.tidy(cx)).tooltip("Gather every blob into the current view")))
          .child(this.button("zoom-out", "−", (_event, cx) => this.setZoom(Math.round((this.zoom - 0.1) * 100) / 100, cx)).tooltip("Zoom out · Scroll to zoom at cursor · Shift-scroll or drag background to pan"))
          .child(this.button("zoom-reset", `${Math.round(this.zoom * 100)}%`, (_event, cx) => this.resetView(cx)).tooltip("Reset zoom to fit"))
          .child(this.button("zoom-in", "+", (_event, cx) => this.setZoom(Math.round((this.zoom + 0.1) * 100) / 100, cx)).tooltip("Zoom in · Scroll to zoom at cursor"))));
  }
}
