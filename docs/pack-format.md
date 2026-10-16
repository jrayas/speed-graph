# Speed Graph pack format (version 1)

A pack is one JSON file that can hold **themes** (colours and style), **shapes** (a form the graph is pulled into) and **layouts** (a named bundle of forces that picks a shape and a theme). A pack contains **data only, never code**: it cannot read your notes, touch the network or run anything. Every pack is checked on import and every problem is reported with its path.

Example packs: [docs/packs/](packs/) (a heart, a spiral galaxy, a stylised brain, a trefoil knot, a spider and a spider web, a honeycomb, a solar system whose planets are your most-connected notes, and an arc reactor). `bench/generate-shape-packs.mjs` draws the flat ones as data, so you can see how. Editor hints: [packs/fgpack.schema.json](packs/fgpack.schema.json) (the plugin's own checker is the authority). Pack files are plain text under the same licence as this repository (0BSD) unless the pack says otherwise.

## Top level
```json
{
  "format": "speed-graph-pack", "version": 1,
  "id": "my-pack", "name": "My pack", "author": "You", "license": "CC0-1.0",
  "description": "Optional, up to 500 characters.",
  "params": [], "themes": [], "shapes": [], "layouts": []
}
```
`format`, `version` and `id` are required. At least one theme, shape or layout is required. Ids are 1 to 48 lower-case letters, digits, `-` or `_`, and unique within their kind. Unknown fields are ignored with a warning.

## Coordinates
Shapes use a normalised box: x is left-right, y is up, z is depth, and the shape sits around the origin, roughly within -1.5 to 1.5. The plugin scales it to the size of your graph. Every coordinate must be within -4 and 4. A 2D layout uses x and y only.

## Parameters (sliders for your formulas)
```json
"params": [ { "id": "scale", "name": "Size", "default": 1, "min": 0.6, "max": 1.4, "step": 0.05 } ]
```
Up to 16. Inside any formula, `scale` is the current value. The settings page will show a slider for each.

## Themes
```json
{ "id": "rose", "name": "Rose", "base": "#12060a",
  "nodeColours": ["#e8a0b4", "#f0b3c4", "#f7c6d3", "#ff9db5", "#ff7a9c", "#ff4f7b"],
  "link": { "colour": "#ff9db5", "alpha": 0.2, "curved": true, "pulses": true },
  "accent": "#ffe3ea", "label": "#ffeef2",
  "glow": true, "starfield": false, "animated": true,
  "backdrop": { "colours": ["#5a1f35", "#3a1030"], "seed": 14 } }
```
`nodeColours` (2 to 8, `#rrggbb`) go from the least to the most connected notes. `base` is the fill behind the graph (omit it to keep your Obsidian theme). `backdrop.colours` (up to 4) are soft clouds drawn behind the graph; `seed` makes them repeatable. `glow` adds a halo to nodes; `curved` and `pulses` change how links look; `animated` allows twinkling and moving pulses.

## Shapes
Every shape has an `id`, a `name` and a `kind`.

### `spiral`: a galaxy from a few numbers
`arms` (1 to 8, whole), `twist` (0 to 8), `bulge` (0 to 1), `thickness` (0 to 1).

### `volume`: solids smoothly joined
```json
{ "id": "blob", "kind": "volume", "smooth": 0.1,
  "solids": [ { "type": "sphere", "at": [0, 0, 0], "radius": 0.5 } ] }
```
Solids: `sphere` (`at`, `radius`), `ellipsoid` (`at`, `size` [a, b, c]), `capsule` (`from`, `to`, `radius`), `box` (`at`, `size` [half-widths], `round` 0 to 1). Up to 64 solids per shape. `smooth` (0 to 0.5) rounds the joins.

**Regions** let notes live in named parts of the shape:
```json
"regions": [ { "name": "Frontal lobe", "match": "tag:#work", "solids": [ ... ] } ]
```
`match` is a search query in the same language as colour groups (`tag:#x`, `path:y`, `file:z`, `-`, `OR`). Notes that match no region spread across the whole shape. Up to 20 regions; the 64-solid limit covers the shape and all its regions together.

### `parametric`: a formula for a curve or a surface
A curve uses `t`; a surface uses `u` and `v`. `x`, `y`, `z` are formulas (`z` defaults to `0`).
```json
{ "id": "trefoil", "kind": "parametric", "t": [0, 6.2832],
  "x": "(sin(t) + 2*sin(2*t))/3", "y": "(cos(t) - 2*cos(2*t))/3", "z": "-sin(3*t)/3",
  "thickness": 0.06, "samples": 3000 }
```
`thickness` (0 to 1) spreads notes around the line; `samples` (50 to 20000) is how many target points are made. Add `"fill": { "depth": 0.5, "falloff": 0.45 }` to a **closed curve** to fill its inside with a pillow-shaped thickness (leave `z` out): the filled heart in `packs/heart.fgpack.json` is made this way.

### `implicit`: a formula for a solid
```json
{ "id": "heart-solid", "kind": "implicit",
  "value": "(x^2 + 2.25*z^2 + y^2 - 1)^3 - x^2*y^3 - 0.1125*z^2*y^3", "bounds": 1.6, "resolution": 48 }
```
`value` is a formula of `x`, `y`, `z` that is **negative inside the shape and positive outside**. `bounds` (0.5 to 4) is the half-size of the box that is searched; `resolution` (16 to 64) is the grid size. Very thin features need a high resolution or a `parametric` shape instead.

### `points`: any shape
`"points": [[x, y, z], ...]` (2 or 3 numbers each, up to 5000 in all). Draw anything: a spider, a honeycomb, a web. Add `regions` to send groups of notes to groups of points:
```json
{ "id": "solar", "kind": "points", "points": [],
  "regions": [
    { "name": "Sun",     "match": "top:1",       "points": [[0, 0]] },
    { "name": "Planets", "match": "top:9",       "points": [[0.2, 0], [0.32, 0.1]] },
    { "name": "Stars",   "match": "degree>=0",   "points": [[0.5, 0.5], [0.6, -0.2]] } ] }
```
A note goes to the **first** region whose `match` fits it, then settles on that region's points only; a note that fits none may go anywhere in the shape. Because the first fit wins, list narrow regions first and a catch-all such as `degree>=0` last. All regions together may hold 5000 points. `match` uses the search language: words, `path:`, `file:`, `tag:#x`, `-` for not, `OR`, and two terms for shapes: `degree>=5` (also `>`, `<=`, `<`, `=`) is the number of links, and `top:9` means one of the 9 most connected of the notes being placed (rank 1 is the most connected; equal counts keep their order).

## Layouts
```json
{ "id": "heart-3d", "name": "Heart (3D)", "dimensions": 3, "shape": "heart-pillow", "theme": "rose",
  "forces": { "centre": 0.5, "repel": 10, "link": 1, "linkDistance": 30, "gravity": 0.2, "shapeStrength": 0.7 } }
```
`dimensions` is 2 or 3. `shape` and `theme` are ids from the same pack (both optional). The forces match the settings page; `shapeStrength` (0 to 1) is how firmly notes are pulled into the shape instead of following their links.

## The formula language
Numbers (`1`, `0.5`, `1e-3`), the variables of that field, your parameters, the constants `pi`, `tau`, `e`, the operators `+ - * / ^` (`^` is a power; `-2^2` is -4; `2^3^2` is 512), and these functions: `sin cos tan asin acos atan atan2 sqrt abs exp log floor ceil round fract sign pow mod min max clamp mix smoothstep length`. There is nothing else: no assignment, no loops, no property access, no calls to the outside. A formula is at most 400 characters, 250 parts and 40 levels deep. Maths with no answer (such as `sqrt(-1)`) leaves that point out. Errors say where they are, for example `Unknown name 'foo' (at character 7)`.

## Limits
| Thing | Limit |
|---|---|
| File size | 256 KB |
| Themes, shapes, layouts | 8 of each |
| Parameters | 16 |
| Solids per shape (with regions) | 64 |
| Regions per shape | 20 |
| Points | 5000 |
| Curve samples | 20000 |
| Names | 80 characters |

## Status
The format, its checker and the example packs exist and are tested. Turning a shape into target points or a distance grid, the shape forces in the layout engine and the packs section of the settings page are the next steps.

## How the shape pull behaves (learned from testing)
- The pull acts on notes that are **outside** the shape's points. Notes already inside are free, so the shape works like the wall of a balloon: the repel force pushes notes outwards, the shape holds them in, and the inside fills up. For this to work the plugin sizes every shape a little smaller than the graph would naturally spread, and brings all shapes to the same reach first (a galaxy is wider than a heart).
- Heart shapes work well. Shapes made of thin parts (a galaxy's arms, a brain's lobes) need a higher `shapeStrength` and are not yet as clear. Work in progress.
- Selecting a layout also sets the flat or 3D view from its `dimensions`, uses its `forces` while it is active, and applies its `theme`. The user can switch the theme off (setting "Use the shape's own colours"); the shape and forces stay, only the colours go back to the user's own look, so a theme should never be needed to understand a shape.
