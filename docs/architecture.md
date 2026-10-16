# Architecture

```
Obsidian (main thread)
 ├─ main.ts            plugin: loads settings, registers the view, commands, ribbon icon
 ├─ data/              VaultGraph (only file using the vault API) -> GraphModel (numbers only)
 │                     -> edge array (Uint32Array), degrees, adjacency (CSR)
 ├─ view/              GraphView (ItemView): pointer/wheel input, controls panel, status line
 │   └─ LayoutDriver   asks the worker for tick batches, one outstanding request at a time
 ├─ render/            CanvasRenderer (Canvas 2D), view transform, hit-testing
 └─ worker/GraphWorker owns the Web Worker (source and .wasm embedded in main.js)
      └─ Web Worker -> Wasm (Rust): Layout = d3-force model + Barnes-Hut quadtree
```

## 3D (optional, off by default)
`view3d` switches `GraphView` to dimension 3: the worker runs `Layout3` (octree), positions have three numbers, `Renderer3D` (WebGL2) draws, and an `OrbitCamera` handles turning, sliding and zooming. Skins, filters, groups, the local graph, hover and the cache work in both dimensions. See ADR 0013.

## Data flow
1. `VaultGraph` builds the model after `onLayoutReady`, then updates it from `resolve`, `create`, `delete`, `rename`.
2. `GraphView` debounces model changes (400 ms), then sends edges to the worker. The layout is warm-started from the current positions and cools from alpha 0.3.
3. `LayoutDriver` requests tick batches. Each reply carries a transferred `Float32Array` of positions; the view hands it to the renderer and requests a draw (requestAnimationFrame, only when something changed).
4. Dragging a node pins it in the worker (`fix_node`) and reheats; releasing unpins it.
5. Slider changes: layout sliders call `set_params` and reheat; display sliders only redraw.

## Rules kept
Rust never calls the Obsidian API. Only typed arrays and numbers cross the boundary. The main thread draws and handles input; it never runs the layout.
