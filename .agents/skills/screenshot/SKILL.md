---
name: screenshot
description: Capture the live Herdr window and replace the repository's preview.png, the image README.md and RECIPE.md show. Use when asked to take a Herdr screenshot, refresh or update preview.png, or re-shoot the Blobs preview.
---

# Screenshot

Resolve the repository root from this skill's location. `preview.png` lives at the root and is the only screenshot the README and RECIPE reference. Keep that name.

1. Run `herdr-app status`. The window must be open, `layout` must be `blobs`, `overlays` and `floats` should be empty, and `errors` must be empty. If the layout differs, switch with `herdr-app do layout.switch '{"name":"blobs"}'`. Fix or report errors before shooting. Never capture a frame that shows an error.
2. Run `herdr-app ls` and check the garden has agents worth showing. If it has none, or the user asks for a staged shot, follow the `demo-blobs` skill first and leave its demo open. Do not open or close tabs the user did not ask about.
3. Capture to a temporary path outside the repository, not straight over `preview.png`:

   ```sh
   herdr-app shot "$TMPDIR/herdr-preview.png"
   ```

   `shot` saves the last frame the window rendered. If the window was just changed, run `herdr-app status` again first so the frame is current.
4. View the captured image. Check that blobs are visible with readable labels, the bottom terminal shows an agent or clean shell rather than secrets, tokens, or private paths the user would not publish, and no menu, dialog, or toast covers the garden. If anything is off, fix the window and capture again.
5. Copy the capture over `<repo>/preview.png`. Report the old and new pixel dimensions with `file preview.png`. A big drop in size usually means the window shrank, so mention it.
6. Leave the change uncommitted unless the user asks to commit it.
