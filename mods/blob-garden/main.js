import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, focused, run, props, setAgentOrder, openOverlay } from "herdr";

const C = { ink: "#edf0e5", muted: "#9da99c", line: "#303b34", ground: "#101913", working: "#b5d97b", blocked: "#f2b477", done: "#92cfc3", idle: "#a6abc3" };
const WORD = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };
const minutes = (seconds) => seconds < 60 ? "<1m" : `${Math.floor(seconds / 60)}m`;

// Include pane-less descendants, but leave unrelated core terminals alone.
function liveAgents() {
  const list = agents().map(a => ({ ...a }));
  const all = terminals().filter(t => t.state === "live");
  const known = new Set(list.map(a => a.address));
  let added = true;
  while (added) {
    added = false;
    for (const t of all) {
      if (known.has(t.address) || !known.has(t.parent) || !t.status) continue;
      const parent = list.find(a => a.address === t.parent);
      list.push({ address: t.address, title: t.name || t.program?.name || t.address,
        space_name: parent.space_name, program: t.program, status: t.status === "error" ? "blocked" : t.status,
        child: true });
      known.add(t.address);
      added = true;
    }
  }
  return list.map(a => ({ ...a, status: WORD[a.status] ? a.status : "idle" }));
}

export default class BlobGarden extends View {
  init(_props, cx) {
    this.width = 1000;
    this.last = Date.now();
    try { this.growth = JSON.parse(localStorage.getItem("growth-v1") || "{}"); }
    catch (_) { this.growth = {}; }
    if (!this.growth || typeof this.growth !== "object" || Array.isArray(this.growth)) this.growth = {};
    this.previous = new Set(liveAgents().filter(a => a.status === "working").map(a => a.address));
    if (props()?.role !== "board") return;
    cx.timer.every(10000, (cx) => {
      const now = Date.now();
      const elapsed = Math.min(15, Math.max(0, (now - this.last) / 1000));
      const list = liveAgents();
      for (const a of list) {
        const old = this.growth[a.address];
        const seconds = Number.isFinite(old?.seconds) ? old.seconds : 0;
        this.growth[a.address] = { seconds: seconds + (a.status === "working" && this.previous.has(a.address) ? elapsed : 0), seen: now };
      }
      for (const [address, entry] of Object.entries(this.growth)) {
        if (now - (entry?.seen || 0) > 30 * 86400000) delete this.growth[address];
      }
      this.previous = new Set(list.filter(a => a.status === "working").map(a => a.address));
      this.last = now;
      localStorage.setItem("growth-v1", JSON.stringify(this.growth));
      cx.notify();
    });
  }

  button(id, label, action) {
    return div().id(id).px(12).py(7).rounded(8).border(1).border_color(C.line)
      .text_size(12).text_color(C.ink).cursor_pointer().hover(s => s.bg("#28362b"))
      .on_click(action).child(label);
  }

  newAgent() {
    openOverlay({ mod: "new-menu", kind: "popup", width: 320, height: 460 });
  }

  select(address) {
    run("agent.focus", { terminal: address });
    run("pane.focus", { terminal: address });
  }

  blob(a, index, cellWidth) {
    const seconds = this.growth[a.address]?.seconds || 0;
    const diameter = Math.min(cellWidth - 28, 190, 86 + 21 * Math.log2(1 + seconds / 60));
    const selected = focused()?.agent === a.address;
    const color = C[a.status];
    const name = a.title || a.program?.name || a.address;
    const eye = () => div().w(7).h(a.status === "idle" ? 3 : 10).rounded(5).bg("#263325");
    return v_flex().w(cellWidth).h(242).flex_none().items_center().justify_end().gap(8)
      .child(div().id(`blob-${a.address}`).w(diameter).h(diameter * 0.88)
        .rounded_tl(diameter * 0.48).rounded_tr(diameter * 0.34)
        .rounded_bl(diameter * 0.30).rounded_br(diameter * 0.45)
        .bg(color).border(selected ? 3 : 1).border_color(selected ? C.ink : color)
        .transition("width", 900).transition("height", 900)
        .cursor_pointer().hover(s => s.border_color(C.ink).border(3))
        .tooltip(`${name} · ${a.address} · ${WORD[a.status]} · ${minutes(seconds)} observed work. Click to open below.`)
        .on_click(() => this.select(a.address))
        .child(v_flex().size_full().items_center().justify_center().gap(7)
          .child(h_flex().gap(14).items_center().child(eye()).child(eye()))
          .child(div().w(a.status === "blocked" ? 7 : 15).h(a.status === "blocked" ? 9 : 3).rounded(5).bg("#263325")))
        .when(a.status === "working", el => el.loop("opacity", { from: 0.78, to: 1, period: 2400 + index * 160 })))
      .child(div().max_w(cellWidth - 16).truncate().text_size(13).text_color(C.ink).child(name))
      .child(div().max_w(cellWidth - 16).truncate().text_size(11).text_color(C.muted).child(`${a.child ? "Sub-agent · " : ""}${a.space_name || a.address}`))
      .child(h_flex().gap(6).items_center()
        .child(div().size(5).rounded(3).bg(color))
        .child(div().text_size(11).text_color(color).child(`${WORD[a.status]} · ${minutes(seconds)}`)))
      .child(div().h(10));
  }

