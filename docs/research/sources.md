# Sources

Checked 2026-10-15. "Read via" says how the content was obtained. docs.obsidian.md and help.obsidian.md are single-page apps that return HTTP 200 for any path, so their content was read from the official GitHub source repositories (same text, published by Obsidian).

## Official (VERIFIED)

### Versions and releases
| Source | URL | Read via | Notes |
|---|---|---|---|
| Obsidian changelog | https://obsidian.md/changelog/ | WebFetch | 1.14 Desktop/Mobile public 2026-10-05 |
| 1.14 Desktop notes | https://obsidian.md/changelog/2026-10-05-desktop-v1.14.4/ | WebFetch | Electron 43.7.5; `SettingDefinitionItem#id` announced |
| 1.14 Mobile notes | https://obsidian.md/changelog/2026-10-05-mobile-v1.14.4/ | WebFetch | `--font-preferred-size` |
| obsidian-releases GitHub releases | https://github.com/obsidianmd/obsidian-releases/releases | GitHub API | stable flags, first public 1.13 = 1.13.4 |
| desktop-releases.json | https://github.com/obsidianmd/obsidian-releases/blob/master/desktop-releases.json | raw | latestVersion 1.14.4, minimumVersion 1.1.9 |
| Apple App Store lookup | https://itunes.apple.com/lookup?bundleId=md.obsidian | curl | iOS 1.14.5, min iOS 15.6 |
| Google Play | https://play.google.com/store/apps/details?id=md.obsidian | curl | 1.14.4; minimum Android not extractable |
| Electron releases | https://releases.electronjs.org/releases.json | curl | 43.7.5 → Chrome 150.0.7871.250 |

### API and templates
| Source | URL | Read via |
|---|---|---|
| obsidian npm package 1.14.4 (d.ts, CHANGELOG) | https://www.npmjs.com/package/obsidian | registry tarball |
| obsidian npm 1.11.4 / 1.12.3 / 1.13.1 (for diffs) | https://registry.npmjs.org/obsidian | registry tarballs |
| obsidian-api repo | https://github.com/obsidianmd/obsidian-api | raw + GitHub API |
| Sample plugin | https://github.com/obsidianmd/obsidian-sample-plugin | raw (manifest, package.json, lockfile, esbuild config, eslint config, tsconfig, src, workflows, AGENTS.md) |
| eslint-plugin-obsidianmd 0.4.2 | https://github.com/obsidianmd/eslint-plugin, https://www.npmjs.com/package/eslint-plugin-obsidianmd | registry tarball (README, rule source) |
| obsidian-releases README | https://github.com/obsidianmd/obsidian-releases | raw |
| plugin-review.md (moved notice) | https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md | raw |

### Developer docs (source: https://github.com/obsidianmd/obsidian-developer-docs, `en/`, head `c56c7e770b` 2026-08-10)
| Page | Public URL |
|---|---|
| Developer policies | https://docs.obsidian.md/Developer+policies |
| Submission requirements for plugins | https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins |
| Submit your plugin | https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin |
| Community directory FAQ | https://docs.obsidian.md/Community+directory/Frequently+asked+questions |
| Manage your plugin or theme | https://docs.obsidian.md/Community+directory/Manage+your+plugin+or+theme |
| Plugin guidelines | https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines |
| Manifest | https://docs.obsidian.md/Reference/Manifest |
| Settings | https://docs.obsidian.md/Plugins/User+interface/Settings |
| Migrate to declarative settings | https://docs.obsidian.md/Plugins/Guides/Migrate+to+declarative+settings |
| Views | https://docs.obsidian.md/Plugins/User+interface/Views |
| Defer views | https://docs.obsidian.md/Plugins/Guides/Defer+views |
| Manage plugin lifecycle | https://docs.obsidian.md/Plugins/Guides/Manage+plugin+lifecycle |
| Optimize plugin load time | https://docs.obsidian.md/Plugins/Guides/Optimize+plugin+load+time |
| Mobile development | https://docs.obsidian.md/Plugins/Getting+started/Mobile+development |
| Anatomy, Events, Vault, Workspace, Build a plugin, Release with GitHub Actions, Support pop-out windows | https://docs.obsidian.md/Plugins/ |

### Help docs (source: https://github.com/obsidianmd/obsidian-help, `en/Plugins/Graph view.md`, last changed 2025-11-28)
| Page | Public URL |
|---|---|
| Graph view | https://help.obsidian.md/plugins/graph |

### Toolchain registries
| Source | URL |
|---|---|
| npm registry | https://registry.npmjs.org/ (obsidian, typescript, esbuild, eslint, @eslint/js, typescript-eslint, eslint-plugin-obsidianmd, pixi.js, wasm-pack, d3-force) |
| crates.io | https://crates.io/api/v1/crates/ (wasm-bindgen, wasm-bindgen-cli, wasm-pack, js-sys, web-sys) |
| Rust stable channel | https://static.rust-lang.org/dist/channel-rust-stable.toml |
| rustc wasm32 target | https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html |
| WebAssembly feature table | https://webassembly.org/features/ (data: https://github.com/WebAssembly/website/blob/main/features.json) |
| d3-force docs | https://d3js.org/d3-force (source: https://github.com/d3/d3/tree/main/docs/d3-force) |
| PixiJS 8.22.0 package | https://www.npmjs.com/package/pixi.js |

## Third party (SECONDARY)
| Source | URL | Used for |
|---|---|---|
| Forum: "Can plugins use Web Worker?" (2024) | https://forum.obsidian.md/t/can-plugins-use-web-worker/81040 | worker reports; inconclusive |
| Forum: Wasm failure on iOS (2022) | https://forum.obsidian.md/t/plugin-failure-promisereactionjob-native-code-web-assembly-related/43392 | Capacitor Wasm MIME issue (suggested, unconfirmed) |
| Typst Renderer plugin | https://github.com/fenjalien/obsidian-typst | inline blob-URL worker + embedded Wasm, no `isDesktopOnly` |
| Typst Mate plugin | https://github.com/azyarashi/obsidian-typst-mate | Rust Wasm + worker, `isDesktopOnly: false` |
| Graph Analysis plugin | https://github.com/luolanaatud/obsidian-graph-analysis | Rust Wasm, `isDesktopOnly: true` |
| obsidianstats webassembly tag | https://www.obsidianstats.com/tags/webassembly | discovery only |
| Capacitor environment setup | https://capacitorjs.com/docs/getting-started/environment-setup | no web-view facts found |

## Unreachable or missing
- https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml — 404 (removed; still linked from the sample plugin's AGENTS.md).
- https://capacitorjs.com/docs/main/reference/web-view — 404.
- Play Store "Requires Android" value — not present in the fetched HTML.
