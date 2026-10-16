# ADR 0006: Canvas 2D renderer first, behind a small interface
- Status: accepted (Phase 4)
- Date: 2026-10-15
## Context
The research proposed PixiJS 8.22.0 (WebGL). PixiJS code contains `new Function`, it adds roughly 400 KB, and the community directory scan of bundled code is undocumented.
## Options
1. PixiJS now. 2. Canvas 2D now, WebGL later only if needed.
## Choice
Option 2 (user approved). Each style is drawn as one batched path, off-screen nodes and links are skipped with outcodes, and tiny nodes are drawn as squares.
## Consequences
No new dependency; main.js is 79.6 KB. Measured draw cost (Chrome, hidden tab, 2x DPR, 1200x760): 1k under 1 ms, 10k about 6 ms, 25k about 10 to 13 ms. 25k is borderline for 60 fps, so Phase 6 culling and clustering matter. A WebGL renderer remains possible behind the same data interface.
