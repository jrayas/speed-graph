# Data format

## ID mapping
- Each file path gets a compact `uint32` ID (`plugin/src/data/id-map.ts`). IDs start at 0.
- IDs of deleted files go on a free list and are reused, so arrays stay dense. `capacity` is the length to use for per-node arrays; free slots have no path.
- Rename keeps the ID and changes the path. Folders are not nodes.
- All vault files are nodes, markdown and attachments alike. Attachment filtering comes in Phase 5.

## Node kinds, unresolved links, tags (Phase 5)
- Kinds: 0 note (`.md`), 1 attachment (any other file), 2 unresolved link (a link to a note that does not exist). `kindOfPath` decides from the key.
- Unresolved links are nodes keyed `"\0" + linkText` (a prefix no real path can have). They are created by `setLinks` and removed again when nothing links to them (reference-counted).
- Edges now include links to unresolved nodes and to attachments (embeds). `metadataCache.unresolvedLinks` supplies the unresolved ones.
- Tags: per note, lower-case with `#`, from `getAllTags(getFileCache(file))` (frontmatter and inline). Stored in the model, removed with the note. Tag-only changes bump `metaVersion`, not `version`, so they refresh filters and groups without restarting the layout.
- Listeners get `{ graph, meta }` flags saying which changed.

## Edges
- Directed (source links to target), de-duplicated, self-links ignored.
- Source: `metadataCache.resolvedLinks` only. Unresolved links are not in the model yet (Phase 5, "existing files only" filter).
- Typed array `Uint32Array`, flat `[s0, t0, s1, t1, ...]`, cached until the graph changes. `version` increases on every change.
- `degrees()` returns link count (in + out) per ID, for node sizing.

## Incremental updates (VaultGraph)
- First build after `workspace.onLayoutReady`; all listeners are registered after that, so the per-file `create` events at vault load are not seen.
- `metadataCache` `resolve` (file) replaces that file's outgoing links. Vault `create`, `delete`, `rename` add, remove and rename nodes. Deleting a node also drops its incoming edges.
- Gotcha: the metadata cache may still be filling at layout-ready on large vaults. Files resolved later arrive via `resolve`, so the model catches up. A 10k-vault startup check is pending.

## Cache file
Not yet designed (Phase 6).


## Layout cache format 2 (3D, ADR 0013)
The header's last word is now the dimension (2 or 3), and positions are `dimension x count` floats. 2D saves to `layout-cache.bin`, 3D to `layout-cache-3d.bin`; "Clear saved layout" deletes both. A file with another format version or dimension is ignored. Size: 16 bytes per node in 2D, 20 in 3D.
