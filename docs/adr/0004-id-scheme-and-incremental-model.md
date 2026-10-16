# ADR 0004: Reusable numeric IDs and an Obsidian-free graph model
- Status: accepted (Phase 2)
- Date: 2026-10-15
## Context
The worker and Rust code need numbers only. The model must update incrementally on file events.
## Options
1. Never reuse IDs (arrays grow forever, but IDs are stable). 2. Reuse freed IDs (dense arrays). 3. Rebuild IDs each time (breaks cached positions).
## Choice
Option 2, with rename keeping the ID. Freed IDs are only reused for new notes. The model has no Obsidian imports, so it is unit-tested in Node; only vault-reader.ts touches the API.
## Consequences
Cached layout positions (Phase 6) must be keyed by path, not ID, because IDs can change meaning after a delete. Per-node arrays use `capacity` and must ignore free slots.
