import { View, div, PathBuilder, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, focused, run, props, setAgentOrder, openOverlay, closeOverlay, theme, exec, readTextFile, appHome, nextCommand } from "herdr";
import { arrange } from "./geometry.js";
import { pinAt, positionField } from "./positions.js";
import { contextSize, terminalDirectory, directoryLabel } from "./context.js";
import { blobType, TYPES } from "./types.js";
import { demoProperties } from "./demo.js";

const C = { ink: "#edf0e5", muted: "#9da99c", line: "#303b34", ground: "#101913", working: "#b5d97b", blocked: "#f2b477", done: "#92cfc3", idle: "#a6abc3" };
const WORD = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };

// Include descendants without panes when their parent already appears in the garden.
function liveAgents() {
  const all = terminals().filter(t => t.state === "live");
  const list = agents().map(a => ({ ...a, cwd: terminalDirectory(all.find(t => t.address === a.address)) }));
  const known = new Set(list.map(a => a.address));
  let added = true;
  while (added) {
    added = false;
    for (const t of all) {
      if (known.has(t.address) || !known.has(t.parent) || !t.status) continue;
      const parent = list.find(a => a.address === t.parent);
      list.push({ address: t.address, title: t.name || t.program?.name || t.address,
        cwd: terminalDirectory(t) || parent.cwd, space_name: parent.space_name, program: t.program, status: t.status === "error" ? "blocked" : t.status,
        child: true });
      known.add(t.address);
      added = true;
    }
  }
  return list.map(a => ({ ...a, demo: demoProperties(all.find(t => t.address === a.address)?.labels), status: WORD[a.status] ? a.status : "idle" }));
}

