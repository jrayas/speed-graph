# Performance plan

## Targets (proposed; confirm with the user)
- Opening a 10k vault graph never freezes the Obsidian UI: all layout runs in a worker, and the main thread only receives position arrays.
- Typing and navigation stay responsive while the layout runs.
- Second open near-instant from cached positions (Phase 6).
- Zoomed out, show clusters rather than 10,000 dots (Phase 6).

## Measurement method
- Native: `cargo run --release --example bench -- test-vault/gen-10k 10000` (reads the generated vaults, runs the layout until cooled).
- Wasm in V8: the same layout in Node (Wasm build), timing each tick. Not the same as Obsidian, but close in engine.
- In Obsidian: command "Run layout test" (worker, real Wasm); the user reports the notice.
- Record in tracking/BENCHMARKS.md with the machine used.

## Results so far
See BENCHMARKS.md. Layout to cooled takes about 300 ticks; at 25k nodes a tick is about 44 ms in Wasm, so a full settle is about 13 s in the background while the UI stays free. Ideas if that is too slow (not done): f32 maths, parallel-free tree build tweaks, fewer ticks for big graphs, warm start from cached positions, theta above 0.9 when zoomed out.

## Targets against results (2026-10-15, desktop, real Obsidian 1.14.4)
| Target | Result |
|---|---|
| Opens a 10,000-note graph without freezing the UI | 0 long tasks, worst 20 ms-timer gap 36 ms (10k); 2 long tasks, longest 75 ms, worst gap 116 ms (25k, cold). Typing was not measured directly: main-thread freedom is the proxy |
| Typing and navigation stay responsive while the layout runs | Same measurement as above; not tested with real typing |
| Second open near-instant | Exact restore in 83 ms (25k) and 373 ms (10k, includes view setup) |
| Zoomed out shows clusters, not 10,000 dots | 374 bubbles at 10k, 467 at 25k; they dissolve as you zoom in |
| Works on desktop; mobile is a stretch goal | Desktop yes. Mobile untested |
See docs/comparison.md for the built-in graph measured the same way.
