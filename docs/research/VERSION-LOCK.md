# VERSION-LOCK

- Status: **proposed — awaiting user approval** (CLAUDE.md rule 2: no plugin code until approved)
- Research date: 2026-10-15 (checked 09:27 UTC)
- Next re-run due: 2026-11-14 (30 days), or sooner on a new Obsidian minor, an API-drift failure, or use of an API not researched here
- Evidence labels: VERIFIED (official source), SECONDARY (third party), UNVERIFIED. Sources: [sources.md](sources.md)

## 1. Current Obsidian versions

| Platform | Stable (public) | Date | Evidence |
|---|---|---|---|
| Desktop | **1.14.4** | 2026-10-05 | VERIFIED: changelog "1.14 Desktop" (slug `2026-10-05-desktop-v1.14.4`); GitHub release `v1.14.4` (stable); `desktop-releases.json` `latestVersion: 1.14.4` |
| Android | **1.14.4** | 2026-10-05 (Play shows "2 Oct 2026") | VERIFIED: changelog "1.14 Mobile"; `Obsidian-1.14.4.apk` on GitHub release; Play Store page shows 1.14.4 |
| iOS / iPadOS | **1.14.5** on App Store; changelog says 1.14.4 | App Store 2026-10-09 | VERIFIED but **disagreeing**: Apple lookup API returns 1.14.5 (min iOS 15.6); no 1.14.5 entry in the changelog. Treat as an iOS hotfix with no documented API change |

Early access ("Catalyst", the old "insider" channel): latest early-access build is also 1.14.4 (2026-10-01). No newer early-access build was listed on 2026-10-15. Desktop installer: Electron 43.7.5 (Chromium 150.0.7871.250) — but only for users who reinstall; `desktop-releases.json` still accepts installers back to 1.1.9, so the desktop Chromium version varies by user.

Disagreements recorded:
1. iOS App Store 1.14.5 vs changelog 1.14.4.
2. The 1.14 changelog announces `SettingDefinitionItem#id`; the `obsidian` npm 1.14.4 typings (and GitHub master) do **not** contain it. Do not use it.
3. The `obsidian` npm package CHANGELOG.md stops at 1.7.2; current API changes are only visible through `@since` tags and the app changelog.
4. The sample plugin's AGENTS.md links `validate-plugin-entry.yml` in obsidian-releases; that file no longer exists (404). Review moved to community.obsidian.md.

## 2. Pinned Obsidian API

| Item | Pin | Evidence |
|---|---|---|
| `obsidian` (npm) | **1.14.4** (published 2026-10-08) | VERIFIED: npm registry `latest` |
| integrity | `sha512-Kyo+5t0wFW2On5irLOPrgtwWDnaJsvE9n/P1OVvdPytx+NqeHJXvxVqADNOqLp9bU1+I64B6i+dHb0fxR/ss3w==` | VERIFIED: npm registry |
| `obsidian.d.ts` sha256 | `33294c523546bcb961e1a612d2614a9009c19dbbbada1ebc2e24ea7aa73713dd` (11,539 lines) | computed locally from the tarball |
| peer deps it declares | `@codemirror/state` 6.7.6, `@codemirror/view` 6.43.13 | VERIFIED: package.json |
| GitHub `obsidianmd/obsidian-api` master | commit `9abd9605ce` (2026-10-05); d.ts differs from npm only in comments ("sidedock" → "sidebar") | VERIFIED |

Every API we use must exist in this d.ts with an `@since` no higher than our minAppVersion, or be guarded (section 5).

## 3. Proposed minAppVersion: **1.13.4** (see [ADR 0002](../adr/0002-min-app-version.md))

Short reasons:
- 1.13.4 (2026-07-30) is the first **public** 1.13 build (1.13.0–1.13.3 were early access only). VERIFIED: GitHub releases.
- 1.13 introduced declarative settings (`getSettingDefinitions()`, `@since 1.13.0`), including a native `slider` control; 1.13.1 added slider `displayFormat`. A 1.13+ floor means one settings implementation, not two (official guide "Path A").
- Everything else we need is older: `ItemView`, `registerView`, `MetadataCache.resolvedLinks/unresolvedLinks` and its events, `onLayoutReady`, `requireApiVersion`, `Plugin.onUserEnable` and deferred-view APIs (1.7.2).
- Nothing in 1.14 is needed (1.14 adds `TExternalFile`, Bases `groupOrder`).
- Cost: users still on ≤1.12.x cannot install (Obsidian then offers an older plugin version via `versions.json`, but we will have none). 1.13 has been public for 2.5 months.

## 4. Pinned toolchain (exact versions from official registries on 2026-10-15)

