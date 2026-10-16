# ADR 0022: Rename from Fast Graph to Speed Graph
- Status: accepted (the user chose the name, 2026-10-16; Quick Graph was considered first and replaced by Speed Graph before anything was published)
- Date: 2026-10-16

## Context
Submitting 0.2.0 to the community directory failed with "An entry with this ID already exists". The ID `fast-graph` belongs to "Fast 3D Graph" by jkraccoon (repo jkraccoon/obsidian-fast-graph, desktop-only, in the directory list). Plugin IDs must be unique and cannot change after release. The name "Fast Graph" was also easy to confuse with "Fast 3D Graph", and the two would clash if installed together (same view type and CSS class names).

## Choice
New ID `speed-graph`, new name "Speed Graph" (the user's suggestion; both free in the older public directory list and as a GitHub repository name; the new directory confirms at submission). Everything that could collide was renamed: the manifest, the package, the view type (`speed-graph-view`), every CSS class (`speed-graph-*`), the console prefix, the commands (now "Speed Graph: ..."), the ribbon label and the tab title. Not renamed: the internal Rust crate and its generated files (`fastgraph_core`), which are not visible to users and cannot clash. The pack file label is now `speed-graph-pack`; packs labelled `fast-graph-pack` (made for 0.1.0 and 0.2.0) are still read and saved with the new label.

## Consequences
The plugin folder is now `.obsidian/plugins/speed-graph/`, so anyone who installed 0.1.0 or 0.2.0 by hand starts with fresh settings after installing this one; the README and release notes say so. The first release under the new ID is 0.3.0. The old releases carry the old ID in their manifests and should be removed once 0.3.0 is out, so the directory's review is not confused by mismatched IDs.
