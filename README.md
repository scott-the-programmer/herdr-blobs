# Blobs for Herdr

Each agent is a circle. Working time grows it; color shows state. Click a blob to switch to its session in the bottom terminal. Right-click a blob to kill its agent and sub-agents.

![Blobs](preview.png)

**+ New agent** opens the launcher. Choose an installed agent, permission mode, working folder, optional model, and optional first task. The launcher remembers the last selected agent, including when you cancel. If it is unavailable, the first installed agent is selected. Starting it opens and selects a new tab immediately. **+ Terminal** opens a shell in a new tab. Use the tab strip to switch between sessions.

Codex offers Default, Read only, Workspace auto, and YOLO. Claude offers Default, Plan, Accept edits, and YOLO. Default preserves your existing agent configuration. YOLO bypasses approval checks; Codex YOLO also disables its sandbox. It must be selected for each launch.

Read [RECIPE.md](RECIPE.md) for the complete rebuild brief and limits.

## Install

Requires Herdr with native mods and active-tab terminal blocks. Copy `mods/blob-garden/`, `mods/blob-tabs/`, and `mods/blob-launcher/` into `~/.config/herdr-app/mods/`. Copy both files from `layouts/` into `~/.config/herdr-app/layouts/`. If a name already exists, rename the incoming layout or mod and update its references first.

```sh
herdr-app check ~/.config/herdr-app/mods/blob-garden
herdr-app check ~/.config/herdr-app/mods/blob-tabs
herdr-app check ~/.config/herdr-app/mods/blob-launcher
herdr-app do layout.switch '{"name":"blobs"}'
herdr-app status
```

Existing keyboard bindings stay in place. Commands opens the palette. The divider above the session resizes it; `ctrl-shift-l` switches layouts.

The mods make no network requests or transcript reads. The launcher detects installed agents and starts the selected program through Herdr. Growth records stay in mod-local storage. Growth measures sampled working time while the layout is loaded, with a displayed diameter capped at 96px.

Circles drift slowly with native motion and scale together to stay visible when the garden resizes. The large title hides when more than one blob exists.

Run regression tests with `node --test tests/*.test.mjs`.
