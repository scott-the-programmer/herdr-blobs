import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { spaces, focused, knownAgents, pickFolder, run, props, closeOverlay, shared, setShared } from "herdr";
import { family, modes, launchRequest } from "./options.js";

const C = { bg: "#282828", line: "#504945", ink: "#ebdbb2", muted: "#a89984", accent: "#b8bb26" };
const LAST_AGENT = "blob-launcher.last-agent";
const LAST_OPTIONS = "blob-launcher.last-options.";

export default class BlobLauncher extends View {
  init(_props, cx) {
    this.space = spaces().find(s => s.active);
    this.agents = [];
    this.mode = "default";
    this.loading = true;
    this.folder = InputState.new({ value: focused()?.cwd || this.space?.folder || "", placeholder: "Working folder" });
    this.model = InputState.new({ placeholder: "Use configured model" });
    this.task = InputState.new({ placeholder: "Optional first task" });
    for (const input of [this.folder, this.model, this.task]) input.on("change", (_event, cx) => cx.notify());
    this.task.on("submit", (_event, cx) => this.start(cx));
    cx.spawn(async cx => {
      try {
        this.agents = (await knownAgents({ on: this.space?.machine })).filter(a => a.installed);
        const lastAgent = shared(LAST_AGENT);
        this.selectAgent(this.agents.find(a => a.key === lastAgent)?.key || this.agents[0]?.key);
      } catch (error) { this.error = `Could not load agents: ${String(error)}`; }
      this.loading = false;
      cx.notify();
    });
  }

  selectAgent(key) {
    this.selected = key;
    const saved = shared(LAST_OPTIONS + key);
    const agent = this.agents.find(a => a.key === key);
    this.mode = modes(agent).some(m => m.id === saved?.mode) ? saved.mode : "default";
    this.model.set_value(family(agent) && typeof saved?.model === "string" ? saved.model : "");
  }

  start(cx) {
    if (this.starting || this.loading) return;
    try {
      const request = launchRequest(this.agents.find(a => a.key === this.selected), this.mode, {
        space: this.space?.id, folder: this.folder.value(), model: this.model.value(), task: this.task.value()
      });
      // Herdr creates and selects the new tab immediately; active-tab content shows it before status arrives.
      run(request.command, request.args);
      this.starting = true;
      setShared(LAST_AGENT, this.selected);
      setShared(LAST_OPTIONS + this.selected, { mode: this.mode, model: this.model.value().trim() });
      closeOverlay(props().overlay);
    } catch (error) { this.error = String(error); cx.notify(); }
  }

  button(id, text, active, action) {
    return div().id(id).px(12).py(8).rounded(8).border(1)
      .border_color(active ? C.accent : C.line).bg(active ? "#3c3836" : C.bg)
      .text_color(C.ink).cursor_pointer().hover(s => s.bg("#3c3836"))
      .on_click(action).child(text);
  }

  input(label, state) {
    return v_flex().gap(6).child(div().text_size(11).text_color(C.muted).child(label))
      .child(Input.new(state).h(36).px(10).rounded(8).border(1).border_color(C.line)
        .bg("#1d2021").text_color(C.ink).text_size(13));
  }

  render() {
    const agent = this.agents.find(a => a.key === this.selected);
    const options = modes(agent);
    const mode = options.find(m => m.id === this.mode) || options[0];
    return v_flex().size_full().min_h(0).p(22).gap(18).bg(C.bg).text_size(13).text_color(C.ink)
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(21).font_semibold().child("New blob"))
        .child(div().text_size(11).text_color(C.muted).child("Opens in a new tab")))
      .child(v_flex().gap(7)
        .child(div().text_size(11).text_color(C.muted).child("Agent"))
        .child(h_flex().id("launch-agents").w_full().gap(7).overflow_x_scrollbar()
          .children(this.agents.map(a => this.button(`launch-${a.key}`, a.name, a.key === this.selected, (_event, cx) => {
            this.selectAgent(a.key); this.error = null; cx.notify();
            setShared(LAST_AGENT, a.key);
          }))))
        .when(this.loading || !this.agents.length, el => el.child(div().text_color(C.muted)
          .child(this.loading ? "Checking installed agents…" : "No installed agents found. Install an agent, then reopen this dialog."))))
      .child(v_flex().gap(8)
        .child(div().text_size(11).text_color(C.muted).child("Permissions"))
        .child(h_flex().gap(7).children(options.map(m => this.button(`mode-${m.id}`, m.label, m.id === this.mode,
          (_event, cx) => { this.mode = m.id; cx.notify(); }))))
        .child(div().text_size(12).text_color(this.mode === "yolo" ? "#fe8019" : C.muted).child(mode.detail)))
      .child(h_flex().gap(8).items_end()
        .child(div().flex_1().min_w(0).child(this.input("Folder", this.folder)))
        .when(!this.space?.machine, el => el.child(this.button("pick-folder", "Browse", false, (_event, cx) => {
          cx.spawn(async cx => {
            try { const folder = await pickFolder({ prompt: "Use folder" }); if (folder) this.folder.set_value(folder); }
            catch (error) { this.error = String(error); }
            cx.notify();
          });
        }))))
      .when(Boolean(family(agent)), el => el.child(this.input("Model · optional", this.model)))
      .child(this.input("First task · optional", this.task))
      .when(Boolean(this.error), el => el.child(div().text_size(12).text_color("#fe8019").child(this.error)))
      .child(h_flex().justify_end().gap(8)
        .child(this.button("launch-cancel", "Cancel", false, () => closeOverlay(props().overlay)))
        .when(Boolean(agent) && !this.loading, el => el.child(this.button("launch-start",
          this.mode === "yolo" ? "Start in YOLO mode" : "Start agent", true, (_event, cx) => this.start(cx)))));
  }
}
