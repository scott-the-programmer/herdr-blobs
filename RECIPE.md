# Blobs

Blobs is a Herdr layout for managing coding agents. Each agent appears as an animated blob, with size showing context usage and color showing status. Click a blob to open its terminal below. Workspace controls let you switch spaces, toggle Files and Changes panels, and manage worktrees.

![Blobs](assets/preview.png)

## What you see

- A 58px header on `#282828` contains a green dot, "blobs", the subtitle "Agent sessions", and New agent and Commands buttons. Keep the system title bar.
- A 36px workspace toolbar below the header contains the space strip with + Space, and Files, Changes, and Worktree controls. An optional Files or Changes panel sits right of the garden.
- The garden fills the upper region with 24px horizontal padding. A 65px heading shows "Agent sessions" at 24px and the live agent count when there are zero or one agents. Above one agent, hide that title and reduce the heading to 34px, retaining the count. A 42px footer shows the four status colors and names, then Tidy (when agents exist), a Settings button that runs `app.settings`, and zoom controls. Use Geist, `#ebdbb2` primary text, and `#a89984` secondary text.
- Between heading and legend, circles form a compact group with slow orbital drift. Fit every circle and label inside the measured field, scaling the group down when needed. Each has equal width and height, a round outline, and two dark eyes over a mouth. Circles start at 81px diameter and grow to 144px. Labels underneath show the agent name at 13px, the last two working-directory components at 11px, and state and context usage at 11px. Long labels truncate. Hover shows the name capped at 40 characters, then state and context usage.
- A draggable divider separates the garden from the bottom session region. Both initially have equal weight. Garden minimum height is 220px; session minimum is 180px. The garden fits every circle and its label inside its current bounds.
- A 44px tab strip heads the session. It scrolls horizontally and shows every tab in the active space. The selected tab has a green border. A fixed + Terminal button sits on the right. Below it are the active tab's real terminals, using JetBrains Mono 13px, `#1d2021` background, `#ebdbb2` text, and padding of 6px vertically and 14px horizontally.
- New agent opens a centered 600 by 660px dark dialog. It has installed-agent choices, permission mode buttons and explanation, folder with local Browse button, optional model and first-task fields, Cancel, and Start agent. YOLO changes the explanation to orange and the start button to "Start in YOLO mode". Model appears only for Codex and Claude. Loading, missing-agent, and error messages occupy the agent section as needed.

## How it behaves

| State | Circle color | Face and motion |
| --- | --- | --- |
| working | `#b8bb26` | Open eyes; opacity breathes from 0.78 to 1. |
| blocked | `#fe8019` | "Needs you" label, open mouth. |
| done | `#8ec07c` | "Done" label, ordinary face. Herdr turns done into idle once viewed. |
| idle | `#83a598` | "Idle" label, short closed eyes. |

Focused and box-selected blobs have a 3px cream outline. Hover dims the body and shows only a short name, state, and context summary. Clicking the body focuses its session. Right-drag selects multiple bodies; Shift adds to selection. Right-click opens actions for the selection, replacing it only when clicking an unselected body. Kill selected opens a centered confirmation dialog. Confirming runs `terminal.kill {terminal: address}` once per captured address, ending those agents and their sub-agents. Cancel, Escape, or dismissing the dialog leaves them running. Descendants without panes appear too, marked Sub-agent, and open in their parent's tab when clicked. A sub-agent's blob is attached to the blob that spawned it. It spawns in the nearest free slot beside its parent, a thin `#a8998466` line joins the two bodies under both, and it drifts in step with its root ancestor. Dragging a parent moves all its descendants with it; dragging a sub-agent moves only that sub-agent and its own descendants. Labels themselves are informational.

Tab clicks select that tab. + Terminal opens and selects a fresh shell tab. New agent first detects programs installed on the current space's machine. Pick an agent, mode, folder, optional model, and optional task, then press Start agent. The new tab becomes visible immediately, before status arrives. A new circle appears when the program reports status. With no space, the launcher creates a new space instead. Commands opens Herdr's palette. Existing key bindings remain intact; agent navigation follows displayed agent addresses.

Default permission mode uses the configured launch command unchanged. Codex also offers Read only, Workspace auto, and YOLO. Claude offers Plan, Accept edits, and YOLO. Other executable names get Default only. Selecting another agent or reopening the launcher restores that agent's last launched permission mode and model, including YOLO. Agents without saved options use Default and an empty model. YOLO bypasses permission checks; Codex YOLO also disables its sandbox. Launch only when the user presses Start agent or submits the task field.

