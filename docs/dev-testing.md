# Testing in a real Obsidian (developer access)

Works on Obsidian 1.14.4 (Electron 43, Chromium 150), macOS. Verified 2026-10-15.

## How
1. `bench/obsidian-cdp/launch.sh test-vault/gen-1k <work dir>` starts a second Obsidian with its own data folder and Chromium's `--remote-debugging-port=9222`, on a **copy** of the vault. The user's own Obsidian and the repo vaults are not touched.
2. Connect with Node 22 (built-in `WebSocket`) to the page whose URL starts with `app://`. `cdp.mjs` has `eval`, `key` and `shot`. Inside the page, `app` is Obsidian's global, so we can enable plugins (`app.plugins.setEnable(true)`), run commands (`app.commands.executeCommandById`), read plugin and view state, and send real mouse events (`Input.dispatchMouseEvent`).
3. After rebuilding: `app.plugins.disablePlugin('fast-graph'); app.plugins.enablePlugin('fast-graph')`, then run the open-graph command.
4. Stop it when finished: `pkill -f "user-data-dir=<work dir>/obs-data"`. The debug port gives full control of that instance to any local process, so it only runs during testing.

## Rules (learned the hard way)
- Never point the instance at a repo vault. On 2026-10-15 the notes in `test-vault/gen-1k` were deleted while the instance was running on it (cause unknown: simulated input or manual use of the visible window; the plugin has no delete code). It was regenerated with `bench/generate-vault.mjs`, and the instance now always runs on a scratch copy.
- Obsidian opens a "Do you trust the author of this vault?" dialog on first open. Dismiss it with Escape; do not click Trust without the user's say-so.
- Wait for the layout to settle (`view.settled`) before measuring node positions, or clicks miss because nodes are still moving.
- The Settings window is a second page target; always select the `app://` page that has `app` defined.

## Added 2026-10-15 (Phase 5)
- `launch.sh` now gives the scratch copy its own plugin files instead of the vault's symlink to `plugin/`. Before this, the plugin's saved settings (`data.json`) landed in the repo's plugin folder and leaked into later runs, which made one check fail for the wrong reason. `data.json` is git-ignored.
- `sync.sh <work dir>` copies a fresh build into the running scratch vault; then disable and enable the plugin to reload it.
- `obs-phase5.mjs` drives the real panel controls and compares the visible node sets with an independent parse of the vault files. `obs-scale.mjs` also runs the CPU profiler while the graph opens and prints the top self-time functions.
- Chromium flags `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows` stop the test window from being throttled when it is not in front.
- Wait for Obsidian's cold index of a large vault before measuring (a vault copy is re-indexed from scratch each launch).