| Tool | Pin | Latest on registry | Why this pin | Evidence |
|---|---|---|---|---|
| TypeScript | **5.9.3** | 7.0.2 (`latest`), 6.0.3 | typescript-eslint 8.71.2 supports only `>=4.8.4 <6.1.0`; the official sample lockfile resolves 5.9.3. TS 7 is out of range | VERIFIED: npm registry |
| esbuild | **0.28.2** | 0.28.2 | Latest; sample plugin pins 0.25.5 (older). Config (`format: cjs`, `target: es2021`, externals) is unchanged between them. Fallback pin 0.25.5 if 0.28 misbehaves | VERIFIED: npm registry; sample `package.json` |
| esbuild target | **es2021** | — | Matches sample; iOS minimum 15.6 (App Store) lacks some ES2022 (static blocks need Safari 16.4) | VERIFIED sample; SECONDARY browser data |
| ESLint | **9.39.4** | 10.12.0 (`latest`), 9.39.5 (`maintenance`) | eslint-plugin-obsidianmd peers `@eslint/js ^9.30.1`; sample lock uses 9.39.4 | VERIFIED |
| @eslint/js | **9.39.4** | — | must match ESLint 9 line | VERIFIED |
| typescript-eslint | **8.71.2** | 8.71.2 | latest; peer range covers ESLint 9 and TS 5.9 | VERIFIED |
| eslint-plugin-obsidianmd | **0.4.2** | 0.4.2 (2026-08-24) | official | VERIFIED |
| Rust (stable) | **1.99.0** (2026-09-28) | 1.99.0 | current stable channel manifest | VERIFIED: static.rust-lang.org |
| wasm-pack | **0.15.0** | 0.15.0 (npm and crates.io) | latest | VERIFIED |
| wasm-bindgen (crate + CLI) | **0.2.129** | 0.2.129 (2026-09-25) | latest; CLI must equal crate version | VERIFIED: crates.io |
| js-sys / web-sys (if needed) | 0.3.106 | 0.3.106 | match wasm-bindgen 0.2.129 | VERIFIED: crates.io |
| Rust wasm target | `wasm32-unknown-unknown`, default features, **no `simd128`** | — | Rust 1.87+ defaults (bulk-memory, nontrapping-fptoint, reference-types, multivalue, sign-ext, mutable-globals) all need Safari ≥15 — fits iOS 15.6. SIMD needs Safari/iOS 16.4 | VERIFIED: rustc platform docs; WebAssembly feature table |
| PixiJS | **8.22.0** (MIT) | 8.22.0 | latest v8; final choice still subject to Phase 4 research | VERIFIED: npm registry |
| d3-force (reference only, not bundled) | 3.0.0 (ISC) | 3.0.0 | algorithm reference for the Rust port | VERIFIED |
| Node.js (dev) | 22.x LTS (local machine has 22.23.3; npm 10.9.9) | — | sample CI matrix 20/22/24 | VERIFIED sample CI |

Dependency check (run, scratch directory, not project code): `npm install --dry-run` with obsidian 1.14.4 + eslint-plugin-obsidianmd 0.4.2 + eslint 9.39.4 + typescript-eslint 8.71.2 + typescript 5.9.3 + esbuild 0.28.2 resolved 337 packages with no ERESOLVE error, although the eslint plugin declares an exact peer `obsidian: 1.8.7` (npm nests its own obsidian 1.12.3). Full install and lint run: **untested**.

## 5. Settings approach and requireApiVersion guard strategy

- Settings tab: **declarative only** — override `PluginSettingTab.getSettingDefinitions()`, no `display()`. Controls bind to `this.plugin.settings[key]` and auto-save. `slider` (min/max/step required) and `render` callbacks (custom rows) are available, so sliders are supported. VERIFIED: d.ts + Settings docs.
- All-or-nothing rule (VERIFIED, d.ts `SettingTab.display` doc + Settings docs): when `getSettingDefinitions()` returns a non-empty array, `display()` is never called; refresh with `this.update()`, not `display()`.
- Settings tab holds **defaults** (default forces, display, performance caps). **Live force/display controls live in the graph view's own panel**, like the built-in graph, because they need instant feedback and per-view state; they write back through the plugin and call the tab's `update()` only if needed.
- Guard rule: any API whose `@since` is higher than 1.13.4 must sit inside a literal `if (requireApiVersion('x.y.z'))`, ternary or `&&` guard — the `obsidianmd/no-unsupported-api` rule recognises exactly these forms (VERIFIED from the rule source). Today no such API is planned.

## 6. Known risks (details in [unknowns.md](unknowns.md) and tracking/RISKS.md)

1. **Build verification by the community directory** runs our `build` script and compares output with the release. Whether its environment has Rust + wasm-pack is undocumented. May force committing the built `.wasm` and keeping `npm run build` JS-only.
2. **Only `main.js`, `manifest.json`, `styles.css` are installed** — worker code and `.wasm` must be embedded in `main.js`. Size limit for `main.js`: undocumented.
3. **No official statement on Workers/Wasm/CSP** in Obsidian on iOS/Android. Secondary evidence (listed plugins Typst Renderer, Typst Mate) says blob-URL workers + embedded Wasm work. Must be proven in Phase 1 on real devices.
4. **PixiJS uses `new Function`** unless `pixi.js/unsafe-eval` is imported; whether the directory scanner flags it inside the bundle is unknown.
5. **No public API** for the built-in graph, Obsidian's search-query engine, or the "Excluded files" setting — filters/groups need our own query subset.
6. iOS version disagreement (1.14.5) and the missing `SettingDefinitionItem#id` show the docs/typings can drift.