Folder defaults to the focused terminal's current directory, then the space folder. Browse is local-only; remote paths can be typed. Empty model and task fields keep agent defaults and start without an initial task.

Poll Codex context counters every 10 seconds through `codex.js`. It runs two `sh` scripts through Herdr's `exec` on the terminal's machine, using only `find`, `ls`, `head`, `tail`, and `grep`, and parses their output in the mod. The first lists rollout logs under `$CODEX_HOME/sessions` (default `~/.codex/sessions`) modified in the last 30 days, newest first, with each log's `session_meta` line. Match sessions by explicit thread or session label against the session ID, or else take the newest log whose directory matches a terminal's, when no other unlabelled Codex terminal shares that directory. The second script scans at most the last 8 MiB of each matched log for the last token-count or compaction record. Used tokens are `last_token_usage.total_tokens` and the limit is `model_context_window`; a compaction with no later count reads as unknown. Poll Claude Code counters on the same timer through `claude.js`. Claude Code writes `sessions/<pid>.json` under `$CLAUDE_CONFIG_DIR` (default `~/.claude`) for each running process, and Herdr reports the terminal's foreground pid. One `sh` script, using only `head`, `sed`, `tail`, and `awk`, reads the session ID from that file, requires exactly one `projects/*/<session>.jsonl` transcript, and scans its last 8 MiB. `awk` prints only usage numbers, model name, and sidechain flag for assistant replies, plus a marker for each compaction boundary. Used tokens are the newest main-thread, non-synthetic reply's input, cache-creation, cache-read, and output tokens added together. Transcripts do not record the window, so the limit is 200k unless the model name contains `[1m]` or usage has passed 200k, then 1M. A compaction boundary after the last reply reads as unknown. Each reader sees only its own agent's terminals.

Return only counters. If no unique match or valid counter exists, show "Context unknown" and use the minimum blob size. Body diameter updates immediately so camera zoom keeps bodies, faces, and labels in sync.

Blobs blink with native eye-height loops over 4200 to 6599ms. Body-only bobbing leaves labels steady: working moves 5px over 2000ms, blocked 3px over 3000ms, done 4px over 2800ms, idle 2px over 4800ms, before scale and a seeded period offset up to 699ms. Body bobbing pauses during gestures.

Working opacity runs natively with a period of 2400ms plus 160ms per list position. Circles drift through native position loops while faces and labels stay upright. Reserve their entire motion envelopes so neighboring paths do not collide or leave the field.

When no agents report status, show "No agents yet", a status-reporting explanation, and New agent. Ordinary shell tabs remain usable in the bottom region and get no circles.

## Built from

Create the following files in an empty folder, with no package installation or build step:

```text
layouts/blobs.json
mods/blob-garden/mod.json
mods/blob-garden/main.js
mods/blob-garden/geometry.js
mods/blob-garden/types.js
mods/blob-garden/context.js
mods/blob-garden/codex.js
mods/blob-garden/claude.js
mods/blob-garden/demo.js
mods/blob-garden/positions.js
mods/blob-workspace/mod.json
mods/blob-workspace/main.js
mods/blob-workspace/state.js
keys.json
mods/blob-tabs/mod.json
mods/blob-tabs/main.js
mods/blob-launcher/mod.json
mods/blob-launcher/main.js
mods/blob-launcher/options.js
mods/blob-files/mod.json
mods/blob-files/main.js
mods/blob-files/open.js
mods/blob-files/chevron-down.svg
mods/blob-files/chevron-right.svg
mods/blob-files/file.svg
mods/blob-files/folder.svg
README.md
RECIPE.md
preview.png
tests/launcher.test.mjs
tests/geometry.test.mjs
tests/types.test.mjs
tests/context.test.mjs
tests/demo.test.mjs
tests/demo_workspace.test.mjs
tests/positions.test.mjs
tests/garden.test.mjs
tests/workspace.test.mjs
demo/workspace.mjs
```

Use this layout tree, a moss root theme, Geist UI font, JetBrains Mono terminal font, and the explicit colors above:

