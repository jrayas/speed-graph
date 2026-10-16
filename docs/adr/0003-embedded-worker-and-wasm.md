# ADR 0003: Embed the worker source and .wasm in main.js
- Status: accepted (Phase 1); desktop run passed (user-reported)
- Date: 2026-10-15
## Context
Obsidian installs only main.js, manifest.json and styles.css, so a separate worker file or .wasm would not exist.
## Options
1. Separate files (not installed). 2. Embed worker source string and .wasm bytes in main.js.
## Choice
Option 2. The worker is bundled by esbuild as its own IIFE, injected into main.js as a string and started from a Blob URL. The .wasm is loaded with esbuild's binary loader and passed to the worker, which calls wasm-bindgen's initSync. The wasm-bindgen target is "web"; the unused default init path is neutralised with an \`import.meta.url\` define.
## Consequences
main.js is 22.9 KB now (wasm 14 KB). Works in Node worker_threads; desktop Obsidian and mobile still to be tested. Glue has no eval/new Function.
