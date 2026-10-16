# ADR 0005: d3-force model with a tick-driven Wasm Layout object
- Status: accepted (Phase 3)
- Date: 2026-10-15
## Context
We need a layout that matches the familiar graph look, runs off the main thread and can be driven interactively (parameter changes, reheating, later dragging).
## Options
1. Run the whole simulation in one call and return final positions. 2. A stateful `Layout` object held by the worker, advanced with `tick(n)`. 3. Ship d3-force in JS in the worker.
## Choice
Option 2. State lives in the Wasm module, the worker sends `positions()` as a transferred Float32Array after each batch. Option 3 would not use Rust and was rejected by the brief.
## Consequences
Positions are copied out each batch (about 200 KB at 25k nodes). Dragging needs fixed nodes later. IDs including free slots are laid out; Phase 4 must handle them.