```text
root: column, background #282828, system title bar
  garden-header: block, 58px, blob-garden {role: "header"}
  blob-main: column, weight 1, min 220px
    blob-workspace-toolbar: block, 36px, blob-workspace
    blob-main-body: row
      blob-main-stack: stack, weight 2
        garden-board: block, blob-garden {role: "board"}
      blob-panel: column, hidden initially, 320px, min 260px, max 700px
        blob-panel-stack: stack, blob-files or shipped changes mod
  session: column, weight 1, min 180px, 1px #504945 border
    session-label: block, 44px, blob-tabs
    session-terminal: block, {tab: "active"}, padding [6, 14]
```

The layout and README both reference the single root screenshot `preview.png`. Each manifest uses `place: "none"`. The launcher manifest sets overlay width 600 and height 660. Keep the shipped mods separate from the layout. `blob-files` is a `mod.clone` of the shipped `files` mod; leave the shipped one untouched. Herdr still provides its palette, notifications, and native terminal renderer.

All mods default-export a native `View`. Use `div` from `gpui-kit` and `h_flex`/`v_flex` from `gpui-base`. The launcher also uses `InputState` and `Input`.

Art uses native rounded rectangles and vector paths for five-point stars. There are no bitmap art dependencies or custom fonts.

The board reads `agents()`, `terminals()`, and `focused()`. Begin with agents in pane order. Recursively append live terminals with a known parent and a reported status. Inherit their parent's space name, map error to blocked, and normalize unknown states to idle. Exclude unrelated core terminals. Call `setAgentOrder` on board render. Circle clicks call `agent.focus {terminal}` and `pane.focus {terminal}`; descendants also call `terminal.show {terminal}`. Active-tab content handles the selected agent's parent tab.

The legacy terminal-label role is unused by this layout.

Keep geometry in a pure `arrange` helper. Measure the actual field's width and height with `on_size_change` and notify only for changes greater than 1px. Reserve base cells 160px wide and 256px high, 8px gaps, and orbit margins of 14px horizontally and 10px vertically. Try each possible column count, compute rows with a ceiling, and maximize a uniform scale capped at 1 so the complete cells and their motion envelopes fit. Break scale ties by choosing a compact group shape.

Sort addresses by a stable FNV-style hash, center each row, and use at most 4px of seeded positional variation. Status changes leave positions stable; count and available bounds can change the arrangement. The initial arrangement fits inside the field. Dragged pins and new blobs beside an existing blob may extend beyond it; use pan to reach them.

Each cell uses native left and top animation loops. Horizontal motion spans center plus or minus 14px at scale 1, over 45 to 57 seconds. Vertical motion spans plus or minus 10px, over 60 to 72 seconds. Seed periods by address. Their different periods create orbital drift. Scale position ranges with the cells, give each cell a stable orbit ID, and keep all text and faces upright.

Add −, percentage, and + controls beside the legend. Adjust zoom from 10% to 400%; clicking the percentage resets to 100% and clears pan, fitting the group. Fit the world layout independently of zoom, apply normalized pins there, then scale positions, cells, labels, and orbit paths together around the viewport center and add pan. Scroll zooms smoothly around the cursor, preserving the world point beneath it. Buttons zoom around the viewport center in 10 percentage point steps. Drag the background or Shift-scroll to pan. Clip the fixed viewport without native scrollbars; convert blob drags through the inverse camera transform. Zoom starts at 100% when the board loads.

Diameter is `sqrt(81 ** 2 + (144 ** 2 - 81 ** 2) * ratio) * scale`, where `ratio` is context tokens used divided by the context limit, clamped to 0 through 1. Scale the label sizes, gaps, face parts, and borders with the cell. Give the body equal width and height, `flex_none()`, and radius half its diameter so flex layout cannot flatten it.

Choose one of six face styles by a stable hash of the agent address. Vary eye widths, heights and spacing, including a wink and uneven eyes, with smiling, flat or open mouths. Idle eyes flatten to at most 3px; blocked mouths become small open ovals; done mouths smile. Face color is `#282828`. Scale every face part with the blob; draw smiles and open mouths with native rounded rectangles. Update context-sized dimensions immediately and use native opacity loops.

Only the board starts the 10-second context timer. Store dragged pins under mod-local key `positions-v1` and pan under `canvas-pan-v1`. Recover from corrupt JSON and use each callback's own `cx`.