  render() {
    const role = props()?.role;
    const list = liveAgents();
    const selected = list.find(a => a.address === focused()?.agent);
    if (role === "header") return h_flex().size_full().px(24).items_center().justify_between().bg(C.ground)
      .child(h_flex().gap(12).items_center()
        .child(div().size(11).rounded(6).bg(C.working))
        .child(div().text_size(17).font_semibold().text_color(C.ink).child("blob garden"))
        .child(div().text_size(11).text_color(C.muted).child("/  agents, growing together")))
      .child(h_flex().gap(8)
        .child(this.button("new-agent", "+ New agent", () => this.newAgent()))
        .child(this.button("palette", "Commands", () => run("app.palette"))));
    if (role === "terminal-label") return h_flex().size_full().px(20).items_center().justify_between()
      .child(h_flex().gap(10).items_center()
        .child(div().size(6).rounded(3).bg(C[selected?.status] || C.idle))
        .child(div().text_size(11).text_color(C.muted).child("SESSION"))
        .child(div().text_size(12).text_color(C.ink).truncate().child(selected ? `${selected.title || selected.program?.name || selected.address} · ${selected.address}` : "Select an agent above")))
      .child(h_flex().gap(8)
        .child(this.button("prev", "Previous", () => run("agent.prev")))
        .child(this.button("next", "Next", () => run("agent.next"))));
    setAgentOrder(list.map(a => a.address));
    const columns = Math.max(1, Math.floor((this.width - 48) / 230));
    const cellWidth = Math.max(120, Math.min(290, (this.width - 48) / columns));
    const rows = [];
    for (let i = 0; i < list.length; i += columns) rows.push(h_flex().w_full().justify_center()
      .children(list.slice(i, i + columns).map((a, j) => this.blob(a, i + j, cellWidth))));
    return v_flex().id("garden-root").size_full().min_h(0).bg(C.ground).px(24)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 1) { this.width = size.width; cx.notify(); } })
      .child(h_flex().h(65).flex_none().items_center().justify_between()
        .child(v_flex().gap(4)
          .child(div().text_size(24).font_semibold().text_color(C.ink).child("A little more work. A little more blob."))
          .child(div().text_size(12).text_color(C.muted).child(`${list.length} agent${list.length === 1 ? "" : "s"} across your spaces · size follows time spent working`)))
        .child(div().text_size(11).text_color(C.muted).child("CLICK A BLOB TO CONNECT ↓")))
      .child(v_flex().id("garden-scroll").flex_1().min_h(0).overflow_y_scrollbar().children(rows)
        .when(list.length === 0, el => el.child(v_flex().h(210).items_center().justify_center().gap(12)
          .child(div().text_size(20).text_color(C.ink).child("Room to grow"))
          .child(div().text_size(13).text_color(C.muted).child("Start a status-reporting agent in any space. Its blob appears here."))
          .child(this.button("start-menu", "+ New agent", () => this.newAgent())))))
      .child(h_flex().h(42).flex_none().items_center().justify_between()
        .child(h_flex().gap(18).children(Object.keys(WORD).map(status => h_flex().gap(6).items_center()
          .child(div().size(6).rounded(3).bg(C[status]))
          .child(div().text_size(11).text_color(C.muted).child(WORD[status])))))
        .child(div().text_size(11).text_color(C.muted).child("GROWTH = OBSERVED WORKING TIME")));
  }
}
