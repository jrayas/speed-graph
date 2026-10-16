# Layout algorithm

Reference: the d3-force documentation (centre, many-body, link forces, velocity decay, alpha cooling). Source: https://d3js.org/d3-force (open source, ISC). We do not describe or assume Obsidian's own layout code; matching its look is done by tuning parameters against the observable graph (Phase 4).

## One tick (core/src/layout/mod.rs)
1. `alpha += (alphaTarget - alpha) * alphaDecay`. Defaults as d3: alpha 1, alphaMin 0.001, alphaDecay = 1 - alphaMin^(1/300), alphaTarget 0. About 300 ticks to cool.
2. Link force: per edge, `d = (target.pos + target.v) - (source.pos + source.v)`, `l = |d|`, `l = (l - distance) / l * alpha * strength`, then `d *= l`. Target velocity -= d * bias, source velocity += d * (1 - bias). `bias = deg(source) / (deg(source) + deg(target))`; default strength is `1 / min(deg(source), deg(target))`, multiplied by our `link_strength` parameter. One iteration.
3. Many-body force (Barnes-Hut, core/src/barnes_hut): for each node, walk the quadtree. A cell is treated as one body if `size^2 / theta^2 < distance^2`. Velocity += `d * strength * alpha / distance^2` (cells use their mass and centre of mass). `distanceMin = 1`, no distanceMax. Default strength -30, theta 0.9.
4. Centre force: shift all positions so the mean sits at the centre (0, 0), scaled by `center_strength`.
5. Velocity decay: `v *= 1 - velocityDecay` (default 0.4), then `pos += v`.

Order is link, many-body, centre. Ties (zero distance) are broken with d3's jiggle, `(random - 0.5) * 1e-6`, from our seeded generator.

## Additions in Phase 5 (see ADR 0008)
- Gravity: after the many-body force, `v -= position * gravity * alpha` for every node (d3's forceX/forceY towards the origin). Default 0.2, set by the "Center force" slider (gravity = 0.4 x slider).
- Repel range: d3's `distanceMax`, implemented and tested but OFF (infinite). A range of 600 left the start spiral visible in 10k and 25k graphs (ADR 0008).
- The centre shift stays at strength 1.

## Deviations from d3-force
| Deviation | Why |
|---|---|
| Start positions are d3's phyllotaxis spiral, rotated by a seeded angle and nudged by a seeded jitter of up to 1 unit | The same seed must give the same layout (tested); different seeds give different ones |
| Own splitmix64 random generator instead of d3's LCG | No external crate; deterministic across platforms |
| Quadtree is rebuilt each tick as flat arrays; points at the same position share a leaf chain; depth limit 48 | Speed and no per-node allocation. d3 uses linked quad objects. Results match brute force in exact mode (tested) |
| `f64` inside, `f32` out | Precision inside; half the bytes for the renderer |
| Fixed nodes (d3 `fx`/`fy`) are implemented as `fix_node`/`release_node` | Dragging; the pinned node's velocity is zeroed each tick |
| Only distance, strength, centre, repel exposed; no per-node strength | Matches the four controls in the brief |
| Free (deleted) IDs are laid out as isolated nodes | Phase 4 should hide them or compact IDs before layout |
| Simulation stops itself once alpha < alphaMin | d3 stops via its timer; the caller drives ticks here |

## Mapping to Obsidian's sliders
Unknown. How Obsidian's "centre / repel / link force / link distance" sliders map to numbers is not documented, so this is an open question (docs/open-questions.md) to settle by observation in Phase 4. The engine exposes the raw d3 parameters.

## Boundary
`Layout::new(node_count, edges: &[u32], seed)`, `set_params(...)`, `reheat(alpha)`, `tick(n)`, `positions() -> Vec<f32>`. Typed arrays only.


## 3D layout (Layout3, ADR 0013)
The same forces and parameters as 2D, with a z axis: link force and gravity in 3D, the centre shift in 3D, and an octree for the many-body force (8 children, same opening-angle test, same `distanceMin`/`distanceMax` rules). Start positions: direction from the R2 sequence (two irrational steps), radius 10 x cbrt(0.5 + i), a seeded offset into the sequence and a jitter of up to 1 unit. Measured (Wasm in Node, 300 ticks to cool): 1k 1.3 ms per tick, 10k 24 ms, 25k 69 ms (about 1.6 times the 2D cost). The settled spread is even across the three axes (133/132/131 at 1k), and the xy and xz projections of the 10k layout show no spiral arms.
