# Blob garden for Herdr

Each agent is a blob. Working time grows it; color shows state. Click a blob to use its session in the bottom terminal.

![Blob garden](preview.png)

Read [RECIPE.md](RECIPE.md) for the complete rebuild brief, growth rules, and limitations.

## Install

Requires Herdr with native mod and focused-agent block support. The mod uses no network, external commands, or transcript reads.

Copy `mods/blob-garden/` into `~/.config/herdr-app/mods/`, and copy both files from `layouts/` into `~/.config/herdr-app/layouts/`. If either name already exists, rename this layout and mod and update their references before copying.

Then run:

```sh
herdr-app check ~/.config/herdr-app/mods/blob-garden
herdr-app do layout.switch '{"name":"blobs"}'
herdr-app status
```

Existing keyboard bindings stay in place. Use the Commands button for the palette, Previous/Next for agent navigation, and the divider above the session to resize it. `ctrl-shift-l` switches layouts.

Growth counts sampled working time while the layout is loaded. It persists locally and caps the displayed blob width at 190px. It does not measure tokens or transcript length.
