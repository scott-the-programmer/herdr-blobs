# Blobs

A dark green Herdr window shows each live agent as a circle with a face. Circles drift slowly in a compact group, grow with observed working time, and change color with agent state. Click a circle to switch the bottom terminal to that session. New agent opens a launcher with permission modes, folder, model, and first task; starting one opens and selects a new tab immediately.

![Blobs](preview.png)

## What you see

- A 58px header on `#101913` contains a green dot, "blobs", the subtitle "/ agents, growing together", and New agent and Commands buttons. Keep the system title bar.
- The garden fills the upper region with 24px horizontal padding. A 65px heading shows "A little more work. A little more blob." at 24px and the live agent count when there are zero or one agents. Above one agent, hide that title and reduce the heading to 34px, retaining the count. A 42px footer shows the four status colors and names. Use Geist, `#edf0e5` primary text, and `#9da99c` secondary text.
- Between heading and legend, circles form a compact group with slow orbital drift. Fit every circle and label inside the measured field, scaling the group down when needed. Each has equal width and height, a round outline, and two dark eyes over a mouth. Circles start at 54px diameter and grow to 96px. Labels underneath show the agent name at 13px, space at 11px, and state and observed working minutes at 11px. Long labels truncate; hovering a circle gives its full title and address.
- A draggable divider separates the garden from the bottom session region. Both initially have equal weight. Garden minimum height is 220px; session minimum is 180px. The garden fits every circle and its label inside its current bounds.
- A 44px tab strip heads the session. It scrolls horizontally and shows every tab in the active space. The selected tab has a green border. A fixed + Terminal button sits on the right. Below it are the active tab's real terminals, using JetBrains Mono 13px, `#131c17` background, `#edf0e5` text, and padding of 6px vertically and 14px horizontally.
- New agent opens a centered 600 by 660px dark dialog. It has installed-agent choices, permission mode buttons and explanation, folder with local Browse button, optional model and first-task fields, Cancel, and Start agent. YOLO changes the explanation to orange and the start button to "Start in YOLO mode". Model appears only for Codex and Claude. Loading, missing-agent, and error messages occupy the agent section as needed.

## How it behaves

| State | Circle color | Face and motion |
| --- | --- | --- |
| working | `#b5d97b` | Open eyes; opacity breathes from 0.78 to 1. |
| blocked | `#f2b477` | "Needs you" label, open mouth. |
| done | `#92cfc3` | "Done" label, ordinary face. Herdr turns done into idle once viewed. |
| idle | `#a6abc3` | "Idle" label, short closed eyes. |

Selected circles have a 3px off-white border. Hover gives the same border and shows title, address, state, working minutes, and click actions. Clicking the body selects and focuses its session. Right-click immediately kills that agent through `terminal.kill`, including its sub-agents. Right-clicking the body runs `terminal.kill {terminal: address}` immediately, ending that agent and its sub-agents. Descendants without panes appear too, marked Sub-agent, and open in their parent's tab when clicked. Labels themselves are informational.

Tab clicks select that tab. + Terminal opens and selects a fresh shell tab. New agent first detects programs installed on the current space's machine. Pick an agent, mode, folder, optional model, and optional task, then press Start agent. The new tab becomes visible immediately, before status arrives. A new circle appears when the program reports status. With no space, the launcher creates a new space instead. Commands opens Herdr's palette. Existing key bindings remain intact; agent navigation follows displayed agent addresses.

Default permission mode uses the configured launch command unchanged. Codex additionally offers Read only, Workspace auto, and YOLO. Claude offers Plan, Accept edits, and YOLO. Other executable names get Default only. Selecting another agent or reopening the launcher resets the mode to Default. YOLO bypasses permission checks; Codex YOLO also disables its sandbox. The explicit start button is the launch action. Folder defaults to the focused terminal's current directory, then the space folder. Browse is local-only; remote paths can be typed. Empty model and task fields keep agent defaults and start without an initial task.

Growth samples every 10 seconds. Credit elapsed time only when an agent is working at both endpoints; cap each credit at 15 seconds. Other states add nothing. Persist seconds by terminal address across reloads, prune records unseen for 30 days, and never shrink an existing record. Display `<1m` before one minute, then whole minutes. Circle diameter changes over 900ms. Working opacity runs natively with a period of 2400ms plus 160ms per list position. Circles drift through native position loops while faces and labels stay upright. Reserve their entire motion envelopes so neighboring paths do not collide or leave the field.

When no agents report status, show "Room to grow", a status-reporting explanation, and New agent. Ordinary shell tabs remain usable in the bottom region and get no circles.

## Built from

Create the following files in an empty folder, with no package installation or build step:

```text
layouts/blobs.json
layouts/blobs.png
mods/blob-garden/mod.json
mods/blob-garden/main.js
mods/blob-garden/geometry.js
mods/blob-tabs/mod.json
mods/blob-tabs/main.js
mods/blob-launcher/mod.json
mods/blob-launcher/main.js
mods/blob-launcher/options.js
README.md
RECIPE.md
preview.png
tests/launcher.test.mjs
tests/geometry.test.mjs
```

Use this layout tree, a moss root theme, Geist UI font, JetBrains Mono terminal font, and the explicit colors above:

```text
root: column, background #101913, system title bar
  garden-header: block, 58px, blob-garden {role: "header"}
  garden-board: block, weight 1, min 220px, blob-garden {role: "board"}
  session: column, weight 1, min 180px, 1px #303b34 border
    session-label: block, 44px, blob-tabs
    session-terminal: block, {tab: "active"}, padding [6, 14]
```

The preview path is `layouts/blobs.png`, copied from the actual window screenshot `preview.png`. Each manifest uses `place: "none"`. The launcher manifest additionally sets overlay width 600 and height 660. No shipped mod is embedded. Herdr still provides its palette, notifications, and native terminal renderer.

