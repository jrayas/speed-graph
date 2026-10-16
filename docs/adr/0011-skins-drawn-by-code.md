# ADR 0011: Skins are looks drawn by code, as data plus painters, not images or user scripts
- Status: accepted (user request 2026-10-15)
- Date: 2026-10-15

## Context
The user wants optional looks such as "galaxy" and "human brain", drawn by code and not from image files, off by default. The default look (the current graph) must not change.

## Options
1. Image or CSS-sprite skins. 2. Skins as code modules built into the plugin (colours plus procedural drawing). 3. User-supplied JavaScript add-ons.

## Choice
Option 2. A skin (render/skins.ts) is data: node colour buckets by how connected a node is, link colour and alpha, whether nodes glow, links curve or carry pulses, a base colour, a backdrop palette and a seed. The renderer paints from it: a procedural nebula (soft blobs drawn once with a seeded random generator) and star field, additive halo sprites for bigger nodes, curved links, and a fixed few hundred pulses travelling along links. Nothing is loaded from disk or the network. The default skin is the absence of a skin (null), so the default drawing path is the old one.
- User-added skins as JSON data (colours only, no code) remain possible later. User-supplied JavaScript is not planned: it widens the attack surface and the review policies are wary of it.

## Consequences
Skins cost more per draw (about 1.1 ms against 0.4 ms at 1k nodes) and animated skins redraw about 30 times a second: the loop runs only while a skin is animated, effects are on, the view is visible, and the system does not ask for reduced motion. Skin node size is capped at 15 px on screen. Colour groups still override skin colours. Tests cover the pure helpers (seeded random numbers, star field, tie-aware degree buckets, curve geometry, pulse selection); the look itself is judged from screenshots (docs/screenshot-skin-*.png).
