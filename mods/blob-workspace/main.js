import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, layout, run, props, openOverlay, closeOverlay, pickFolder, nextCommand } from "herdr";
import { findNode } from "./state.js";

const C = { ink: "#ebdbb2", muted: "#a89984", line: "#504945", ground: "#282828", accent: "#b8bb26" };
const WORKTREE_ACTIONS = [["new", "New"], ["open", "Open"], ["remove", "Remove"]];

export default class BlobWorkspace extends View {
  init(_props, cx) {
    this.worktreeMenu = false;
    if (props()?.role) return;
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        await this.command(command, cx);
        cx.notify();
      }
    });
  }

  space() { return spaces().find(s => s.active); }

  panel(name) {
    const panel = findNode(layout(), "blob-panel"), stack = findNode(layout(), "blob-panel-stack");
    if (!panel || !stack) return;
    if (!panel.hidden && stack.active === name) run("layout.hide", { id: panel.id });
    else this.showPanel(name);
  }

  showPanel(name) {
    run("layout.select", { stack: "blob-panel-stack", child: name });
    run("layout.show", { id: "blob-panel" });
  }

  worktree(action) {
    this.worktreeMenu = false;
    const space = this.space();
    if (space) openOverlay({ mod: "worktree", kind: "dialog", width: 620, height: 460,
      props: { space: space.id, action } });
  }

  async newSpace() {
    const folder = await pickFolder({ prompt: "Create space" });
    if (folder) run("space.new", { folder });
  }

  confirmClose(space) {
    openOverlay({ mod: "blob-workspace", kind: "dialog", width: 420, height: 190,
      props: { role: "close-space", space: space.id, name: space.name || space.folder || "Space" } });
  }

  closeDialog() {
    const { space, name, overlay } = props();
    return v_flex().id("close-space-dialog").size_full().p(20).gap(12).bg(C.ground).text_color(C.ink)
      .child(div().text_size(18).child("Remove space?"))
      .child(div().text_size(13).truncate().child(name))
      .child(div().text_size(12).text_color(C.muted).child("This closes the space and ends its sessions."))
      .child(h_flex().flex_1().items_end().justify_end().gap(8)
        .child(div().id("close-space-cancel").px(12).py(7).rounded(8).border(1).border_color(C.line).text_size(12).cursor_pointer().hover(s => s.bg("#3c3836"))
          .on_click(() => closeOverlay(overlay)).child("Cancel"))
        .child(div().id("close-space-confirm").px(12).py(7).rounded(8).border(1).border_color(C.line).text_size(12).cursor_pointer().text_color("#fe8019")
          .hover(s => s.bg("#3c3836")).on_click(() => {
            if (this.closing) return;
            this.closing = true;
            closeOverlay(overlay);
            run("space.close", { id: space });
          }).child("Remove")));
  }

  async command(command, cx) {
    const space = this.space();
    if (command === "space-new") await this.newSpace();
    else if (command === "files" || command === "changes") this.panel(`blob-${command}`);
    else if (command === "shell") {
      const tab = space?.tabs?.find(t => t.name === "Shell");
      if (tab) run("tab.select", { id: tab.id });
      else if (space) run("tab.new", { space: space.id, name: "Shell" });
    } else if (command === "worktree") this.worktreeMenu = !this.worktreeMenu;
    else if (command.startsWith("worktree-")) this.worktree(command.slice("worktree-".length));
    else if (command === "space-next" || command === "space-prev") run(command.replace("-", "."));
    else if (command === "agent-next" || command === "agent-prev") run(command.replace("-", "."));
    cx?.notify();
  }

  button(id, text, command, active = false) {
    return div().id(id).flex_none().px(9).py(5).rounded(6).text_color(active ? C.accent : C.ink)
      .cursor_pointer().hover(s => s.bg("#3c3836"))
      .on_click((_e, cx) => cx.spawn(async cx => this.command(command, cx))).child(text);
  }

  render() {
    if (props()?.role === "close-space") return this.closeDialog();
    const space = this.space();
    return h_flex().id("blob-workspace-bar").size_full().min_w(0).px(12).gap(4).items_center().bg(C.ground).text_size(11).overflow_x_scrollbar()
      .child(h_flex().id("blob-spaces").flex_1().min_w(0).gap(3).overflow_x_scrollbar()
        .children(spaces().map(s => div().id(`blob-space-${s.id}`).flex_none().px(9).py(5).rounded(6)
          .bg(s.active ? "#3c3836" : C.ground).text_color(s.active ? C.accent : C.muted)
          .cursor_pointer().on_click(() => run("space.select", { id: s.id }))
          .on_mouse_down("right", () => this.confirmClose(s)).child(s.name || s.folder || "Space")))
        .child(this.button("new-space", "+ Space", "space-new")))
      .child(h_flex().id("blob-workspace-tools").flex_none().gap(2).items_center()
        .child(this.button("show-files", "Files", "files"))
        .child(this.button("show-changes", "Changes", "changes"))
        .when(Boolean(space), el => el.child(this.button("worktree", "Worktree", "worktree", this.worktreeMenu))
          .when(this.worktreeMenu, el => el.children(WORKTREE_ACTIONS.map(([action, label]) =>
            this.button(`worktree-${action}`, label, `worktree-${action}`))))));
  }
}
