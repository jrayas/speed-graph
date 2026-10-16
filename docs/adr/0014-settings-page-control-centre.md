# ADR 0014: The settings page as the control centre, with neutral defaults
- Status: accepted (user request 2026-10-16: "most controlling, even brightness, to everything in the plugin settings page")
- Date: 2026-10-16

## Context
The user wants fine control over the look from the plugin's settings page: brightness, colours, glow, labels, forces and the 3D camera, with everything extra off by default and the current graph untouched until something is changed.

## Choice
- A `look` section in the settings (`render/appearance.ts`): brightness, saturation, node brightness, node opacity, link brightness, label brightness and size, backdrop brightness, glow strength, effects speed, custom node, link and background colours, 3D field of view and depth fade. Every default is neutral. Saved data is merged and clamped, so a bad file cannot break the view.
- Brightness maths: saturation first (0 = grey), then a plain multiplier, clamped. When both are neutral the renderers return the original colour string untouched, so the default drawing path is exactly the old one.
- Both renderers apply it: 2D tones colours at draw time with a cache and scales alphas; 3D bakes brightness, saturation and opacity into the node colour buffer and uses shader uniforms for glow strength and depth fade, plus the camera's field of view.
- The settings tab (declarative API) groups: Features, Appearance, Brightness and colour (with a reset), Custom colours, Nodes and links, Labels, Layout forces, 3D camera, Layout cache. Rows that only matter in some situations (skin effects, glow, backdrop, 3D camera, colour pickers) are hidden until they matter. Controls use dotted keys ("look.brightness"); `getControlValue` and `setControlValue` walk the path.
- The in-view panel keeps quick controls (and gained a brightness slider); both edit the same settings object, and a change in the page re-applies the look, the sizes and, if the forces changed, the layout.

## Verified in Obsidian 1.14.4 (1k vault, real settings window, screenshots measured)
Brightness 40% / 100% / 180% gave mean luma 37.9 / 64.7 / 87.3 (2D) and 31.9 / 42.4 / 51.5 (3D); node brightness, opacity, link brightness, glow strength and backdrop brightness each moved the picture in the expected direction; a custom node colour made the green channel dominate; a custom background colour tinted the graph (new for the default skin); the link distance slider re-laid the graph; field of view 80 gave a camera of 80 degrees; the reset row restored every value; conditional rows showed and hid as designed.

## Consequences
Saturation at 0% has no visible effect on the default skin because Obsidian's grey is already neutral. Link thickness has no effect in 3D (WebGL lines are one device pixel wide). Brightness values above 100% clip bright colours to white. A future pack format (themes, shapes, layouts as data) can reuse the `Look` type as its theme section.
