# ADR 0021: A switch for the shape's own colours, and the arc reactor
- Status: accepted (user request 2026-10-16)
- Date: 2026-10-16

## Context
Every shape layout brought its theme (colours, glow, background) automatically. Some users prefer shapes without colour. The user also asked for a flat arc reactor.

## Choice
A setting "Use the shape's own colours" (on by default, so nothing changes for existing users), shown in the Shapes and packs group while a shape is active. Off: the layout's theme is not applied, and the user's normal look (or the skin they chose) stays; the shape, forces, strength and guide are unaffected. The arc reactor is a `points` shape with three regions: the most-connected note is the core (exclusive, one spot), the next ten are exclusive spots at the centres of ten coil blocks, and every other note lines the rings (a double outer ring, the coil block outlines, a double inner ring, a core circle and a triangle). It uses the guide, and a cyan theme.

## Consequences
The dotted guide is drawn in the accent colour, so with colours off it uses the user's accent. Packs should not depend on their theme to be readable. Layouts with no theme are unaffected by the switch.
