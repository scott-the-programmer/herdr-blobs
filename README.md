# Blobs for Herdr

The Blobs layout shows each agent as a blob above its terminal. Size shows context usage; color shows whether the agent is working, blocked, done, or idle. Each address keeps its face and blob type across reloads.

![Herdr Blobs showing agent sessions, context usage, and the active terminal](preview.png)

## Use

Click a blob to open its session in the bottom terminal. Hover to see its name, state, and context usage. Labels show the working directory. Agents without context counters show "Context unknown".

Drag a blob to move it. Scroll to zoom around the cursor from 10% to 400%. Drag the background or Shift-scroll to pan. The − and + buttons zoom around the viewport center; click the percentage to reset the view to fit. Pan to reach blobs outside the viewport.

Right-drag a box to select blobs. Hold Shift to add to the selection. Right-click a selected blob or the background for group actions. Right-click an unselected blob to select it and show its actions. Kill selected asks for confirmation before ending the selected agents and their sub-agents.

Blobs bob and blink. Working blobs bob faster; idle blobs have sleepy eyes. Labels stay steady. Bobbing pauses while you drag, pan, or select.

## Workspace

The space strip switches between repositories and worktrees. `+ Worktree` creates a branch checkout and its own space. `Open worktree` switches to an existing checkout. These use Herdr's worktree dialogs.

Workspace controls sit above the garden. Focus a session and click `Pin session` to keep its terminal beside the garden. Each space remembers its own pinned session. `Unpin` hides the desk without stopping the session. The bottom section contains session tabs and the active terminal.

`Files` and `Changes` toggle panels beside the garden. `Review` opens `tuicr -w` in the main area when tuicr is installed, or the Changes panel otherwise. A running review is reused. `Garden` returns to the blobs. Manual reviews of another author's pull request use `tuicr pr` when GitHub CLI can identify it.

`Auto review on` opens review when an agent finishes with uncommitted changes. Reviews for other spaces wait until you switch there. Click the toggle to turn automatic review off. Reviews never stage, commit, push, or publish comments automatically.

Merge the `layout:blobs` bindings from [keys.json](keys.json) into your Herdr keys for shortcuts. Ctrl+Shift+A focuses the pinned session, Ctrl+Shift+P pins the focused session, Ctrl+Shift+R opens review, Ctrl+Shift+S opens Shell, and Ctrl+Shift+F/G toggle Files/Changes. Alt+Up/Down switch spaces; Alt+Shift+Up/Down switch agents.

Workspace additions adapt desk and review behavior from [Bercail](https://github.com/simoncrypta/bercail), under its [MIT license](THIRD_PARTY_NOTICES.md). Bercail's bot, subscription setup, issue handoffs, and webhook service are separate tools and are not installed by this layout.

## Start agents and terminals

`+ New agent` opens the launcher. Choose an installed agent, permission mode, working folder, optional model, and optional first task. Starting an agent opens and selects a new tab immediately. Its blob appears beside the last active blob in the nearest free slot. Existing blobs keep their positions.

The launcher remembers the last selected agent, even if you cancel. If that agent is unavailable, it selects the first installed agent. It also remembers each agent's last launched permission mode and model.

Codex offers Default, Read only, Workspace auto, and YOLO. Claude offers Default, Plan, Accept edits, and YOLO. Default preserves your existing agent configuration. YOLO bypasses approval checks; Codex YOLO also disables its sandbox. The launcher remembers YOLO. Choose another mode before starting if you want different permissions.

`+ Terminal` opens a shell in a new tab. Use the tab strip to switch sessions. Commands opens the palette. Drag the divider above the session to resize it. Existing keyboard bindings stay in place; `ctrl-shift-l` switches layouts.

## Install

Open [Herdr](https://herdr.dev/) and tell your agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then install and switch to the Blobs layout from https://github.com/scott-the-programmer/herdr-blobs. Read the repository files before installing, merge its layout-specific keys, and preserve my existing layouts, mods, and keybindings.
```

## Recipe and discovery

[RECIPE.md](RECIPE.md) is the rebuild brief for this layout, including workspace controls and known limits. Herdr discovery uses this recipe, the root `preview.png`, and the repository topic `herdr-layout`.

## Tests

Run regression tests:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p '*_test.py'
```

## Releases

After merging changes to `main`, tag the commit you want to release and push
the tag:

```sh
git switch main
git pull --ff-only
git tag v1.0.0
git push origin v1.0.0
```

The release workflow reruns CI on the tagged commit. If all checks pass, it
publishes a GitHub release with generated notes, `herdr-blobs-v1.0.0.zip`, and
`SHA256SUMS`. The ZIP contains the tracked repository files under a versioned
directory, including `layouts/` and `mods/`. Extract it and use the installation
prompt above with the extracted directory as the source. Existing layouts and
mods still need to be preserved during installation.

Use a tag such as `v1.1.0-rc.1` to publish a prerelease. Tags must match
`vMAJOR.MINOR.PATCH` with an optional prerelease suffix. Publishing uses the
built-in `GITHUB_TOKEN`; no extra secrets are required.

To verify a downloaded ZIP, keep it beside `SHA256SUMS` and run
`sha256sum -c SHA256SUMS` on Linux or `shasum -a 256 -c SHA256SUMS` on macOS.

