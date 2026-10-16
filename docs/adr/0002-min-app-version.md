# ADR 0002: Minimum Obsidian version (minAppVersion)
- Status: proposed (awaiting user approval with VERSION-LOCK.md)
- Date: 2026-10-15

## Context
- Current stable: 1.14.4 desktop and Android, 1.14.5 iOS App Store (VERIFIED).
- 1.13.0 added declarative settings with a native slider; `display()` is deprecated from 1.13.0. First public 1.13 build: 1.13.4 (2026-07-30) (VERIFIED, GitHub releases).
- Submission requirements: set minAppVersion to the real minimum; if unsure, latest stable.
- Lint `no-unsupported-api` errors on any API newer than minAppVersion unless guarded by `requireApiVersion`.
- The plugin needs: `ItemView`, `registerView`, `MetadataCache` links and events, `onLayoutReady`, deferred-view APIs (1.7.2), declarative settings (1.13.0), slider `displayFormat` (1.13.1). Nothing from 1.14.

## Options
1. **1.13.4** — first public build with declarative settings.
2. **1.14.4** — latest stable; simplest rule; drops 1.13.x users for no API gain.
3. **1.7.2 (or lower) with dual settings** (`display()` + `getSettingDefinitions()`) — widest reach, two settings implementations to keep in sync, more test targets, no benefit for a brand-new plugin with no users yet.

## Choice
Option 1: `minAppVersion: "1.13.4"`. Declarative settings only. Any API with `@since` above 1.13.4 must be wrapped in a literal `requireApiVersion('x.y.z')` guard plus a feature check.

## Consequences
- One settings code path; lint `require-display` not triggered.
- Users on ≤1.12.x cannot install; acceptable for a new plugin.
- Test matrix: 1.13.4 (minimum) and 1.14.4 (current) on desktop; current on iOS and Android.
- Revisit if a later API (e.g. `SettingDefinitionItem#id`) becomes essential, or at each research re-run.
