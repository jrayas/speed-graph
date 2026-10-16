# ADR 0007: Filter in TypeScript to a visibility mask; lay out only the visible subgraph
- Status: accepted (Phase 5)
- Date: 2026-10-15
## Context
Filters (search, tags, attachments, orphans, unresolved), colour groups and the local graph all decide which nodes are shown. The layout should respond to what is shown (hiding half the notes should let the rest re-arrange), but the Rust engine should stay free of Obsidian concepts.
## Options
1. Pass filters into Rust. 2. Filter in TypeScript, send Rust only a compact subgraph. 3. Keep laying out everything and only hide nodes when drawing.
## Choice
Option 2. `computeVisible` (data/filter.ts) gives a 0/1 mask; `neighbourhood` narrows it for the local graph; `buildSubgraph` maps visible IDs to compact 0..n-1 indices and drops edges with a hidden end; positions are copied back with `scatterPositions`. Hidden nodes keep their last position, so a node that comes back starts where it was; nodes never laid out start on a spiral. Colour-only changes redraw without touching the layout. The layout restarts only if the visible set changed, warm-started (alpha 0.3 if most nodes had positions, else 1).
## Consequences
Rust is unchanged apart from gravity. Every filter pass is O(nodes + edges) in TypeScript and is debounced (200 ms). Dragging needs the compact index of the node (binary search over the sorted ID list). Option 3 was rejected because hidden nodes would still repel visible ones.
