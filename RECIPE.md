# Blob garden

A dark green Herdr window turns each live agent into a soft, asymmetric blob with a face. Blobs grow as the agent spends time working, and their colors show whether they are working, waiting for you, done, or idle. Click a blob to use its real session in the terminal across the bottom.

![Blob garden](preview.png)

## What you see

- A 58px header on `#101913` has a small green dot, the name "blob garden", a muted subtitle, and New agent and Commands buttons on the right. Keep the system title bar.
- The garden fills the upper half of the remaining window. It has 24px horizontal padding, a 65px heading region with the live agent count, a vertically scrolling field of blobs, and a 42px status legend. The heading is 24px. Agent names are 13px; space names, state labels, and working times are 11px. Use Geist for interface text, `#edf0e5` for primary text, and `#9da99c` for secondary text.
- Each agent occupies a 242px-high cell. Center rows horizontally. Fit approximately one column per 230px of available width, with cells no wider than 290px. Short rows stay centered. A blob starts 86px wide and 76px high. It grows to at most 190px wide and 167px high. Four different corner radii give it an organic outline. A pair of dark eyes and a short mouth sit in its center. The name, space, status dot, state word, and observed working minutes sit underneath.
- A divider separates the garden from the bottom session region. The two regions initially have equal weight and a draggable boundary. The garden has a 220px minimum height; the session has a 180px minimum.
- The session region has a 44px header with its status dot, SESSION label, agent name and address, and Previous/Next buttons. Below it is the real focused agent terminal, with 6px vertical and 14px horizontal padding. Use JetBrains Mono at 13px, terminal background `#131c17`, and foreground `#edf0e5`.

## How it behaves

| Agent state | Blob color | Face and motion |
| --- | --- | --- |
| working | `#b5d97b` | Open eyes; opacity breathes between 0.78 and 1 over 2400ms plus 160ms per list position. |
| blocked | `#f2b477` | "Needs you" label and a small open mouth. |
| done | `#92cfc3` | "Done" label and an ordinary face. Herdr changes done to idle once viewed. |
| idle | `#a6abc3` | Short, closed eyes and an "Idle" label. |

A selected blob has a 3px off-white outline. Hover gives any blob the same outline and a tooltip containing its title, address, state, observed work time, and click instruction. Click the blob body to select its session and give the bottom terminal keyboard focus. Labels underneath are informational. Previous/Next follows the displayed agent order, including live descendants. New agent opens Herdr's launcher. Choose an installed agent to start it in a new tab in the current space; its blob appears when it reports status. The launcher also offers a terminal, new space, and worktree actions. Agents not installed are disabled. Commands opens Herdr's command palette. Keep existing keyboard bindings; this build adds none.

Growth represents accumulated working time observed while this layout is loaded. Every 10 seconds, credit an agent only if it was working both at the previous sample and the current sample. Cap each credit at 15 seconds so sleep and suspended updates do not cause a large jump. Idle, blocked, and done time add nothing. Save seconds per terminal address across reloads. Growth never shrinks while that record exists. Width changes over 900ms; height is 88% of width. Display `<1m` below one minute, then whole minutes.

Show agents from all spaces and recursively include live, status-reporting descendants without panes. Mark descendants "Sub-agent" beneath their names. Keep unrelated core terminals out. When no agents exist, show "Room to grow", a sentence explaining status reporting, and a New agent button. The bottom terminal follows Herdr's focused-agent fallback. Blobs stay in rows rather than drifting or colliding. Scroll the garden to reach additional rows.

## Built from

Create these files in an empty folder:

```text
layouts/blobs.json
layouts/blobs.png
mods/blob-garden/mod.json
mods/blob-garden/main.js
RECIPE.md
preview.png
README.md
```

The layout node tree is:

```text
root: column, moss theme, system title bar
  garden-header: block, 58px, blob-garden {role: "header"}
  garden-board: block, weight 1, min 220px, blob-garden {role: "board"}
  session: column, weight 1, min 180px, 1px #303b34 border
    session-label: block, 44px, blob-garden {role: "terminal-label"}
    session-terminal: block, {agent: "focused"}, padding [6, 14]
```

Set the layout preview to `layouts/blobs.png`, copied from the real window screenshot `preview.png`. Set the root theme to moss and override background, foreground, border, and accent with the colors above. The mod manifest is `{"place":"none","title":"Blob garden"}`. The New agent buttons open the shipped `new-menu` mod as a 320 by 460px popup with `openOverlay`. Its installed-agent detection and launch behavior remain owned by Herdr. Commands uses the app's existing palette.

