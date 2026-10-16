# Guidelines checklist (release gate)

Tick each item before every release. Sources: [Developer policies](https://docs.obsidian.md/Developer+policies), [Submission requirements](https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins), [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines), [FAQ](https://docs.obsidian.md/Community+directory/Frequently+asked+questions), eslint-plugin-obsidianmd 0.4.2 `recommended`. All VERIFIED on 2026-10-15 unless marked.

## Repository and release
- [ ] `README.md` (purpose, usage, screenshots; disclose any network use — we plan none) and `LICENSE` (GitHub must recognise it; lint `validate-license`).
- [ ] `manifest.json` committed at HEAD of default branch; `versions.json` updated.
- [ ] GitHub release tag == `manifest.version` (`x.y.z`, no `v`); assets `main.js`, `manifest.json`, optional `styles.css` attached individually.
- [ ] Worker code and Wasm embedded in `main.js` (nothing else is installed).
- [ ] `npm run build` is the production build and reproduces the release `main.js` (build verification).
- [ ] Production build is minified, no inline sourcemap.
- [ ] Test files named so the scanner ignores them (`*.test.*`, `tests/`, `__tests__`, `test-vault`, `scripts`, `docs`, …).

## Manifest
- [ ] `id`: lowercase + hyphens, not ending in `plugin`, no `obsidian`, unique, never changed.
- [ ] `name`: Basic Latin, no "Obsidian"/"Plugin", not a bare core-feature name, unique.
- [ ] `description`: ≤250 chars, action statement, ends with ".", no emoji, correct capitalisation.
- [ ] `minAppVersion` accurate (proposed 1.13.4); `isDesktopOnly: false`; `fundingUrl` only if we accept donations.

## Policies (removal if broken)
- [ ] No obfuscated code; Rust source for the Wasm is public in the repo.
- [ ] No client-side telemetry; no ads; no self-update or dependency download at runtime.
- [ ] No access outside the vault; no network use (or disclose).
- [ ] Not a fork; comply with third-party licences (d3-force ISC, PixiJS MIT — attribute in README if required).
- [ ] No "Obsidian" trademark confusion.

## Code (lint `recommended`; E = error, W = warning)
- [ ] Sample code and names removed (`no-sample-code` E, `sample-names` E).
- [ ] No global `app`; use `this.app` (`no-restricted-globals` W).
- [ ] No `console.log`; only `warn`, `error`, `debug` (custom `no-console` E).
- [ ] No `eval`, implied eval, `new Function` (E).
- [ ] No `innerHTML`/`outerHTML`/`insertAdjacentHTML` (`no-unsanitized/*` E, sdl W); build DOM with `createEl`/`createDiv`.
- [ ] No inline styles (`no-static-styles-assignment` E); no `<style>`/`<link>` (`no-forbidden-elements` E); CSS classes + Obsidian CSS variables in `styles.css`.
- [ ] No view references kept on the plugin (`no-view-references-in-plugin` E); `instanceof` checks on `leaf.view`.
- [ ] No `detachLeavesOfType` in `onunload` (`detach-leaves` E).
- [ ] No API newer than minAppVersion unless guarded by literal `requireApiVersion('x.y.z')` (`no-unsupported-api` E). No deprecated APIs (`@typescript-eslint/no-deprecated` W).
- [ ] No `navigator` OS sniffing; use `Platform` (`platform` E). No regex lookbehind (`regex-lookbehind` E).
- [ ] No Node built-ins (`no-nodejs-modules` W); no `fetch` (use `requestUrl`); no `localStorage` (use `app.saveLocalStorage`).
- [ ] Popout-safe: `window.setTimeout` etc. (`prefer-window-timers` W), no `globalThis` (W), `.instanceOf()` for DOM nodes (W).
- [ ] No `TFile`/`TFolder` casts (W); no iterating all files to find one by path (W); `normalizePath()` on paths.
- [ ] Commands: no default hotkeys, no plugin id/name or the word "command" in ids/names (W); correct callback type.
- [ ] `eslint-disable` comments need a description, cannot disable `obsidianmd/*` and other protected rules.

## Settings and UI text
- [ ] Declarative `getSettingDefinitions()` only; no `display()` (`no-deprecated-display` W); refresh with `update()`.
- [ ] Sentence case everywhere (`ui/sentence-case` W); no top-level heading; headings only with several sections; no word "settings" in headings; `setHeading()` not `<h1>`.

## Resources and performance
- [ ] Everything registered via `register*` helpers or a child `Component`; worker terminated, Wasm memory released, PixiJS app destroyed, blob URLs revoked on close/unload.
- [ ] `onload` cheap; heavy work after `onLayoutReady` and only when the view is visible; view constructor cheap (deferred views).
- [ ] Vault/metadata events debounced; vault `create` handlers registered after layout ready.
- [ ] Tested on desktop, iOS and Android (or "untested" recorded in TEST-LOG).
