# Deprecations and API changes

Method: exported-symbol diff of the `obsidian` npm typings 1.11.4 → 1.12.3 → 1.13.1 → 1.14.4, plus `@since`/`@deprecated` tags and the app changelog. VERIFIED (npm tarballs, 2026-10-15). The npm CHANGELOG.md stops at 1.7.2, so the typings are the authoritative record.

## Last three minors

### 1.14 (public 2026-10-05)
| Change | Kind | Impact on us |
|---|---|---|
| `Editor.getDoc()` | deprecated ("Use the editor directly") | none |
| `Menu.close()` | deprecated ("Previously existed to satisfy ClosableComponent") | use `menu.hide()` if we close context menus |
| `TExternalFile extends TFile` + `getRealPath()` (1.14.4) | added — "a file outside the Vault" usable with the vault API | could appear as a `TFile`; check whether it shows in `getFiles()`/links (unknown) |
| `BasesConfigFileView.groupOrder` (1.14.3) | added | none |
| `SettingDefinitionItem#id` | announced in changelog, **missing from typings** | do not use |
| Installer Electron 43.7.5 | platform | Chromium 150 for fresh installs only |

### 1.13 (first public 1.13.4, 2026-07-30)
| Change | Kind | Impact |
|---|---|---|
| Declarative settings (`getSettingDefinitions`, `SettingDefinition*`, `Setting*Control`, `SettingPage`, `SettingTab.update/refreshDomState/getControlValue/setControlValue`, `Plugin.settings`) | added (124 symbols `@since 1.13.0`) | our settings approach |
| `SettingTab.display()` | deprecated since 1.13.0; skipped when definitions are non-empty | do not implement |
| `ButtonComponent.setWarning()` | deprecated → `setDestructive()` / `ConfirmationModal` | use new API |
| `SliderComponent.setDynamicTooltip()` | deprecated (value always shown inline); `setDisplayFormat()` added | in the view panel, use `setDisplayFormat` (1.13.0) |
| `SliderComponent.showTooltip` | **removed** | do not use |
| `CloseableComponent` | **removed** | none |
| `ConfirmationModal`, `ConfirmationButton`, `DisplayValueComponent` (1.13.1), `Setting.setErrorMessage`, `Setting.addDisplayValue` (1.13.1), `SettingSecretControl` (1.13.2) | added | optional |

### 1.12 (public 1.12.4, 2026-02-27)
| Change | Kind | Impact |
|---|---|---|
| Bases view option types renamed: `BaseOption`, `DropdownOption`, `SliderOption`, `ToggleOption`, `TextOption`, `ViewOption` … → `BasesOption`, `BasesDropdownOption`, … | removed/renamed (breaking for Bases views) | none (we build an `ItemView`, not a Bases view) |
| `registerCliHandler`, `CliData`, `CliFlags` (1.12.2) | added | none |
| `appendBinary` on Vault/adapters (1.12.3) | added | none |

## Older deprecations still relevant to a view plugin
- `Workspace.activeLeaf` — discouraged; use `getActiveViewOfType`.
- `Workspace.splitActiveLeaf()`, `getUnpinnedLeaf()` → `getLeaf(...)`.
- Old `Workspace.duplicateLeaf`/`setActiveLeaf` signatures.
- `MarkdownRenderer.renderMarkdown` → `MarkdownRenderer.render`.
- `Notice.noticeEl` → `messageEl`.
- `iterateCacheRefs` deprecated.
- `prepareQuery`/`fuzzySearch` removed in 1.7.2 → `prepareFuzzySearch`.
- 1.7.2: views are deferred by default (`DeferredView`).
- 1.5.9+: `SliderComponent` updates on release unless `setInstant(true)`.
