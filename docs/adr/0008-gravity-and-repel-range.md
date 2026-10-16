# ADR 0008: Gravity instead of only d3's centre shift (repel range tried and dropped)
- Status: accepted, revised 2026-10-15 (first choice was wrong)
- Date: 2026-10-15

## Context
With only d3's centre force (which recentres the average position) the repel force pushes unlinked and weakly linked notes far out. On the 10k vault the median radius of unlinked notes was 6354 against 910 for the whole graph (about 7x): a huge ring that made the real graph look tiny.

## First choice (wrong)
Gravity 0.1 plus a repel range of 600 (d3's `distanceMax`). It looked best on the radius numbers (unlinked median 882 vs core 486) and on the 1k vault. But the radius numbers cannot show structure. On the 10k and 25k vaults the layout kept the starting phyllotaxis spiral as interlocking curved arms: nodes more than 600 apart never repelled each other, so they never mixed, and gravity only squeezed the spiral. It was found by looking at a real Obsidian screenshot of the 25k vault, then confirmed by rendering the layouts as pictures (bench/render-layout.mjs). 1k looked fine only because its start spiral (radius about 316) is smaller than 600.

## Options (25k vault, settled)
| Setting | Median r / p99 | Picture |
|---|---|---|
| gravity 0.1, range 600 | 624 / 1162 | spiral arcs everywhere (bad) |
| gravity 0.1, no range | 1148 / 2725 | smooth disc, faint rim of arcs |
| gravity 0.2, no range | 988 / 1928 | smooth disc, faint rim |
| gravity 0.3, no range | 881 / 1574 | smooth disc, thin rim |
| gravity 0.1, range 3000 | 1145 / 2418 | smooth |

## Choice
Gravity 0.2 (the "Center force" slider sets gravity = 0.4 x its value, default 0.5) and no repel range limit. The range parameter stays in the engine (tested, off by default) in case a smarter use appears, for example a range that scales with the start radius.

## Consequences
Matches d3's forceX/forceY. Whether the built-in graph does the same is unknown; we match its look, not its code. Lesson: judge layout quality by looking at it, not by one summary number. bench/render-layout.mjs draws a layout to PNG for that.
