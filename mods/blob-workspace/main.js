import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, terminals, panes, focused, layout, run, props, exec, notify, openOverlay, nextCommand } from "herdr";
import { findNode, spaceFor, finished } from "./state.js";

const C = { ink: "#edf0e5", muted: "#9da99c", line: "#303b34", ground: "#101913", accent: "#b5d97b" };

export default class BlobWorkspace extends View {
  init(_props, cx) {
    this.pins = {};
    this.previous = new Map();
    this.pending = new Map();
    this.reviewing = new Set();
    this.added = new Set();
    this.autoReview = localStorage.getItem("auto-review") !== "false";
    try { this.pins = JSON.parse(localStorage.getItem("desks-v1") || "{}"); } catch (_) {}
    if (!this.pins || typeof this.pins !== "object" || Array.isArray(this.pins)) this.pins = {};
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

  folder(space) {
    const pin = terminals().find(t => t.address === this.pins[space?.id] && t.state === "live");
    const pane = panes().find(p => p.tab === space?.tabs?.find(t => t.active)?.id && p.cwd);
    return pin?.foreground?.cwd || pin?.cwd || pane?.cwd || space?.folder;
  }

  pin(address = focused()?.terminal || focused()?.agent) {
    const space = this.space();
    if (!space) return;
    if (!address || !terminals().some(t => t.address === address && t.state === "live")
      || spaceFor(address, terminals(), panes(), spaces())?.id !== space.id) {
      notify({ title: "Pin an agent", body: "Focus a session in this space, then choose Pin session.", level: "warning" });
      return;
    }
    this.pins[space.id] = address;
    localStorage.setItem("desks-v1", JSON.stringify(this.pins));
    this.syncDesk(space);
    run("pane.focus", { terminal: address });
  }

  syncDesk(space) {
    const tree = layout();
    const stack = findNode(tree, "blob-desk-stack"), desk = findNode(tree, "blob-desk");
    if (!stack || !desk) return;
    const address = this.pins[space?.id];
    const live = terminals().some(t => t.address === address && t.state === "live");
    const id = live ? `blob-desk-${address}` : "blob-desk-empty";
    const kids = stack.children || [];
    const stale = child => child.content?.terminal && !terminals().some(t => t.address === child.content.terminal && t.state === "live");
    const add = live && !kids.some(c => c.id === id) && !this.added.has(id);
    const active = kids.some(c => c.id === id) || add ? id : "blob-desk-empty";
    const hidden = !live;
    if (add || kids.some(stale) || desk.hidden !== hidden) {
      stack.children = kids.filter(c => !stale(c));
      if (add) {
        this.added.add(id);
        stack.children.push({ id, type: "block", content: { terminal: address }, padding: [6, 10] });
      }
      stack.active = active;
      desk.hidden = hidden;
      run("layout.set", { layout: tree });
    } else if (stack.active !== active) run("layout.select", { stack: stack.id, child: active });
  }

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

  async review(space, automatic = false, folder = this.folder(space)) {
    if (!space || !folder || this.reviewing.has(space.id)) return;
    this.reviewing.add(space.id);
    try {
      const options = { cwd: folder, on: space.machine };
      const status = await exec("git", ["status", "--porcelain"], options);
      if (status.code !== 0) throw new Error(status.stderr || "This folder is not a Git repository.");
      if (automatic && !status.stdout.trim()) return;
      // Another space may have been selected while git was running.
      if (this.space()?.id !== space.id) {
        if (automatic) this.pending.set(space.id, folder);
        return;
      }
      const tab = spaces().find(s => s.id === space.id)?.tabs?.find(t => t.name === "Review");
      if (tab && panes().some(p => p.tab === tab.id && p.program?.key && p.program.key !== "shell")) {
        run("tab.select", { id: tab.id });
        return;
      }
      let installed = false;
      try { installed = (await exec("tuicr", ["--version"], options)).code === 0; } catch (_) {}
      if (this.space()?.id !== space.id) {
        if (automatic) this.pending.set(space.id, folder);
        return;
      }
      if (!installed) { this.showPanel("blob-changes"); return; }
      let argv = ["tuicr", "-w", "--no-update-check"];
      if (!automatic) {
        try {
          const pr = await exec("gh", ["pr", "view", "--json", "number,author"], options);
          if (pr.code === 0) {
            const info = JSON.parse(pr.stdout);
            const me = await exec("gh", ["api", "user", "--jq", ".login"], options);
            if (me.code === 0 && me.stdout.trim() && info.author?.login !== me.stdout.trim())
              argv = ["tuicr", "pr", String(info.number), "--no-update-check"];
          }
        } catch (_) {}
      }
      if (this.space()?.id !== space.id) return;
      if (tab) run("tab.close", { id: tab.id, confirmed: true });
      run("tab.new", { space: space.id, name: "Review", folder, argv });
    } catch (error) {
      notify({ title: "Review did not open", body: String(error?.message || error), level: "error" });
    } finally { this.reviewing.delete(space.id); }
  }

  observe(cx) {
    const all = terminals(), ps = panes(), ss = spaces();
    const primary = new Set([...ps.map(p => p.terminal), ...Object.values(this.pins)]);
    for (const t of all.filter(t => t.state === "live")) {
      const before = this.previous.get(t.address);
      this.previous.set(t.address, t.status);
      if (this.autoReview && primary.has(t.address) && finished(before, t.status)) {
        const space = spaceFor(t.address, all, ps, ss);
        if (space) this.pending.set(space.id, t.foreground?.cwd || t.cwd || space.folder);
      }
    }
    const live = new Set(all.filter(t => t.state === "live").map(t => t.address));
    for (const address of this.previous.keys()) if (!live.has(address)) this.previous.delete(address);
    const space = this.space();
    this.syncDesk(space);
    if (space && this.pending.has(space.id) && !this.reviewing.has(space.id)) {
      const folder = this.pending.get(space.id);
      this.pending.delete(space.id);
      cx.spawn(async () => this.review(space, true, folder));
    }
  }

  worktree(action) {
    const space = this.space();
    if (space) openOverlay({ mod: "worktree", kind: "dialog", width: 620, height: 460,
      props: { space: space.id, action } });
  }

  async command(command, cx) {
    const space = this.space();
    if (command === "pin") this.pin();
    else if (command === "unpin" && space) {
      delete this.pins[space.id];
      localStorage.setItem("desks-v1", JSON.stringify(this.pins));
      this.syncDesk(space);
    } else if (command === "desk") {
      const address = this.pins[space?.id];
      if (address && terminals().some(t => t.address === address && t.state === "live")) run("pane.focus", { terminal: address });
      else this.pin();
    } else if (command === "files" || command === "changes") this.panel(`blob-${command}`);
    else if (command === "review") await this.review(space);
    else if (command === "auto-review") {
      this.autoReview = !this.autoReview;
      this.pending.clear();
      localStorage.setItem("auto-review", String(this.autoReview));
    } else if (command === "shell") {
      const tab = space?.tabs?.find(t => t.name === "Shell");
      if (tab) run("tab.select", { id: tab.id });
      else if (space) run("tab.new", { space: space.id, name: "Shell" });
    } else if (command === "worktree-new") this.worktree("new");
    else if (command === "worktree-open") this.worktree("open");
    else if (command === "worktree-remove") this.worktree("remove");
    else if (command === "space-next" || command === "space-prev") run(command.replace("-", "."));
    else if (command === "agent-next" || command === "agent-prev") run(command.replace("-", "."));
    cx?.notify();
  }

  button(id, text, command, active = false) {
    return div().id(id).flex_none().px(9).py(5).rounded(6).text_color(active ? C.accent : C.ink)
      .cursor_pointer().hover(s => s.bg("#28362b"))
      .on_click((_e, cx) => cx.spawn(async cx => this.command(command, cx))).child(text);
  }

  render(cx) {
    if (props()?.role === "desk") return h_flex().size_full().px(10).items_center().justify_between()
      .bg(C.ground).text_color(C.muted).text_size(11).child("Pinned session")
      .child(div().id("unpin-session").cursor_pointer().on_click(() => run("blob-workspace.unpin")).child("Unpin"));
    if (props()?.role === "empty") return v_flex().size_full().p(12).text_color(C.muted).child("Pin a session to keep it beside your tabs.");
    this.observe(cx);
    const space = this.space();
    return h_flex().id("blob-workspace-bar").size_full().min_w(0).px(12).gap(4).items_center().bg(C.ground).text_size(11).overflow_x_scrollbar()
      .child(h_flex().id("blob-spaces").flex_1().min_w(0).gap(3).overflow_x_scrollbar()
        .children(spaces().map(s => div().id(`blob-space-${s.id}`).flex_none().px(9).py(5).rounded(6)
          .bg(s.active ? "#28362b" : C.ground).text_color(s.active ? C.accent : C.muted)
          .cursor_pointer().on_click(() => run("space.select", { id: s.id })).child(s.name || s.folder || "Space"))))
      .child(h_flex().id("blob-workspace-tools").flex_none().gap(2).items_center()
        .child(this.button("pin-session", "Pin session", "pin"))
        .child(this.button("review-session", "Review", "review"))
        .child(this.button("auto-review", this.autoReview ? "Auto review on" : "Auto review off", "auto-review", this.autoReview))
        .child(this.button("show-files", "Files", "files"))
        .child(this.button("show-changes", "Changes", "changes"))
        .when(Boolean(space), el => el.child(this.button("new-worktree", "+ Worktree", "worktree-new"))
          .child(this.button("open-worktree", "Open worktree", "worktree-open"))
          .child(this.button("remove-worktree", "Remove worktree", "worktree-remove"))));
  }
}
