# ADR 0015: Data-only packs with a safe formula language
- Status: accepted (user request 2026-10-16); format and checker built, shape forces and settings section pending
- Date: 2026-10-16

## Context
The user wants developers to add their own colours, shapes and layouts, including unusual shapes (a heart), with a documented import format, and importing 3D model files deferred.

## Options
1. User-supplied JavaScript add-ons. 2. Data-only packs with a formula language. 3. CSS only.

## Choice
Option 2. One JSON file (version 1) holds themes, shapes and layouts. Shapes come in five kinds: `spiral`, `volume` (solids plus named regions), `parametric` (curve or surface formulas, optional filled outline), `implicit` (a formula that is negative inside) and `points`. Formulas use a tiny language written for this (plugin/src/packs/expression.ts): no eval or Function, no assignment, loops or property access, limits of 400 characters, 250 parts and 40 levels. The checker (packs/pack.ts) reports every problem with its path, fills defaults, rejects out-of-range numbers, compiles every formula at check time so mistakes show before use, resolves layout references, and caps the size (256 KB, 64 solids, 5000 points). Every shape compiles (plugin/src/packs/shapes.ts) to one thing: a seeded, repeatable cloud of target points (default 4000), with a region number per point for volumes. This replaced the earlier idea of also using a distance grid, so the Rust engine needs only one force (pull towards the nearest target point). Solids and implicit formulas are filled by rejection sampling; filled outlines get a pillow depth from the distance to the outline.

## Consequences
Packs cannot do anything a documented option does not allow, which keeps them safe to share and keeps the community-directory review simple. The implicit kind uses `value` (negative inside), not a comparison, because the language has no comparison operators. Docs: docs/pack-format.md, docs/packs/ (four example packs, all validated by the tests) and an editor schema. 3D model import is deferred; it would produce a `points` shape.
