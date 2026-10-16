# ADR 0017: Gentle drift (an alive graph), applied only when drawing
- Status: accepted (user request 2026-10-16)
- Date: 2026-10-16

## Context
A settled graph is perfectly still until it is touched, which feels lifeless. The user wanted a small random movement of the notes, with a clear warning that too much would "break" the graph, as a toggle below the bubbles in the plugin settings.

## Options
1. Keep the layout engine running with small random forces. 2. Move the real positions slowly in the main thread. 3. Add the wandering at draw time only.

## Choice
Option 3. The layout engine, the saved layout, the shapes, the filters and dragging never see it, so it cannot distort or break anything, it costs the worker nothing, and switching it off returns the exact picture. Each note has fixed random phases and rates (render/drift.ts, repeatable from the note's number) and follows two sine waves at unrelated rates, so it wanders along a smooth path of a few pixels (1 to 7, the "amount" slider) at a slow pace (the "speed" slider). The size is in screen pixels, so it looks the same at any zoom. Flat view: the offset is added to each note's screen position as it is projected (notes far off screen are skipped), so links, labels and electrons follow automatically. 3D view: the same formula runs in the vertex shaders of both the nodes and the links (the seeds come from one per-note buffer read through the link index buffer too), and the labels and electrons add the same offset on the CPU. The note under the pointer eases to a standstill (about 0.18 s, no pop) so it is easy to click; it is released the same way. Stops with the system's reduced-motion setting.

## Consequences
Clicking uses the real positions, so a note can sit up to about 7 px from where it is drawn (a few px at the default); the hovered note holds still, which keeps targeting honest. The 3D picking and the drag depth point do not include the drift. The formula exists twice (TypeScript and the shader); the tests cover the TypeScript one and the real-app check compares the two only by looking and by the absence of GL errors.
