# Compatibility matrix

Date: 2026-10-15. "Untested" means nobody has run it yet. Proposed minAppVersion 1.13.4.

## Platforms

| | Desktop (Windows, macOS, Linux) | iOS / iPadOS | Android |
|---|---|---|---|
| Current stable | 1.14.4 (VERIFIED) | 1.14.5 App Store / 1.14.4 changelog (VERIFIED, disagree) | 1.14.4 (VERIFIED) |
| Runtime | Electron; 43.7.5 / Chromium 150 on fresh installs; older installers still allowed (VERIFIED) | Capacitor (VERIFIED, d.ts); WebKit WKWebView (SECONDARY) | Capacitor (VERIFIED); system Chromium WebView (SECONDARY) |
| Minimum OS | per Electron | iOS 15.6 (VERIFIED, App Store) | unknown (Play page did not expose it) |
| Node / Electron APIs | available (we do not use them) | no | no |
| Web Worker (blob URL) | expected yes (SECONDARY) — untested | expected yes (SECONDARY, Typst plugins) — untested | expected yes (SECONDARY) — untested |
| WebAssembly (MVP + Rust default features) | yes (Chromium) — untested in Obsidian | needs Safari 15+ → iOS 15.6 OK (VERIFIED feature table) — untested | yes (Chromium WebView) — untested |
| Wasm SIMD | yes | only iOS 16.4+ → excluded from baseline | yes |
| Wasm threads / SharedArrayBuffer | needs cross-origin isolation — assume no (UNVERIFIED) | assume no | assume no |
| WebGL (PixiJS) | yes — untested | WebGL2 from iOS 15 (SECONDARY) — untested | yes — untested |
| ES target | es2021 | es2021 (ES2022 static blocks need 16.4) | es2021 |
| Regex lookbehind | yes | only 16.4+ → banned by lint | yes |
| Status bar item | yes | no | no |
| Debugging | DevTools | Safari Web Inspector (iOS 16.4+) | chrome://inspect |

## Obsidian API by version (APIs we plan to use)

| API | `@since` | ≤ 1.13.4? |
|---|---|---|
| `Plugin`, `ItemView`, `registerView`, `addCommand`, `addRibbonIcon`, `loadData`/`saveData` | 0.9.7 | yes |
| `MetadataCache.resolvedLinks`, `unresolvedLinks`, `on('changed'/'deleted'/'resolve'/'resolved')`, `getFileCache` | ≤0.9.21 / untagged | yes |
| `Workspace.onLayoutReady` | 0.11.0 | yes |
| `Platform` | 0.12.2 | yes |
| `requireApiVersion`, `apiVersion` | untagged (old) | yes |
| `Plugin.onUserEnable`, `WorkspaceLeaf.isDeferred`, `loadIfDeferred` | 1.7.2 | yes |
| `Vault.getFileByPath` / `getFolderByPath`, `View.scope` | 1.5.7 | yes |
| `PluginSettingTab.getSettingDefinitions`, `SettingSliderControl`, `SettingTab.update` | 1.13.0 | yes |
| `SettingSliderControl.displayFormat` | 1.13.1 | yes |
| `SliderComponent.setDisplayFormat` (view panel) | 1.13.0 | yes |
| `TExternalFile` | 1.14.4 | no — guard if ever needed |

## Toolchain compatibility (VERIFIED from registries)
| Pair | Status |
|---|---|
| typescript-eslint 8.71.2 ↔ TypeScript | `>=4.8.4 <6.1.0` → 5.9.3 OK, 7.0.2 not supported |
| eslint-plugin-obsidianmd 0.4.2 ↔ ESLint | `eslint >=9.19.0`, `@eslint/js ^9.30.1` → ESLint 9.39.4 |
| eslint-plugin-obsidianmd ↔ obsidian | exact peer 1.8.7, bundles 1.12.3; npm 10.9.9 dry-run with obsidian 1.14.4 resolved without error |
| wasm-pack 0.15.0 ↔ wasm-bindgen 0.2.129 | latest of each; CLI version must equal crate version (to verify in Phase 1) |
| Rust 1.99.0 ↔ iOS 15.6 | default wasm features within Safari 15 support |
