# ADR 0012: Plugin settings page with Obsidian's declarative settings
- Status: accepted (user request 2026-10-15)
- Date: 2026-10-15

## Context
Optional features (zoomed-out bubbles, skins, later 3D) need a settings page, off by default. VERSION-LOCK chose the declarative `getSettingDefinitions()` path (minAppVersion 1.13.4).

## Choice
`settings/settings-tab.ts` extends `PluginSettingTab` and returns groups: Features (zoomed-out bubbles), Appearance (skin dropdown, animate effects, shown only for a non-default skin), Layout cache (clear). `getControlValue` and `setControlValue` are overridden to use our own settings object, because the default reads `plugin.settings`, a name the base `Plugin` class already owns (api-notes.md). A change saves the settings and notifies open graph views, which rebuild their panel and look at once. The in-view panel keeps live controls (forces, filters, groups, display); both edit the same settings object.

## Verified in Obsidian 1.14.4
Settings open in their own window. The page rendered its three groups, the dropdown and toggles changed the saved settings, and the effects row appeared only for a non-default skin. Declarative pages are all-or-nothing (no `display()` fallback), so any control we cannot express declaratively needs a `render` row.
