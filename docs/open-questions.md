# Open questions
- Project root is the existing folder "fast graph" rather than a new obsidian-graph-plugin/ folder. Confirm if a rename is wanted.

## Added by research gate, 2026-10-15
Behaviour (not in the help docs; resolve by observing the built-in graph, clean-room):
- Default values and slider ranges for centre, repel, link force, link distance, node size, link thickness, text fade threshold.
- What "Center force" does mathematically: pull towards the centre (compactness, "more circular") rather than d3's mean-translation `forceCenter`.
- Node size formula: incoming links only, or total degree? Linear, sqrt or log?
- Can nodes be dragged, and do they stay pinned after release? (Not on the help page.)
- Hover: are non-neighbours dimmed, and do labels of neighbours appear regardless of the fade threshold?
- Local graph: incoming / outgoing / neighbour-link toggles and "follow active note" are not on the help page — confirm they exist and how they behave; maximum depth.
- Groups: which colour wins when a note matches several groups?
- Tags as nodes: shape and colour; are tag-to-note edges drawn with arrows?
- "Attachments": which file types count (non-Markdown files only, or also canvas/base)?
- Unresolved links ("Existing files only" off): how are non-existent notes drawn?
- Animate: speed and whether attachments are included.

API and review:
- Is a separate local-graph view type wanted, or one view type with a "local" mode?
- Should we replicate "Excluded files" with our own setting, since there is no public API to read it?
- Which subset of Obsidian search syntax must filters and groups support (path:, file:, tag:, plain text)?
- Plugin name: "Speed graph" must be unique, must not contain "Obsidian"/"Plugin", and must not be a bare core feature name — confirm the final name and id before Phase 7.
- Should we ask Obsidian (Discord `#community-directory`) about Rust in build verification before Phase 1 ends?
- How do Obsidian's centre/repel/link-force/link-distance sliders map to d3 parameters? Observe in Phase 4; do not guess.
- Obsidian's slider ranges and defaults (centre, repel, link force, link distance, node size, link thickness, text fade) are not documented. Ours are placeholders: repel = -3 x slider, centre 0 to 1, link distance 10 to 200 (default 30). Compare against the built-in graph's look in Phase 4/5 and decide.
- Does a dragged node stay pinned in the built-in graph? We release it on drop (d3 style).
- Where does a click open the note in the built-in graph? We open a new tab (Cmd/Ctrl-click uses Obsidian's usual modifier behaviour). Unverified.
- Text fade threshold: we fade labels in over 0.5 zoom units above the threshold. The built-in graph's exact rule is unknown.
- Unlinked notes drift far out under the repel force (d3 has no restoring force for them). We hide the effect by trimming the outer 2% when fitting the view. The built-in graph may handle orphans differently.
- Orphans filter: is a note whose only links go to hidden nodes an orphan in the built-in graph? We say yes (links are counted between visible nodes only).
- Local graph: the built-in one has separate backlinks and outgoing toggles. Worth adding? Not in the Phase 5 scope.
- Search: how much of Obsidian's search syntax do users expect in the graph filter? Content search is not possible without reading note text.
