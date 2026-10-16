# ADR 0009: Zoomed-out clustering as a screen-space grid, in TypeScript
- Status: accepted (Phase 6). **Deviates from the brief's architecture sketch**, which lists clustering in the Wasm module. Flagged for the user to veto.
- Date: 2026-10-15

## Context
Zoomed out on a big vault the graph is a cloud of thousands of dots. The goal is to show clusters instead, and to let them dissolve into nodes as you zoom in.

## Options
1. Graph communities (label propagation) computed in Rust in the worker, drawn as hulls or bubbles. 2. A fixed grid in screen space: a cell holding at least 8 nodes becomes one bubble (count, centroid, dominant colour group); sparse cells keep their nodes. 3. No clustering.

## Choice
Option 2, in TypeScript (`render/cluster.ts`), on the main thread.
- Why a grid: it needs no precomputation, works on any graph, follows pan and zoom exactly (a bubble splits when you zoom in because its cell holds fewer nodes), and the layout already places linked notes together, so density bubbles line up with real clusters.
- Why TypeScript, not Wasm: it must run synchronously on every pan or zoom step. A worker round trip per step would lag, and loading the Wasm module a second time on the main thread is not worth it for an O(nodes + links) pass. The layout, the heavy part, stays in the worker.
- Why not communities: a random synthetic vault has none, real ones need tuning, and users may expect folders or tags, which is a product question.

## Consequences
Bubbles are density, not semantic communities. Links between two bubbles merge into one segment with a weight (thicker lines); links inside a bubble vanish. Hover and click only target nodes that are not inside a bubble (`getPickable`); clicking a bubble zooms in 2.5x. A setting turns the feature off. Measured costs are in tracking/BENCHMARKS.md.