Use native `View` and `div` from `gpui-kit` and `h_flex`/`v_flex` from `gpui-base`. One mod class renders the three prop roles. Use `agents()`, `terminals()`, and `focused()` for live data. Starting with `agents()`, recursively append live terminals whose parent is already included and whose status exists. Convert a descendant's `error` to blocked and unrecognized states to idle. Inherit its parent's space name. Call `setAgentOrder` with the resulting addresses on board render.

Blob clicks call `run("agent.focus", {terminal: address})`, then `run("pane.focus", {terminal: address})`. Other buttons call `agent.prev`, `agent.next`, and `app.palette`. The terminal block is native Herdr content, not a transcript or terminal simulation.

The board measures its root with `on_size_change`; notify only when width changes by more than 1px. Calculate columns as `max(1, floor((width - 48) / 230))` and cell width as `max(120, min(290, (width - 48) / columns))`. Calculate blob width as `min(cellWidth - 28, 190, 86 + 21 * log2(1 + seconds / 60))`. Corner radii, clockwise from top-left, are 48%, 34%, 45%, and 30% of width. Eyes are 7px wide and 10px high, or 3px high when idle. The mouth is 15 by 3px, or 7 by 9px when blocked. Face color is `#263325`.

Use native `.loop("opacity", ...)` for breathing and `.transition("width", 900)` / `.transition("height", 900)` for growth. Use a 10-second `cx.timer.every` only to sample growth data and refresh minute labels. Only the board role starts this timer. Save `{seconds, seen}` records under `localStorage` key `growth-v1`; recover from invalid JSON and discard records unseen for 30 days. Each callback uses its own `cx`.

All art is native rounded rectangles. The garden mod makes no network requests, runs no programs directly, and reads no transcripts or external files. The shipped launcher checks installed programs through `knownAgents()` and starts the selected program through `tab.new`. Only Herdr's mod-local storage contains growth records. No packages, build system, or custom fonts are needed.

## Watch out

- Read the target installation's `AGENTS.md`, `herdr.d.ts`, and `gpui-kit.d.ts` before building. This is GPUI JavaScript, without HTML, CSS, DOM, Node APIs, or browser timers.
- Live source data already triggers renders. The timer samples elapsed work; it must not drive animation. Use native loops so the whole window does not redraw from a JavaScript animation timer.
- Working seconds are an approximation, not tokens, transcript length, total session age, or time worked while another layout was active. A short working burst between samples can be missed. Per-address records can carry over if a core reuses addresses. Clearing mod storage resets growth.
- Descendants must have a reported status to appear. Ordinary shells and agents without status reports do not get blobs. Remote availability and terminal routing depend on Herdr.
- Growth stops visually at 190px. Rows have no fixed agent-count limit, but render eagerly. This build has no virtualization, filtering, or blob dragging. The agent launcher uses Herdr's shipped `new-menu` mod. The command palette remains available to start work through Herdr.
- Design for at least 760 by 600 logical pixels. The blob grid reflows below that width, but header and legend text can crowd. Root theme colors intentionally define a dark look.
- A successful check alone does not execute every prop role or deferred interaction. Load the layout and inspect the real window. Newly copied mod folders can take a moment to be discovered; check status again after discovery.
- Install without overwriting existing names. If `blobs` or `blob-garden` exists, rename the new layout/mod and update every mod reference, asset path, and preview path. Never modify shipped layouts, mods, keys, or generated type files.

## Done when

1. `herdr-app check <folder>/mods/blob-garden` passes.
2. After copying the layout, preview asset, and mod to Herdr's corresponding folders, `herdr-app do layout.switch '{"name":"blobs"}'` loads the garden and `herdr-app status` reports no errors.
3. Every status-reporting agent gets a blob. Live descendants appear; unrelated core terminals do not. Each state matches the table and retains its text label.
4. Clicking a blob selects that agent in the bottom native terminal. Typing there reaches that session. Previous/Next uses board order; Commands opens the palette. New agent opens the launcher with installed programs enabled, and selecting one creates a new agent tab.
5. Two working samples increase stored seconds and blob width. Idle and blocked samples preserve size. Reloading preserves growth; a long suspended interval credits at most 15 seconds.
6. Resizing reflows rows, the garden scrolls with enough agents, and the boundary resizes the bottom terminal. An empty agent list shows the empty message.
7. Capture the rendered window with `herdr-app shot preview.png`, inspect it, and copy it to `layouts/blobs.png`. Package only the layout, mod source, recipe, README, and screenshots. Publish the public repository with topic `herdr-layout`.
