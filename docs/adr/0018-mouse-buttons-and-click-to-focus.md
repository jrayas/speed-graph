# ADR 0018: Left button clicks, right button pans; click a note to focus the local graph
- Status: accepted (user request 2026-10-16)
- Date: 2026-10-16

## Context
With the left button doing both "click a note" and "drag the view", a slight slip while clicking started a pan. The local graph ("show the active note and its neighbours") also depended on the note open in the editor: with none open it showed an empty graph, and there was no way to move from one note to its neighbours by clicking.

## Choice (revised the same day after testing)
**Buttons.** The first version made the left button click-only and the right button pan. The user then asked to reverse the left button and keep the right. Final rule (view/pointer-mode.ts, tested): the left button clicks and drags notes and drags the view from empty space, exactly as before. A setting "Also pan with the right mouse button" (on by default, Mouse group of the settings page) makes the right and middle buttons drag the view too (a drag that starts on a note pans instead of moving it) and stops the right button opening a menu; off ignores them. Touch and pen are unchanged. In 3D nothing changes (left turns the camera, right or middle or a modifier slides it).

**Local graph.** With it on, a plain click on a note makes that note the centre and shows it with its neighbours (depth as set); Cmd/Ctrl-click or a double-click on a note opens it; a double-click on empty space still fits the view. Every time the toggle is switched, on or off, the chosen note is forgotten, so it always starts fresh: the whole graph is shown with the hint "Click a note to see it and its neighbours." (even if a note is open in the editor). The toggle is for one session only: a saved "on" is ignored when the plugin loads. Opening a note from elsewhere while it is on still moves the centre to that note. If the chosen note is hidden by a filter, a message says so. The panel label is "Focus on one note and its neighbours".

## Consequences
With the local graph on, a single click no longer opens a note: it moves the focus. The earlier idea of remembering the last centre across toggles was rejected by the user (it showed the same notes again).