All mods default-export a native `View`. Use `div` from `gpui-kit` and `h_flex`/`v_flex` from `gpui-base`. The launcher also uses `InputState` and `Input`. All art consists of native rounded rectangles. There are no bitmap art dependencies or custom fonts.

The board reads `agents()`, `terminals()`, and `focused()`. Begin with agents in pane order. Recursively append live terminals with a known parent and a reported status. Inherit their parent's space name, map error to blocked, and normalize unknown states to idle. Exclude unrelated core terminals. Call `setAgentOrder` on board render. Circle clicks call `agent.focus {terminal}` and `pane.focus {terminal}`; descendants also call `terminal.show {terminal}`. Active-tab content handles the selected agent's parent tab. The legacy terminal-label role is unused by this layout.

Keep geometry in a pure `arrange` helper. Measure the actual field's width and height with `on_size_change` and notify only for changes greater than 1px. Reserve base cells 128px wide and 208px high, 8px gaps, and orbit margins of 14px horizontally and 10px vertically. Try each possible column count, compute rows with a ceiling, and maximize a uniform scale capped at 1 so the complete cells and their motion envelopes fit. Break scale ties by choosing a compact group shape. Sort addresses by a stable FNV-style hash, center each row, and use at most 4px of seeded positional variation. Status changes leave positions stable; count and available bounds can change the arrangement. Never keep coordinates outside the visible field.

Each cell has native left and top loops, without JavaScript animation timers. Horizontal motion spans center plus or minus 14px at scale 1, over 90 to 114 seconds. Vertical motion spans plus or minus 10px, over 120 to 144 seconds. Seed periods by address. Their different periods create slow orbital drift. Scale position ranges with the cells, give each cell a stable orbit ID, and keep all text and faces upright.

Diameter is `min(96, 54 + 12 * log2(1 + seconds / 60)) * scale`. Scale the label sizes, gaps, face parts, and borders with the cell. Give the body equal width and height, `flex_none()`, and radius half its diameter so flex layout cannot flatten it. Eyes are 7 by 10px, or 7 by 3px when idle. Mouth is 15 by 3px, or 7 by 9px when blocked. Face color is `#263325`. Use native width/height transitions and opacity loops. The board alone starts a 10-second data timer. Store `{seconds, seen}` records under mod-local key `growth-v1`; recover from corrupt JSON and use each callback's own `cx`.

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

No mod fetches URLs or reads transcripts or files outside its own assets. Installed-agent detection and program launch go through Herdr APIs. Growth stays in local mod storage. The launcher persists the selected agent in shared state under `blob-launcher.last-agent`, including selections made before cancelling. On reopening, restore it if installed; otherwise select the first installed agent. The launcher's folder and model are not persisted.

## Watch out

- Read the installation's `AGENTS.md`, `herdr.d.ts`, and `gpui-kit.d.ts`. This is native GPUI JavaScript, with no DOM, CSS, Node APIs, or browser timers. Shipped files and generated type files remain untouched.
- Every mod must pass `herdr-app check`, but this only covers initial rendering. Inspect the loaded launcher after asynchronous installed-agent detection as well as all visible prop roles.
- Active-tab terminal content fixes new shells being hidden behind an old focused agent. Pane-less descendants need explicit `terminal.show` after selecting their parent context.
- Default means existing configuration, including any permission settings the person already chose. It is not a forced sandbox preset. YOLO must never become the remembered default. Custom wrapper executables get no guessed flags. Remote or older agent versions must support the chosen flags; local Codex 0.166.0 and Claude help were checked for this build.
- Growth estimates observed working time rather than tokens, transcript length, session age, or time on another layout. Bursts between samples can be missed. Reused terminal addresses can inherit a growth record. Clearing mod storage resets growth.
- Very narrow windows crowd header and dialog controls. Aim for at least 760 by 600 logical pixels, with enough height for the 660px dialog. Scatter reserves label space and grows vertically rather than overlapping. Large lists render eagerly without virtualization.
- All cells scale to fit instead of hiding outside the field. Large counts in small panes make labels small; expand the garden to read them. Circle diameter caps at 96px before fitting. There is no blob dragging, filtering, close-tab button, or arbitrary argument editor. Existing Herdr keys and palette remain available.
- Install without overwriting names. Rename incoming mods and layout references if they already exist. Copy only source and assets, not generated type files, local settings, storage, credentials, or transcripts.

## Done when

1. All three mods pass `herdr-app check`, and switching to blobs leaves `herdr-app status` without errors.
2. All four states have the table's colors, face, and label. Live descendants appear; unrelated shells do not. Circles stay round at minimum and maximum growth and gather close together without overlapping labels.
3. Clicking a circle switches its real session into the bottom view. Existing tabs select correctly. + Terminal creates and displays a new shell tab.
4. New agent loads installed programs, exposes supported permission modes, and starts the selected program in a fresh selected tab. The terminal switches immediately, before status reporting. A circle appears when status arrives.
5. Folder, model, and first task reach the launch request. Switching agent or reopening resets permission mode. YOLO requires its explicit start action. Unsupported modes do not launch.
6. Two working samples increase stored seconds and diameter; idle and blocked samples preserve them. Reload preserves growth; suspended time credits at most 15 seconds.
7. `node --test tests/*.test.mjs` verifies launch arguments, permission overrides, validation, active-tab content, tab actions, full field containment, and nonoverlapping motion envelopes.
8. Resize the garden and confirm every agent remains visible, inspect the empty state and loaded launcher, capture the real window as `preview.png`, and copy it to `layouts/blobs.png`. Publish the folder in the public repository with topic `herdr-layout`.