export default class BlobGarden extends View {
  init(_props, cx) {
    this.fieldSize = { width: 950, height: 300 };
    this.zoom = 1;
    this.context = {};
    this.pins = {};
    this.pan = { x: 0, y: 0 };
    this.selection = [];
    try {
      const pins = JSON.parse(localStorage.getItem("positions-v1") || "{}");
      if (pins && typeof pins === "object" && !Array.isArray(pins)) this.pins = pins;
      const pan = JSON.parse(localStorage.getItem("canvas-pan-v1") || "null");
      if (Number.isFinite(pan?.x) && Number.isFinite(pan?.y)) this.pan = pan;
    } catch (_) {}
    if (props()?.role !== "board") return;
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "clear-selection") { this.selection = []; cx.notify(); }
      }
    });
    cx.spawn(async cx => {
      this.contextReader = await readTextFile(`${appHome()}/mods/blob-garden/context.py`);
      await this.refreshContext(cx);
    });
    cx.timer.every(10000, cx => cx.spawn(async cx => this.refreshContext(cx)));
  }

  async refreshContext(cx) {
    if (this.readingContext || !this.contextReader) return;
    this.readingContext = true;
    try {
      const groups = new Map();
      for (const t of terminals().filter(t => t.state === "live")) {
        if (![t.program?.key, t.report?.app, t.status?.app, t.foreground?.name].some(value => String(value || "").includes("codex"))) continue;
        const machine = t.address.includes("/") ? t.address.split("/")[0] : null;
        if (!groups.has(machine)) groups.set(machine, []);
        groups.get(machine).push({ address: t.address, title: t.title, cwd: terminalDirectory(t),
          session: t.labels?.["codex.thread"] || t.labels?.["codex.session"] });
      }
      const reports = await Promise.all([...groups].map(async ([machine, targets]) => {
        try {
          const result = await exec("python3", ["-c", this.contextReader, JSON.stringify(targets)], { on: machine });
          return result.code === 0 ? JSON.parse(result.stdout) : {};
        } catch (_) { return {}; }
      }));
      const next = Object.assign({}, ...reports);
      if (JSON.stringify(next) !== JSON.stringify(this.context)) { this.context = next; cx.notify(); }
    } finally { this.readingContext = false; }
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
        const stepX = world.cellWidth + 36 * world.scale;
        const stepY = world.cellHeight + 28 * world.scale;
        for (const a of spawning) {
          let spot;
          for (let ring = 1; !spot; ring++) {
            const offsets = [[ring, 0], [-ring, 0], [0, ring], [0, -ring]];
            for (let n = -ring; n <= ring; n++) {
              offsets.push([ring, n], [-ring, n], [n, ring], [n, -ring]);
            }
            for (const [dx, dy] of offsets) {
              const candidate = { x: anchor.x + dx * stepX, y: anchor.y + dy * stepY };
              if (occupied.every(p => Math.abs(p.x - candidate.x) >= stepX - 0.001
                || Math.abs(p.y - candidate.y) >= stepY - 0.001)) { spot = candidate; break; }
            }
          }
          pins[a.address] = this.pins[a.address] = pinAt(spot.x, spot.y, world);
          occupied.push(spot);
        }
        if (typeof localStorage !== "undefined") localStorage.setItem("positions-v1", JSON.stringify(this.pins));
      }
    }
    this.spawnField = positionField(world, pins);
    const active = focused()?.agent;
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
    if (typeof localStorage !== "undefined") localStorage.setItem("canvas-pan-v1", JSON.stringify(this.pan));
    cx.notify();
  }

  wheel(event, cx) {
    if (this.gesture) return;
    const point = event.local_position || (event.bounds && {
      x: event.position.x - event.bounds.x, y: event.position.y - event.bounds.y
    });
    if (!point) return;
    cx.stop_propagation();
    if (event.modifiers?.shift) {
      const pan = this.pan || { x: 0, y: 0 };
      this.pan = { x: pan.x + event.delta.x, y: pan.y + event.delta.y };
      if (typeof localStorage !== "undefined") localStorage.setItem("canvas-pan-v1", JSON.stringify(this.pan));
      cx.notify();
    } else {
      this.setZoom(this.zoom * Math.exp(event.delta.y * 0.002), cx, point);
    }
  }

  resetView(cx) {
    this.pan = { x: 0, y: 0 };
    if (typeof localStorage !== "undefined") localStorage.setItem("canvas-pan-v1", JSON.stringify(this.pan));
    this.zoom = 1;
    cx.notify();
  }

  beginGesture(kind, event, address) {
    if (!event.position) return;
    this.suppressClick = null;
    this.gesture = { kind, address, start: event.position, pan: { ...(this.pan || { x: 0, y: 0 }) },
      offset: event.bounds ? { x: event.position.x - event.bounds.x, y: event.position.y - event.bounds.y } : { x: 0, y: 0 } };
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
        .map(a => ({ terminal: a.address, name: a.title || a.program?.name || a.address }));
      if (targets.length) openOverlay({ mod: "blob-garden", kind: "popup", width: 260, height: 184,
        at: gesture.start, props: { role: "selection-menu", targets } });
    }
    cx.notify();
  }

  moveGesture(event, field, cx) {
    const gesture = this.gesture;
    if (!gesture) return;
    const dx = event.position.x - gesture.start.x, dy = event.position.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
    gesture.moved = true;
    if (gesture.kind === "selection") {
      if (!event.bounds) return;
      gesture.current = event.position;
      const left = Math.min(gesture.start.x, event.position.x) - event.bounds.x;
      const top = Math.min(gesture.start.y, event.position.y) - event.bounds.y;
      const right = Math.max(gesture.start.x, event.position.x) - event.bounds.x;
      const bottom = Math.max(gesture.start.y, event.position.y) - event.bounds.y;
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
    else if (event.bounds) {
      this.pins ||= {};
      const zoom = this.zoom || 1;
      this.pins[gesture.address] = pinAt(
        (event.position.x - gesture.offset.x - event.bounds.x - (this.pan?.x || 0) - field.width / 2 * (1 - zoom)) / zoom,
        (event.position.y - gesture.offset.y - event.bounds.y - (this.pan?.y || 0) - field.height / 2 * (1 - zoom)) / zoom, field);
      this.suppressClick = gesture.address;
    }
    cx.notify();
  }

  endGesture(cx) {
    if (!this.gesture) return;
    if (this.gesture.kind === "selection") { this.finishSelection(cx, false); return; }
    if (this.gesture.moved && typeof localStorage !== "undefined") {
      localStorage.setItem("positions-v1", JSON.stringify(this.pins || {}));
      localStorage.setItem("canvas-pan-v1", JSON.stringify(this.pan || { x: 0, y: 0 }));
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
      const points = Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = (diameter - border) * (i % 2 ? 0.29 : 0.5);
        return [diameter / 2 + Math.cos(angle) * radius, diameter / 2 + Math.sin(angle) * radius];
      });
      const fill = PathBuilder.fill().add_polygon(points, true).build();
      const outline = PathBuilder.stroke(border).add_polygon(points, true).build();
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

  blob(a, index, cellWidth, cellHeight, scale) {
    const context = contextSize(a.demo?.context || this.context?.[a.address], scale);
    const diameter = context.diameter;
    const selected = focused()?.agent === a.address || this.selection?.includes(a.address);
    const color = C[a.status];
    const type = TYPES.find(t => t.id === a.demo?.type) || blobType(a.address);
    const name = a.title || a.program?.name || a.address;
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
        .when(!this.gesture, el => el.top(0).loop("top", {
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
    const list = liveAgents();
    const selected = list.find(a => a.address === focused()?.agent);
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
        .child(div().text_size(12).text_color(C.ink).truncate().child(selected ? `${selected.title || selected.program?.name || selected.address} · ${selected.address}` : "Select an agent above")))
      .child(h_flex().gap(8)
        .child(this.button("prev", "Previous", () => run("agent.prev")))
        .child(this.button("next", "Next", () => run("agent.next"))));
    const pins = this.demoView(list);
    const world = arrange(list, this.fieldSize.width, this.fieldSize.height);
    this.spawnView(list, world, pins);
    const field = positionField(world, pins, this.pan, this.zoom);
    this.selection = (this.selection || []).filter(address => list.some(a => a.address === address));
    this.selectionField = field;
    setAgentOrder(field.placed.map(p => p.a.address));
    return v_flex().id("garden-root").size_full().min_h(0).bg(C.ground).px(24)
      .child(h_flex().h(list.length > 1 ? 34 : 65).flex_none().items_center().justify_between()
        .child(v_flex().gap(4)
          .when(list.length <= 1, el => el.child(div().text_size(24).font_semibold().text_color(C.ink).child("Agent sessions")))
          .child(div().text_size(12).text_color(C.muted).child(`${list.length} agent${list.length === 1 ? "" : "s"} across your spaces · size follows context usage`))))
      .child(v_flex().id("garden-scroll").flex_1().min_h(0).overflow_hidden()
        .on_size_change((size, cx) => {
          if (Math.abs(size.width - this.fieldSize.width) > 1 || Math.abs(size.height - this.fieldSize.height) > 1) {
            this.fieldSize = size; cx.notify();
          }
        })
        .when(list.length > 0, el => el.child(div().id("blob-canvas").relative().w(field.width).h(field.height).flex_none()
          .on_scroll_wheel((event, cx) => this.wheel(event, cx))
          .on_mouse_down("left", event => this.beginGesture("pan", event))
          .on_mouse_down("right", (event, cx) => this.beginSelection(event, cx))
          .on_mouse_move((event, cx) => this.moveGesture(event, world, cx))
          .on_mouse_up("left", (_event, cx) => this.endGesture(cx))
          .on_mouse_up("right", (_event, cx) => this.finishSelection(cx))
          .on_hover((inside, cx) => { if (!inside) this.endGesture(cx); })
          .children(field.placed.map((p, index) => this.blob(p.a, index, field.cellWidth, field.cellHeight, field.scale)
            .id(`orbit-${p.a.address}`).absolute().left(p.x).top(p.y)
            .on_mouse_down("left", (event, cx) => { cx.stop_propagation(); this.beginGesture("blob", event, p.a.address); })
            .when(this.gesture?.kind !== "selection" && !(this.gesture?.moved && this.gesture.address === p.a.address), el => el.loop("left", p.orbit.left).loop("top", p.orbit.top))))
          .when(this.gesture?.kind === "selection" && this.selectionBox, el => el.child(div().absolute()
            .left(this.selectionBox.left).top(this.selectionBox.top).w(this.selectionBox.width).h(this.selectionBox.height)
            .border(1).border_color(C.working).bg("#b5d97b22")))))
        .when(list.length === 0, el => el.child(v_flex().h(210).items_center().justify_center().gap(12)
          .child(div().text_size(20).text_color(C.ink).child("No agents yet"))
          .child(div().text_size(13).text_color(C.muted).child("Start a status-reporting agent in any space. Its blob appears here."))
          .child(this.button("start-menu", "+ New agent", () => this.newAgent())))))
      .child(h_flex().h(42).flex_none().items_center().justify_between()
        .child(h_flex().gap(18).children(Object.keys(WORD).map(status => h_flex().gap(6).items_center()
          .child(div().size(6).rounded(3).bg(C[status]))
          .child(div().text_size(11).text_color(C.muted).child(WORD[status])))))
        .child(h_flex().gap(6).items_center()
          .when(this.selection.length > 0, el => el.child(this.button("selection-clear", `${this.selection.length} selected · Clear`, (_event, cx) => {
            this.selection = []; cx.notify();
          })))
          .child(this.button("zoom-out", "−", (_event, cx) => this.setZoom(Math.round((this.zoom - 0.1) * 100) / 100, cx)).tooltip("Zoom out · Scroll to zoom at cursor · Shift-scroll or drag background to pan"))
          .child(this.button("zoom-reset", `${Math.round(this.zoom * 100)}%`, (_event, cx) => this.resetView(cx)).tooltip("Reset zoom to fit"))
          .child(this.button("zoom-in", "+", (_event, cx) => this.setZoom(Math.round((this.zoom + 0.1) * 100) / 100, cx)).tooltip("Zoom in · Scroll to zoom at cursor"))));
  }
}