The tab mod reads `spaces()`, lists the active space's tabs, calls `tab.select {id}` for each tab, and `tab.new {space}` for + Terminal. The bottom terminal block must use `{tab: "active"}` so an ordinary new shell or a newly launched agent is immediately visible.

The board opens `blob-launcher` with `openOverlay`, kind dialog and size 600 by 660. The launcher captures active space and starting directory on init, calls `knownAgents({on: space.machine})` inside `cx.spawn`, and displays installed agents. Local Browse uses `pickFolder`. Start builds an argv array, runs `tab.new {space, name, argv, folder?, task?}`, then closes its own overlay. Without a space, use `space.new`. Do not refocus the old agent after starting a tab.

Keep command construction in a pure options module. Recognize Codex and Claude by the executable basename, including paths and `.exe`. Match these flags:

| Program and mode | Added arguments |
| --- | --- |
| Codex Read only | `--sandbox read-only --ask-for-approval on-request` |
| Codex Workspace auto | `--sandbox workspace-write --ask-for-approval never` |
| Codex YOLO | `--dangerously-bypass-approvals-and-sandbox` |
| Claude Plan | `--permission-mode plan` |
| Claude Accept edits | `--permission-mode acceptEdits` |
| Claude YOLO | `--dangerously-skip-permissions` |

Default preserves configured argv. Explicit permission modes first remove conflicting permission flags, including separate and equals forms of valued options. An explicit model replaces existing model arguments with `--model <value>`. Keep argv as an array and pass folder and task as structured command arguments. Unsupported modes and absent agents must fail before starting a program. A task-field submit uses the same start action. Prevent double starts. Errors stay in the dialog.

No bundled mod calls `fetch`. The garden runs shell commands through Herdr to read Codex session logs and Claude Code transcripts on each terminal's machine. Only session metadata lines, token-count records, and usage numbers leave that machine, never session messages. Installed-agent detection and program launch use Herdr APIs. The launcher persists the selected agent in shared state under `blob-launcher.last-agent`, including selections made before cancelling. On reopening, restore it if installed; otherwise select the first installed agent.

The launcher persists each agent's last launched mode and model under `blob-launcher.last-options.<agent-key>`. Save only after dispatching a valid launch, and restore only supported modes and string models. Folder and first task are not persisted.

### Blob types and rarity

Assign a type by hashing the full agent address with FNV-1a followed by avalanche mixing, then taking an unsigned roll modulo 10,000. The ordered weights in `types.js` are Pebble 3,000, Sprout 2,800, Ripple 2,700, Ember 700, Frost 700, Cosmic 100. The first three are Common (85% combined), Ember and Frost are Rare (14%), and Cosmic is Ultra rare (1%). Assignment is deterministic across renders and reloads, including descendants. Reused addresses inherit the same type; no new storage or reroll control is needed.

Keep state colors. Give Pebble, Sprout, Ripple, and Ember distinct asymmetric corner radii; render Frost and Cosmic as five-point native vector stars. Add the agent program icon to each forehead using svg for tinted icons and image for full-color icons, falling back to icons/agent.svg. Keep the face centered, use a smaller forehead logo for stars, and show the session title below the body.

Hover text has two lines. Cap the name at 40 characters, then show state and context usage. Rare types have a 2px accent outline; focused and box-selected blobs have a cream outline following their silhouette; hover dims the body.

Right-drag selects intersecting blob bodies with a visible rectangle, Shift-right-drag adds, and an empty box clears selection. Pause drift during box selection. Right-click a selected blob or background opens group actions; clicking an unselected blob selects only it. Group actions open the first selected session, clear selection, or open a kill confirmation for the captured targets. Never kill on right-click or box selection. Keep existing face variations, zoom, and left-drag behavior.

Tests cover every weighted roll, reload stability, sequential-address distribution, all six types in every work state, selection after camera transforms, and confirmed group kills.

### Workspace controls

Switch spaces from the toolbar. + Space opens the system folder picker and runs `space.new` with the chosen folder. Right-clicking a space opens a 420 by 190px confirmation dialog (`blob-workspace` role `close-space`); Remove runs `space.close` for that space, Cancel closes the dialog. Files and Changes toggle the side panels.

Right-clicking a file row in `blob-files` opens a 200 by 52px popup (role `menu`) with Open in editor. It runs the platform default opener through `exec` on this machine: `open` on macOS, `xdg-open` on Linux, `cmd /c start` on Windows, so the file opens in the app a double-click would use. A failure posts an error notification. Folders get no menu. In a remote space the item is disabled, since the file lives on another machine. Keep command construction in the pure `open.js`.

