# ADR 0019: Release layout, and the compiled Wasm committed to the repository
- Status: accepted for preparation (user asked to publish 2026-10-16); nothing has been pushed
- Date: 2026-10-16

## Context
The community directory reads `manifest.json`, `README.md` and `LICENSE` from the ROOT of the repository, runs the `build` script from source (Rust may not be installed there), and ignores folders named `pkg`, `scripts`, `docs`, `test` and similar when it scans the code. The working project keeps the plugin in `plugin/` and the Rust crate in `core/`, with the Wasm glue generated into `core/pkg/` (not committed).

## Choice
Leave the working project as it is, and build the publishable repository with `publish/stage.sh` into `publish/out/fast-graph/` (never inside the project tree that is edited). In that layout the plugin is at the root, `core/` holds the Rust source and, in `core/pkg/`, the generated glue and binary; `src/generated/core.wasm` is the embedded copy (the script refuses to stage if it differs from the current build). The glue is committed so `npm run build` needs only Node, and it sits in `pkg/` because the directory's scan ignores that folder name (wasm-pack's own `.gitignore` is not copied; it hides everything). Developer scripts (the real-Obsidian harness and the vault generator) go in `scripts/`, which the scan also ignores. Docs are included without the working notes (`tracking/`, `CLAUDE.md`, `.claude/`), which stay private to the project. Release files are `main.js`, `manifest.json`, `styles.css`; a tag workflow builds from source, attests the output and creates a draft release.

## Verified (2026-10-16)
In the staged folder, with no Rust installed: `npm ci`, `npm run lint` (clean), `npm test` (148 pass), `npm run build` (main.js byte-identical to the working build). A vault with only the three release files loads, opens the graph in 2D and 3D, applies a pack shape, lists the built-in packs, shows no console errors, and writes only its own cache files.

## Consequences
Publishing from the staged folder means any change to the working project needs `publish/stage.sh` re-run. The binary in the repository is reproducible from `core/` with `npm run build:wasm` (Rust 1.9x and wasm-pack needed). The generated glue is wasm-bindgen's (MIT or Apache-2.0).
