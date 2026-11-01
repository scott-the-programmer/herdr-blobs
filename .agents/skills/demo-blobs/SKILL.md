---
name: demo-blobs
description: Create a Herdr Blobs demo with scripted sessions or live coding agents, varied context sizes and rarities, an evenly spread scatter, and 60% garden zoom. Use when preparing or resetting a Blobs demonstration.
---

# Demo blobs

Use the repository's `demo/workspace.mjs`. Resolve the repository root from this skill's location. Default sessions are scripted and run no AI models or API calls. When the user asks for real coding terminals, use `--live --count 6` unless they specify another count. Live mode launches interactive Codex with its configured model, a read-only sandbox, and a bounded repository explanation task. It uses the user's Codex account. Do not apply scripted status signals to live agents.

1. Inspect `herdr-app ls` and `herdr-app status`. Read `herdr-app --skill` and the installed app guide before changing installed mods. Ensure the repo's Blobs mods and layout are installed, including `mods/blob-garden/demo.js`. Update this project's installed copies when needed; preserve unrelated mods, layouts, and existing sessions.
2. Run `herdr-app check <installed blob-garden directory>`. Switch to the installed Blobs layout with `herdr-app do layout.switch '{"name":"blobs"}'`.
3. Run `node demo/workspace.mjs` from the repository root. The script captures the current space and opens every demo session as a new tab there. It creates a space only when none is active. Save its JSON result outside the repository so the exact space, tab, and terminal IDs remain available. Default output is 8 named sessions spread evenly across the garden without aligned rows or columns, all six types, all four states, context usage between 2% and 98%, and some one-million-token context limits. The first session sets garden zoom to 0.6. Rarity follows type: Pebble/Sprout/Ripple are Common, Ember/Frost are Rare, Cosmic is Ultra rare.
4. Inspect `herdr-app status`, capture `herdr-app shot /tmp/demo-blobs.png`, and view the image. Confirm the recorded demo tabs appear alongside existing tabs in the original space. Confirm the requested number of new blobs, 8 by default, spread across the garden without aligned rows or columns, varied silhouettes and sizes, readable state/context labels, and the garden's 60% control. App-wide zoom in `status` is separate. Click a blob only if needed to confirm session switching.
5. Report the destination space ID, demo tab count, and any verification limits. Leave the demo open. When asked to reset or remove it, close each recorded demo tab with `herdr-app do tab.close '{"id":"<recorded tab>","confirmed":true}'`, then recreate if requested. Preserve the destination space and all other tabs. On partial failure, use the recorded sessions in the error output to clean up only the tabs created by that run.

For live mode, use `--live` in step 3 and verify each terminal with `hc get` and `hc read` before capturing the screenshot. Resolve startup dialogs through normal readiness checks. Status and harness identity come from real agents; context and rarity remain synthetic demo overrides. Leave an agent terminal selected for the screenshot. Never claim demo context counters are actual model usage.

## Programmatic controls

Preview or export the default config without changing the window:

```sh
node demo/workspace.mjs --dry-run > /tmp/demo-blobs.json
```

Edit the JSON, then run `node demo/workspace.mjs --config /tmp/demo-blobs.json`. Top-level fields are `name` for the fallback space when none is active, `zoom` as a multiplier, and `blobs`. Each blob has `title`, `status`, `app`, `type`, `used`, `limit`, and normalized `x`/`y` coordinates between 0 and 1. `--count N` generates a different count without a config. The script validates the entire config before opening sessions. Size follows `used / limit`, so a large token count alone does not imply a large body.

For live visual changes, read `hc get <terminal>` and replace only its `blob.demo` JSON label, preserving `run` and any other desired fields:

```sh
hc label <terminal> 'blob.demo={"run":"<recorded run>","type":"cosmic","used":980000,"limit":1000000,"x":0.5,"y":0.5}'
```

Put `zoom` on the first demo terminal's label to change demo zoom. Valid range is 0.5 to 2 in 0.1 steps. A changed zoom value applies once, leaving subsequent manual zoom controls usable. Context, type, and position labels update without restarting the session. Dragged positions take precedence over configured coordinates. Title, harness, and status come from the scripted process; edit those in the config and recreate the demo. The terminal's printed summary reflects its launch config.

The garden reads overrides only from explicit `blob.demo` labels with a nonempty `run`. Removing that label restores normal telemetry and deterministic rarity. Removing all demo zoom labels restores the prior garden zoom and pan. Other agents remain visible, so total blob count can exceed the demo count when existing agents are running.
