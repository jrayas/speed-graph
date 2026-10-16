# API notes

The Obsidian APIs this plugin plans to use, checked against the pinned `obsidian` 1.14.4 typings (see [research/VERSION-LOCK.md](research/VERSION-LOCK.md)). Proposed minAppVersion 1.13.4. All VERIFIED in the d.ts on 2026-10-15 unless marked. Rule: no API outside this list without updating it first.

## Lifecycle
| API | Since | Use |
|---|---|---|
| `Plugin.onload()` / `onunload()` | 0.9.7 | register only; no heavy work |
| `Plugin.onUserEnable()` | 1.7.2 | open the graph view on first enable |
| `Workspace.onLayoutReady(cb)` | 0.11.0 | start listening to vault events |
| `Component.registerEvent`, `registerDomEvent`, `registerInterval`, `register`, `addChild` | 0.9.7 | automatic cleanup |
| `Plugin.loadData()` / `saveData()` | 0.9.7 | settings and cached layout (size to be checked) |
| `Plugin.onExternalSettingsChange?()` | 1.5.7 | reload settings after sync |

## Views
| API | Since | Use |
|---|---|---|
| `ItemView` (`contentEl`, `addAction`) | 0.9.7 / 1.1.0 | graph view and local graph view |
| `View.getViewType`, `getDisplayText`, `getIcon`, `onOpen`, `onClose`, `onResize`, `scope` | 0.9.7 / 1.5.7 | |
| `Plugin.registerView(type, factory)` | 0.9.7 | never store the instance |
| `Workspace.getLeaf(...)`, `getRightLeaf`, `getLeavesOfType`, `revealLeaf` (Promise) | various | open/find views |
| `WorkspaceLeaf.setViewState`, `isDeferred`, `loadIfDeferred` | 1.7.2 for deferred | |
| `Workspace.on('active-leaf-change' / 'file-open' / 'layout-change' / 'css-change')` | old | local graph follows active note; theme colours |
| `Platform` | 0.12.2 | device-specific limits |

## Data
| API | Use |
|---|---|
| `MetadataCache.resolvedLinks`, `unresolvedLinks` | edge lists (source path → dest path → count) |
| `MetadataCache.on('resolved' / 'resolve' / 'changed' / 'deleted')` | incremental updates; `changed` not fired on rename |
| `MetadataCache.getFileCache(file)`, `getAllTags(cache)` | tags, frontmatter, `frontmatterLinks` |
| `Vault.getMarkdownFiles()`, `getFiles()`, `getFileByPath()` | node list |
| `Vault.on('create' / 'delete' / 'rename')` | register after layout ready |
| `TFile.stat.ctime` | "Animate" order |
| `prepareSimpleSearch`, `prepareFuzzySearch` | plain-text part of search filters only |

## UI
| API | Since | Use |
|---|---|---|
| `PluginSettingTab.getSettingDefinitions()` + `SettingSliderControl` etc. | 1.13.0 | settings tab (no `display()`) |
| `SettingTab.update()`, `refreshDomState()` | 1.13.0 | refresh |
| `Setting`, `SliderComponent.setDisplayFormat`, `ToggleComponent`, `ColorComponent`, `SearchComponent`, `ExtraButtonComponent` | old / 1.13.0 | the view's own control panel |
| `Menu`, `showAtMouseEvent`, `Workspace.on('file-menu')` / `trigger` | old | right-click menu |
| `Workspace.openLinkText`, `Keymap.isModEvent` | old | click to open |
| `Plugin.registerHoverLinkSource` + `hover-link` event | 0.9.7 | page preview (payload untyped — U11) |
| `Plugin.addCommand`, `addRibbonIcon` | 0.9.7 | open graph / local graph |
| `requireApiVersion(version)` | old | guard newer APIs (literal string) |

## Not available (VERIFIED absence)
- Built-in graph view internals or settings.
- Search-query engine, "Excluded files" setting.
- Any worker/Wasm helper — we use standard Web APIs (`Worker`, `Blob`, `URL.createObjectURL`, `WebAssembly.instantiate`).

## APIs used in Phase 4 (all present in obsidian.d.ts 1.14.4)
ItemView (getViewType, getDisplayText, getIcon, onOpen, onClose), Plugin.registerView, addRibbonIcon, addCommand, loadData/saveData, Workspace.getLeaf('tab'), getLeavesOfType, revealLeaf, on('css-change'), Vault.getFileByPath, WorkspaceLeaf.openFile/setViewState, Keymap.isModEvent, Setting (addSlider, addToggle, addButton, setHeading), setIcon, registerDomEvent (with { passive: false } for wheel).
Gotchas: `Plugin.settings` and `View.onResize` already exist on the base classes, so our own members must not reuse those names. `SliderComponent.setDynamicTooltip` is deprecated (the value is always shown).