Worktree toggles inline New, Open, and Remove buttons. Each opens Herdr's shipped `worktree` dialog with the active space and action `new`, `open`, or `remove`, at 620 by 460px, then collapses the menu. Preserve its built-in prompts. Shell selects an existing tab named Shell or creates one.

`blob-workspace` reads `spaces` and `layout` and uses `pickFolder`, `openOverlay`, and `closeOverlay`. Use `layout.select`, `layout.show`, and `layout.hide` to update the side panel. The mod owns `nextCommand`.

Merge `keys.json` under `layout:blobs`: Ctrl+Shift+S selects Shell, F toggles Files, and G toggles Changes. Alt+Up/Down switches spaces; Alt+Shift+Up/Down switches agents. Preserve existing user bindings when installing.

## Watch out

- Read the installation's `AGENTS.md`, `herdr.d.ts`, and `gpui-kit.d.ts`. This is native GPUI JavaScript, with no DOM, CSS, Node APIs, or browser timers. Shipped files and generated type files remain untouched.
- Every mod must pass `herdr-app check`, but this only covers initial rendering. Inspect the loaded launcher after asynchronous installed-agent detection as well as all visible prop roles.
- Active-tab terminal content fixes new shells being hidden behind an old focused agent. Pane-less descendants need explicit `terminal.show` after selecting their parent context.
- Default means existing configuration, including any permission settings the person already chose. It is not a forced sandbox preset. YOLO is remembered when it was the last launched mode for that agent. Custom wrapper executables get no guessed flags. Remote or older agent versions must support the chosen flags; check the installed programs when adapting launch arguments.
- Context counters come from Codex and Claude Code and need a POSIX shell on the terminal's machine. Claude Code counters need Herdr to report the foreground pid, and a 1M window below 200k used tokens shows against 200k unless the model name says `[1m]`. Two unlabelled Codex terminals in one directory both show "Context unknown"; label them with `codex.thread` to tell them apart. Missing counters, ambiguous session matches, or read failures show "Context unknown". Size follows context usage and can shrink after compaction.
- Very narrow windows crowd header and dialog controls. Aim for at least 760 by 600 logical pixels, with enough height for the 660px dialog. The initial arrangement reserves label space and scales down to fit. Large lists render eagerly without virtualization.
- At 100% zoom all cells scale to fit. Large counts in small panes make labels small; zoom in and pan or expand the garden to read them. Circle diameter caps at 144px before fitting and zoom. Blobs can be dragged to reposition them. There is no filtering, close-tab button, or arbitrary argument editor. Existing Herdr keys and palette remain available.
- Install without overwriting names. Rename incoming mods and layout references if they already exist. Copy only source and assets, not generated type files, local settings, storage, credentials, or transcripts.

## Done when

1. All five bundled mods pass `herdr-app check`, and switching to blobs leaves `herdr-app status` without errors.
2. All four states have the table's colors, face, and label. Live descendants appear; unrelated shells do not. Rounded blobs keep equal width and height at minimum and maximum context usage. The initial arrangement keeps their labels apart.
3. Clicking a circle switches its real session into the bottom view. Existing tabs select correctly. + Terminal creates and displays a new shell tab.
4. New agent loads installed programs, exposes supported permission modes, and starts the selected program in a fresh selected tab. The terminal switches immediately, before status reporting. A circle appears when status arrives.
5. Folder, model, and first task reach the launch request. Switching agent or reopening restores its last launched permission mode and model. YOLO requires its explicit start action. Unsupported modes do not launch.
6. Valid context counters control blob size and labels in every state. Missing counters show "Context unknown" at minimum size. Reload restores dragged positions and pan.
7. `node --test tests/*.test.mjs` verifies launch arguments, permission overrides, validation, active-tab content, tab actions, full field containment, and nonoverlapping motion envelopes.
8. Create a space with + Space, remove one through the right-click confirmation, toggle Files and Changes, right-click a file and confirm Open in editor opens it in its default app, and confirm the Worktree menu's New, Open, and Remove open the corresponding Herdr dialogs.
9. Resize the garden and confirm every agent remains visible, inspect the empty state and loaded launcher, capture the real window as `preview.png`. Publish the folder in the public repository with topic `herdr-layout`.
