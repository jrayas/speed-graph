# Unknowns

Things the research could not settle. Each has a way to resolve it. Ordered by impact.

| # | Unknown | Why it matters | How to resolve | Phase |
|---|---|---|---|---|
| U1 | Does the directory's **build verification** environment have Rust, `wasm32-unknown-unknown` and wasm-pack? | If not, our `build` script fails or produces a different `main.js` → review error | Ask in Discord `#community-directory`; use **Review branch** preview scan on a test repo; fallback: commit built `.wasm`, keep `npm run build` JS-only, separate `build:wasm` | 1 |
| U2 | Is the bundled `main.js` scanned for `new Function`/eval (PixiJS, wasm-bindgen glue)? | Possible review errors | Preview scan; import `pixi.js/unsafe-eval`; inspect glue | 1, 4 |
| U3 | Do blob-URL Workers and `WebAssembly.instantiate` work under Obsidian's CSP on desktop, iOS and Android? | Core architecture | Phase 1 spike on all three platforms; record in TEST-LOG | 1 |
| U4 | Any `main.js` size limit or review concern for large embedded base64 Wasm? | Bundle size (Pixi ~0.8 MB + Wasm) | Ask; keep Wasm small (`opt-level="z"`, `wasm-opt`, no serde) | 1 |
| U5 | Would embedded base64 Wasm be judged "obfuscated"? | Policy | Public Rust source + reproducible build; ask in Discord | 7 |
| U6 | No public signal that the **initial** metadata resolve is complete when a plugin loads late | Graph may build from partial links | Build from current `resolvedLinks`, then refresh on `resolved` (debounced); observe on a large vault | 2 |
| U7 | Are `frontmatterLinks` counted in `resolvedLinks`? | Edge parity with the built-in graph | Observe on a test vault | 2 |
| U8 | Does `resolvedLinks` include attachment (non-Markdown) destinations, and how does the built-in graph define "attachment"? | "Attachments" filter | Observe | 2, 5 |
| U9 | No public API for **Excluded files** (`userIgnoreFilters`) | Built-in graph hides excluded files | Ask the user whether to replicate via our own setting; never read internals | 5 |
| U10 | No public **search-query engine** | Filters and groups use Obsidian search syntax | Implement a documented subset (path, file, tag, plain text); document gaps | 5 |
| U11 | `hover-link` event payload is untyped in the d.ts | Page previews on hover | Check docs/examples; test | 5 |
| U12 | Does `TExternalFile` appear in `getFiles()` or links? | Node set | Observe on 1.14.4 | 2 |
| U13 | Minimum Android version and WebView version | Device test matrix | Ask Obsidian or read Play listing manually | 1 |
| U14 | iOS 1.14.5 has no changelog entry | API drift | Re-check at next research run | — |
| U15 | `SettingDefinitionItem#id` announced but missing from typings | Settings ids | Wait for typings update | — |
| U16 | Exact built-in graph defaults and numeric ranges (forces, node size, fade threshold) | Behaviour parity | Observe the UI (clean-room), record in behaviour-spec | 3, 5 |
| U17 | Is `SharedArrayBuffer` available (cross-origin isolated)? | Wasm threads | Test `crossOriginIsolated` in Phase 1; design assumes no | 1 |
| U18 | WebGL availability/limits on low-end Android and older iPads | Renderer choice | Phase 4 device tests; Canvas 2D fallback decision | 4 |
