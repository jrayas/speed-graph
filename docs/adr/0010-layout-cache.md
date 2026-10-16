# ADR 0010: Binary layout cache keyed by path hash
- Status: accepted (Phase 6)
- Date: 2026-10-15

## Context
Settling a 25k graph takes several seconds. A second open should not repeat it. The brief asks for positions persisted on disk with clear invalidation rules.

## Options
1. JSON with note paths. 2. Binary file, nodes keyed by a 64-bit hash of the path. 3. Store inside data.json.

## Choice
Option 2: `layout-cache.bin` in the plugin folder, via `vault.adapter.readBinary/writeBinary`. 32-byte header (magic, format, count, graph fingerprint x2, layout signature, flags) then hashA[], hashB[], float32 positions. 16 bytes per node: 400 KB at 25k nodes (JSON would be several MB). Keyed by path hash, not numeric ID, because IDs are reused (ADR 0004). Two independent 32-bit hashes make a collision among 25k paths negligible.

## Invalidation rules
- Unknown format version, bad magic, wrong length or any non-finite value: ignore the file.
- Positions apply to every node whose path hash is in the file. New, renamed and deleted notes simply miss.
- Exact restore (no simulation) only if all of: saved while settled, the graph fingerprint (order-independent sum over nodes and links) is unchanged, the layout signature (force settings and filters) is unchanged, and every visible node has a saved position, and it is not a local graph.
- Otherwise a warm start: alpha 0.1 if 90% or more matched, 0.3 if 50% or more, else 1.
- Saved 1.5 s after the layout settles; not saved for local graphs or during a drag. The "Clear layout cache" command deletes the file. All I/O failures are swallowed with a console warning: the worst case is a normal first layout.

## Consequences
A 25k vault costs 400 KB of disk. The cache is per vault (it lives in the vault's plugin folder). Dragging a node and releasing it changes positions, so the cache is rewritten after the next settle.
