# ADR 0016: Moving electrons on links, and the settings gear in the pane header
- Status: accepted (user request 2026-10-16)
- Date: 2026-10-16

## Context
The user wanted notes to read like atoms with electrons travelling along the links (better than the brain skin's pulses), as a toggle under "Zoomed-out bubbles" in the plugin settings, and the graph's settings gear moved from inside the canvas to the pane header next to the "..." menu.

## Choice
**Electrons.** Off by default; independent of the skin. A fixed share of the links (never more than 2,500; the "amount" slider sets the share) carry one bright dot with a three-dot fading tail, moving from each link's source note to its target at a constant on-screen speed (pixels per second, so long and short links look alike). The links that carry one are chosen by a steady stride, and each link has its own start offset, so the picture is stable. Links shorter than 16 px on screen are skipped. In the flat view they are drawn on top of the nodes (underneath, the node discs hid most of them in dense graphs), with a white-hot core on dark backgrounds and a solid accent dot on light ones (a white core on a light halo looked like the hollow rings used for unresolved links). In 3D they are placed along the link in 3D, projected, and drawn on the overlay canvas with size and brightness falling off with distance. They follow curved links when a skin curves them, fade on links away from a hovered note, and stop with the system's reduced-motion setting. Logic is in render/electrons.ts (pure, tested).

**Gear.** Added with the view's own `addAction`, so it sits in the pane header, immediately LEFT of the "..." (more options) menu. Reason for left: Obsidian places a view's own actions there (like Reading view or Bookmark), so the gear matches how every other pane behaves, and the "..." menu stays as the always-last, far-right control in the same place in every pane. The in-canvas button is gone; the panel opens below the header and the gear shows as active while it is open.

## Consequences
Electrons cost a little per frame (measured: see tracking/TEST-LOG.md). The panel's open state is remembered while the view is open.
