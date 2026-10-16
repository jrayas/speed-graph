# API findings — the 11 research questions

Pinned typings: `obsidian` 1.14.4. Proposed minAppVersion: 1.13.4. Date: 2026-10-15. Source list: [sources.md](sources.md). "d.ts" means `obsidian.d.ts` from npm 1.14.4.

## 1. File structure and manifest.json schema — VERIFIED
- Release assets: `main.js`, `manifest.json`, optional `styles.css`, attached to a GitHub release whose tag equals `manifest.version` exactly (no leading `v`). Obsidian downloads **only these three files**. ([Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin); [obsidian-releases README](https://github.com/obsidianmd/obsidian-releases))
- Repo root needs `README.md`, `LICENSE`, `manifest.json`. The directory reads `manifest.json` at HEAD of the default branch; `versions.json` maps plugin version → minAppVersion so older apps get a compatible release.
- Manifest ([Manifest](https://docs.obsidian.md/Reference/Manifest)):

| Field | Required | Rule |
|---|---|---|
| `id` | yes | lowercase letters and hyphens only; must not end with `plugin`; must not contain `obsidian`; unique; never change after release; matches folder name in dev |
| `name` | yes | Basic Latin; no "Obsidian", no "Plugin"; not a core feature name alone (e.g. not "Graph view"); unique |
| `version` | yes | `x.y.z` |
| `minAppVersion` | yes | real minimum; if unsure use latest stable |
| `description` | yes | ≤250 chars, ends with a period, action statement, no "This is a plugin" |
| `author` | yes | |
| `isDesktopOnly` | yes (docs table) | `true` only if Node/Electron APIs are used |
| `authorUrl`, `fundingUrl` | no | `fundingUrl` only for donations; string or map |

Implication: our name must not be "Graph view"; something like "Fast graph" would need checking against existing names.

## 2. Build and bundle — VERIFIED (sample plugin)
- esbuild, `entryPoints: ['src/main.ts']`, `bundle: true`, `format: 'cjs'`, `target: 'es2021'`, `outfile: 'main.js'`, `minify` in production, inline sourcemap in dev only, `treeShaking: true`.
- Externals: `obsidian`, `electron`, `@codemirror/*` (autocomplete, collab, commands, language, lint, search, state, view), `@lezer/common`, `@lezer/highlight`, `@lezer/lr`, Node built-ins.
- `npm run build` = `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`. The directory scanner runs the first of `build`, `build:plugin`, `compile` ([FAQ](https://docs.obsidian.md/Community+directory/Frequently+asked+questions)).
- Other bundlers are acceptable if everything ends up in `main.js` (sample AGENTS.md).
- Release workflow in the sample attests build provenance (`actions/attest@v4`) and creates a draft release with `gh`.

## 3. Custom views — VERIFIED
- Extend `ItemView` (`contentEl`, `addAction`); implement `getViewType()`, `getDisplayText()`, optional `getIcon()`, `onOpen()`, `onClose()`, `onResize()`. Register with `this.registerView(type, leaf => new View(leaf))` ([Views](https://docs.obsidian.md/Plugins/User+interface/Views)).
- Never keep references to view instances; the factory may be called many times. Find views with `workspace.getLeavesOfType(type)` + `instanceof` (lint: `no-view-references-in-plugin`, error).
- Open: `workspace.getLeaf(...)` / `getRightLeaf(false)` → `await leaf.setViewState({ type, active: true })` → `await workspace.revealLeaf(leaf)` (returns a Promise).
- Deferred views (since 1.7.2): on startup leaves hold a `DeferredView` until shown; check `leaf.isDeferred`, use `await leaf.loadIfDeferred()` sparingly ([Defer views](https://docs.obsidian.md/Plugins/Guides/Defer+views)). Keep the view constructor cheap.
- Do not detach leaves in `onunload` (lint `detach-leaves`, error). `Plugin.onUserEnable()` (1.7.2) is the place to open the view on first enable.
- `View.scope` is public (hotkeys while view focused). Popout windows: use `activeDocument`/`activeWindow` and `.instanceOf()` checks.
- Deprecated around views: `Workspace.activeLeaf` (discouraged), `splitActiveLeaf`, `getUnpinnedLeaf`, old `duplicateLeaf`/`setActiveLeaf` signatures.

## 4. Settings — VERIFIED
- 1.13.0 added declarative settings: override `PluginSettingTab.getSettingDefinitions(): SettingDefinitionItem[]`. `control` definitions bind `key` to `this.plugin.settings[key]`, read via `getControlValue`, write + `saveData()` via `setControlValue` (both overridable). `Plugin.settings?: unknown` was added (1.13.0).
- Control types: `toggle`, `text`, `textarea`, `number` (min/max/step), **`slider`** (min/max/step required; `displayFormat` since 1.13.1), `dropdown`, `file`, `folder`, `color`, `secret` (1.13.2). Plus `render` (custom row, no auto-save, may return a cleanup function), `action`, groups, lists, sub-pages, `visible`/`disabled` predicates, `validate`.
- **All-or-nothing**: `display()` is "Not called when getSettingDefinitions returns a non-empty array" (d.ts). `display()` is `@deprecated Since 1.13.0`. Refresh with `update()` (structure) or `refreshDomState()` (visibility/disabled).
- Dual support (Path B) is only for minAppVersion < 1.13.0; lint rules `require-display` (below 1.13) and `no-deprecated-display` (1.13+) enforce the right shape.
- `getSettingDefinitions()` runs on every update and once at registration for search indexing — keep it cheap.
- Sliders and custom controls **are** supported. Decision: plugin-wide defaults in the declarative tab; live force/display tuning in the graph view's own panel (per-view state, instant feedback), as the built-in graph does.
- Not in typings despite changelog: `SettingDefinitionItem#id` (1.14).

## 5. Reading links, caching, startup timing — VERIFIED (d.ts, load-time guide) with UNVERIFIED gaps
- `metadataCache.resolvedLinks: Record<sourcePath, Record<destPath, count>>`; `unresolvedLinks` same shape with unknown destinations. Paths are vault paths (`TFile.path`).
- Events: `changed(file, data, cache)` after indexing (not on rename — use `vault.on('rename')`); `deleted(file, prevCache)`; `resolve(file)` per file; `resolved()` when all files resolved, **fired again after later modifications**.
- Per-file data: `getFileCache(file)` → `links`, `embeds`, `tags`, `frontmatterLinks` (1.4+), `frontmatter`; `getAllTags(cache)`.
- Vault: `getMarkdownFiles()`, `getFiles()`, events `create/modify/delete/rename`. `create` fires for every file during vault load → register vault handlers inside `workspace.onLayoutReady` ([Optimize load time](https://docs.obsidian.md/Plugins/Guides/Optimize+plugin+load+time)).
- Startup plan: do nothing heavy in `onload`; build the graph when the view opens (after layout ready); read `resolvedLinks` once, convert to numeric IDs + typed arrays; subscribe to `resolved` (debounced) and per-file `resolve`/`deleted` + vault `rename` for incremental updates.
- Gaps (UNVERIFIED, see unknowns.md): no public flag says the initial resolve has finished; whether `frontmatterLinks` are included in `resolvedLinks`; whether `resolvedLinks` includes non-Markdown destinations (attachments) — observable, test in Phase 2.
- No public API for "Excluded files" (`userIgnoreFilters`); `vault.getConfig` appears only in a doc comment, not as a declared member.

## 6. Web Workers and WebAssembly — mostly SECONDARY / UNVERIFIED
- Official docs mention workers and "WASM instances" only as resources that must be cleaned up in `onunload` ([Manage plugin lifecycle](https://docs.obsidian.md/Plugins/Guides/Manage+plugin+lifecycle)). There is no official statement on CSP, worker creation, Wasm, or size limits. VERIFIED absence.
- Because only `main.js` is installed, the worker script and `.wasm` bytes must be **embedded in `main.js`** (VERIFIED consequence of section 1). A separate `.wasm` file in a release would never reach users.
- Working pattern in listed plugins (SECONDARY): Typst Renderer builds the worker separately, inlines it as a string, creates `new Worker(URL.createObjectURL(new Blob([code])))`, and embeds Wasm via esbuild's binary loader; manifest has no `isDesktopOnly`. Typst Mate (Rust Wasm + worker) sets `isDesktopOnly: false`.
- Instantiate with `WebAssembly.instantiate(bytes)` inside the worker, not `instantiateStreaming(fetch(...))` — avoids MIME/fetch issues reported with Capacitor (SECONDARY, 2022 forum).
- Feature floor: iOS app minimum is 15.6 (App Store). Rust 1.99 default wasm features need Safari 15 — OK. No `simd128` in the baseline (Safari/iOS 16.4). VERIFIED (rustc docs, WebAssembly feature table).
- `SharedArrayBuffer`/Wasm threads need cross-origin isolation; nothing says Obsidian provides it — assume no threads (UNVERIFIED). Use transferable `ArrayBuffer`s.
- Review: a bundled `.wasm` as a separate file is pointless (not installed); embedded base64 Wasm could look like obfuscation, which policies forbid — keep Rust source in the repo and rely on build verification (UNVERIFIED how reviewers treat it).
- Lint: `no-eval`, `no-implied-eval` and the Function constructor are errors; wasm-bindgen glue and PixiJS (`new Function`, avoidable with `import 'pixi.js/unsafe-eval'`) must not trip them in our source. Whether the scanner inspects the bundled `main.js` is unknown.

## 7. isDesktopOnly, Capacitor vs Electron — VERIFIED (+ SECONDARY)
- Desktop = Electron (`Platform.isDesktopApp`); mobile = Capacitor (`Platform.isMobileApp`, `isIosApp`, `isAndroidApp`, `isPhone`, `isTablet`) — d.ts.
- Node.js and Electron APIs are desktop only; using them requires `isDesktopOnly: true` ([Submission requirements](https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins)). Lint `no-nodejs-modules` warns; `platform` rule bans `navigator` OS sniffing — use `Platform`.
- Mobile caveats: status bar items do not work on mobile apps (sample comment); regex lookbehind fails before iOS 16.4 (lint `regex-lookbehind`, error); test with `app.emulateMobile(true)`, Safari Web Inspector (iOS 16.4+), `chrome://inspect` (Android).
- Web view engines: iOS uses WebKit (WKWebView), Android uses the system Chromium WebView — SECONDARY/UNVERIFIED (not stated in Obsidian docs).
- We keep `isDesktopOnly: false` (CLAUDE.md), which our design allows: no Node/Electron APIs.

## 8. Performance, memory, cleanup — VERIFIED
- Keep `onload` minimal; defer startup work to `onLayoutReady`; cheap view constructors (views reopen at launch); production, minified `main.js` ([Optimize load time](https://docs.obsidian.md/Plugins/Guides/Optimize+plugin+load+time)).
- Clean up everything created in `onload` or later: use `registerEvent`, `registerDomEvent`, `registerInterval`, `register(() => ...)`, child `Component`s; terminate workers, free Wasm instances and large buffers in `onunload`/`onClose` ([Manage plugin lifecycle](https://docs.obsidian.md/Plugins/Guides/Manage+plugin+lifecycle)).
- Debounce vault/metadata events; avoid iterating all files to find one (`vault/iterate` lint); prefer Vault API over Adapter.
- Mobile: "Avoid large in-memory structures" (sample AGENTS.md).
- No CSS-in-JS: no `el.style.x = ...` (lint `no-static-styles-assignment`, error) — use classes + CSS variables in `styles.css`; no `<style>`/`<link>` elements (`no-forbidden-elements`, error). The rule only flags literal values; runtime values go through `el.setCssProps({ '--var': value })` (recommended by the rule's own message; `setCssProps` is in the d.ts). Canvas pixel size is set via `canvas.width/height` attributes, not styles.

## 9. APIs deprecated or changed in the last three minors — VERIFIED
See [deprecations.md](deprecations.md). Headlines: 1.12 renamed Bases view option types (`BaseOption` → `BasesOption` …); 1.13 deprecated `SettingTab.display()`, `ButtonComponent.setWarning()` and `SliderComponent.setDynamicTooltip()`, removed `CloseableComponent` and `SliderComponent.showTooltip`; 1.14 deprecated `Editor.getDoc()` and `Menu.close()`, added `TExternalFile`.

## 10. What the community-directory review checks — VERIFIED
- Automated scan after each release, sections **Manifest**, **Releases**, **Source code**, **Build verification**; each result Error / Warning / Recommendation / Pass. Errors block installation; warnings do not ([Manage your plugin or theme](https://docs.obsidian.md/Community+directory/Manage+your+plugin+or+theme)).
- Build verification: runs `build` (or `build:plugin`, `compile`) and checks the output matches the release.
- Scanner ignores: `node_modules, dist, build, pkg, test-vault, .obsidian, esbuild.config.mjs, version-bump.mjs, automation, *.test.*, *.spec.*, test(s), __tests__, mocks, *.cjs, *.mjs, *.cts, *.mts, vite, scripts, docs, i18n/locales…`.
- Run checks locally with eslint-plugin-obsidianmd `recommended`. Full checklist: [guidelines-checklist.md](guidelines-checklist.md).
- Policies: no obfuscation, no client-side telemetry, no self-updating, no remote ads; disclose network use; LICENSE required; forks restricted.

## 11. Does the built-in graph view expose a plugin API? — VERIFIED (absence)
- No. The d.ts contains no graph types, events or settings; the only "graph" mentions are unrelated. Graph view is a core plugin documented only for users ([Graph view](https://help.obsidian.md/plugins/graph)). Reaching into internal plugins (`app.internalPlugins`) is untyped and outside our rules. We must rebuild behaviour from the help docs and observation (clean-room).
- Related public hooks we can use: `registerHoverLinkSource` + `hover-link` for page previews, `workspace.trigger('file-menu', …)`/`Menu` for context menus, `workspace.openLinkText`/`getLeaf(Keymap.isModEvent(evt))` for click-to-open — to verify in Phase 5.
