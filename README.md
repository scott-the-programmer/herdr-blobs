# Blobs for Herdr

The Blobs layout shows each agent as a blob above its terminal. Size shows context usage; color shows whether the agent is working, blocked, done, or idle. Each address keeps its face and blob type across reloads.

![Herdr Blobs showing agent sessions, context usage, and the active terminal](screenshots/blobs-workspace.png)

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

## Context usage and blob types

The garden checks Codex context counters every 10 seconds. A Python helper reads Codex's local state database and token-count records on each agent's machine. It returns counters, not session messages. The mods make no network requests. The launcher detects installed agents and starts programs through Herdr.

Blob size follows the fraction of context in use. Diameter ranges from 81px to 144px before fitting and zoom. Unknown context uses the minimum size. Dragged positions and pan stay in mod-local storage.

Each agent address determines a blob type. Common types are Pebble at 30%, Sprout at 28%, and Ripple at 27%. Rare types are Ember and Frost at 7% each. Cosmic is ultra rare at 1%. Pebble, Sprout, Ripple, and Ember have rounded shapes; Frost and Cosmic are five-point stars. Each blob has its agent program's logo on its forehead. Rare types have a colored outline. Body color shows agent state.

## Demo

Run `python3 demo/workspace.py` while Herdr is open. It creates eight scripted sessions spread across the garden, with all six blob types, varied context usage, and 60% garden zoom. It runs no AI agents or API calls. Close the Blobs demo space when finished.

To show real coding terminals, run `python3 demo/workspace.py --live --count 6`. It launches six interactive Codex agents with the configured model and a read-only sandbox. Each reads the repository and reports on its named task. Live mode uses your Codex account. Status comes from the agents; blob type, context usage, and positions use demo overrides. Agents stay open for follow-up input.

Export demo settings with `python3 demo/workspace.py --dry-run`. Edit the JSON and pass it with `--config <file>`. The [demo-blobs skill](.agents/skills/demo-blobs/SKILL.md) covers setup, verification, and changes to an open demo.

## Development

CI runs on pull requests, pushes to `main`, and manual dispatches. It checks
JavaScript and Python syntax, validates layout and mod JSON, and runs both test
suites on Linux and macOS with Node.js 24 and Python 3.14. No dependency install
or Herdr instance is required. GitHub Actions dependencies use pinned commits;
Dependabot checks for updates weekly.

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

