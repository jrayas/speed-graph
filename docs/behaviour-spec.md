# Behaviour spec

What the built-in Graph view does, so we can match it. Clean-room: sources are the official help page and observable behaviour only, never Obsidian's code.

- Primary source: [Graph view help](https://help.obsidian.md/plugins/graph) (source `obsidianmd/obsidian-help`, `en/Plugins/Graph view.md`, last changed 2025-11-28). Read 2026-10-15.
- Labels: **DOC** = stated in the help page (VERIFIED). **OBS** = must be observed in the app (UNVERIFIED until recorded). Numbers, defaults and ranges are not documented anywhere → all OBS. Unclear items are in [open-questions.md](open-questions.md).

## Model
| Feature | Help doc says | Label | Notes for our build |
|---|---|---|---|
| Nodes | "Circles represent notes, or nodes" | DOC | Plus tags/attachments/unresolved notes when their filters are on |
| Links | "Lines represent internal links between two nodes" | DOC | From `resolvedLinks` (+ `unresolvedLinks` when "Existing files only" is off) |
| Node size by degree | "The more nodes that reference a given node, the bigger it gets" | DOC | Size formula and whether outgoing links count: OBS |
| Excluded files | Files matching "Excluded files" do not appear | DOC | No public API to read the setting (U9) |

## Interaction
| Feature | Help doc says | Label | Notes |
|---|---|---|---|
| Hover highlight | "Hover over each circle to highlight that note's connections" | DOC | Dimming of others, label reveal: OBS |
| Click to open | "Click a note in the graph to open that note" | DOC | Modifier-key behaviour (new tab) via `Keymap.isModEvent`: OBS |
| Context menu | "Right-click a note to open a context menu" | DOC | Use `Menu` + `file-menu` event |
| Zoom | Scroll wheel, or `+` / `-` keys | DOC | Zoom limits, zoom-to-cursor: OBS |
| Pan | Drag the background, or arrow keys; Shift speeds keyboard movement | DOC | |
| Drag node | Not described on the help page | OBS | Built-in lets you drag nodes and reheats the layout; pin-on-release behaviour: OBS |
| Settings panel | Cog icon, upper-right; **Restore default settings** button | DOC | Our own panel inside the view |

## Filters
| Setting | Help doc says | Label |
|---|---|---|
| Search files | Filter notes by a search term using Search syntax | DOC — we can only support a subset (U10) |
| Tags | Toggle showing tags in the graph | DOC — tags become nodes linked to notes (shape/colour OBS) |
| Attachments | Toggle showing attachments | DOC — definition of "attachment" OBS (U8) |
| Existing files only | Toggle showing only notes that exist (hides links to non-existent notes) | DOC |
| Orphans | Toggle showing notes without any links | DOC |

## Groups
| Setting | Help doc says | Label |
|---|---|---|
| New group | Search term + colour picked from the coloured circle | DOC |
| Priority when a note matches several groups | not stated | OBS (assume first matching group wins) |

## Display
| Setting | Help doc says | Label |
|---|---|---|
| Arrows | Show the direction of each link | DOC |
| Text fade threshold | Controls the transparency of note names | DOC — relation to zoom level: OBS (labels fade as you zoom out) |
| Node size | Size of the circle | DOC — range/default OBS |
| Link thickness | Line width | DOC — range/default OBS |
| Animate | Starts a time-lapse: notes and attachments appear in order of **creation time** | DOC — uses `TFile.stat.ctime`; speed OBS |

## Forces
| Setting | Help doc says | Label | d3-force mapping (our interpretation) |
|---|---|---|---|
| Center force | How compact the graph is; higher = more circular | DOC | Not d3 `forceCenter` (that only translates the mean); a pull towards the centre like `forceX/forceY` strength — OBS |
| Repel force | How much a node pushes others away | DOC | `forceManyBody` with negative strength |
| Link force | Pull on each link; "rubber band" tightness | DOC | `forceLink` strength |
| Link distance | Length of the lines | DOC | `forceLink` distance |

## Local graph
| Feature | Help doc says | Label |
|---|---|---|
| Open | **Open local graph** command; shows notes connected to the active note | DOC |
| Settings | All global settings are available | DOC |
| Depth | Slider at the top of the local Filters panel; each level adds notes linked to the previous level | DOC — max depth OBS |
| Incoming/outgoing/neighbour link toggles | not on the help page | OBS — see open questions |
| Follows active note | not on the help page | OBS |

## d3-force reference model (source: [d3-force docs](https://d3js.org/d3-force), d3-force 3.0.0, ISC)
VERIFIED from the official docs:
- **Integrator**: velocity Verlet, Δt = 1, mass = 1. Each tick: `alpha += (alphaTarget − alpha) × alphaDecay`; apply each force with alpha; `v *= (1 − velocityDecay)`; `x += v`; fixed nodes (`fx`/`fy`) reset with v = 0.
- **Alpha cooling**: alpha starts 1, `alphaMin` 0.001, `alphaDecay` ≈ 0.0228 = 1 − 0.001^(1/300) → ~300 ticks; `alphaTarget` 0 (raise it to "reheat" while dragging).
- **Velocity decay**: 0.4 (friction).
- **Center** (`forceCenter`): translates all nodes so the mean is at (x, y); changes positions not velocities; strength default 1.
- **Many-body** (`forceManyBody`): strength −30 default (negative = repel); Barnes–Hut quadtree, `theta` 0.9; `distanceMin` 1; `distanceMax` ∞; coincident nodes get a random direction (jiggle).
- **Link** (`forceLink`): spring towards distance (default 30); strength default `1 / min(degree(source), degree(target))`; `iterations` 1; "peeks ahead" at x + vx.
- **Initial positions**: phyllotaxis arrangement when x/y are NaN (deterministic); random source is a fixed-seed LCG.
- Docs recommend computing large static layouts in a web worker.

### Where the Rust port may deviate (to record in layout-algorithm.md)
1. Determinism: same seeded LCG + phyllotaxis to keep layouts reproducible across runs and platforms; float maths may still differ slightly between Wasm and JS (f64 everywhere to stay close).
2. Data layout: structure-of-arrays (`Float64Array`/`Float32Array` positions, velocities) instead of node objects.
3. Barnes–Hut: flat, reusable quadtree arena rebuilt each tick instead of a pointer tree; same `theta` criterion.
4. Centre force: implement both d3 `forceCenter` (translation) and a positional pull (forceX/Y-like) because the built-in "Center force" changes compactness — choice pending observation.
5. Link force: random jiggle for coincident linked nodes must use the seeded generator.
6. Performance knobs that d3 lacks: tick budget per frame, early stop when energy is low, optional `distanceMax`, and f32 output arrays for the renderer.
7. Incremental updates: keep positions of existing nodes when the graph changes and reheat with a lower alpha instead of restarting from 1.


## Phase 5 features: what we implement, and how it differs from the built-in graph (2026-10-15)
Sources: Obsidian's help page for the graph view (filters, groups, local graph) was read in the Phase 0 research; the items below mark where we chose, because the help does not say. Nothing here describes Obsidian's code.
| Feature | Ours | Unknown or different |
|---|---|---|
| Search | Our own small language over path, note name and tags: words, "phrases", `path:`, `file:`, `tag:#x` (also matches nested tags), `-` to exclude, `OR` | The built-in graph uses Obsidian's search (which also searches note content and has more operators). No public API for it, so it is not reproduced |
| Tags | Filtered through `tag:` in the search box | The built-in graph can also show tags as nodes; we do not |
| Attachments | Off by default; shows every non-note file | Which file types count is unconfirmed |
| Orphans | On by default. Hidden orphans = nodes with no link to another visible node (after the other filters) | The built-in graph's exact definition is unknown |
| Existing files only | Off by default (unresolved links shown as nodes) | Matches the documented toggle name; default per the help page is unverified |
| Groups | Up to 20, first match wins, same query language, colour picker | Built-in groups use full Obsidian search queries |
| Local graph | Active note plus neighbours to depth 1 to 5, links followed in both directions, through visible nodes only; follows the last opened note | The built-in local graph also has toggles for backlinks and outgoing links; not done |
| Hover | Card with name, path, link count, tags, neighbours highlighted | Not in the help page; ours |
