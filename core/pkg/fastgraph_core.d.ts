/* tslint:disable */
/* eslint-disable */

export class Layout {
    free(): void;
    [Symbol.dispose](): void;
    alpha(): number;
    /**
     * Removes the shape.
     */
    clear_shape(): void;
    /**
     * Pins a node at (x, y), like d3's `fx`/`fy`. Used while dragging.
     */
    fix_node(id: number, x: number, y: number): void;
    is_cooled(): boolean;
    /**
     * `edges` is a flat `[source0, target0, source1, target1, ...]`. Invalid
     * pairs (out of range, or a self-link) are ignored.
     */
    constructor(node_count: number, edges: Uint32Array, seed: number);
    node_count(): number;
    /**
     * Interleaved `[x0, y0, x1, y1, ...]` as f32, a copy.
     */
    positions(): Float32Array;
    reheat(alpha: number): void;
    release_node(id: number): void;
    /**
     * Gives some notes a spot of their own: `anchors` is `[x, y, z, ...]` per note and `flags` is 1 for the
     * notes that have one. Such a note is pulled straight to its spot instead of to the nearest target.
     */
    set_anchors(anchors: Float32Array, flags: Uint8Array): void;
    /**
     * One region number per node (255 = free); missing entries mean free.
     */
    set_node_regions(regions: Uint8Array): void;
    /**
     * `gravity` pulls nodes to the centre (0 = off). `repel_max_distance` limits how far the
     * repel force reaches (use `Infinity` for no limit).
     * `repel_strength` is d3's many-body strength (negative repels). `theta`
     * is the Barnes-Hut opening angle (0 = exact).
     */
    set_params(center_strength: number, repel_strength: number, link_strength: number, link_distance: number, theta: number, velocity_decay: number, gravity: number, repel_max_distance: number): void;
    /**
     * Overwrites start positions from interleaved `[x0, y0, ...]`. Entries beyond
     * either array are left alone. Used to warm-start after the graph changes.
     */
    set_positions(positions: Float32Array): void;
    /**
     * Restarts cooling from `alpha` (1.0 is a full restart; use less for a gentle nudge).
     * Gives the layout a shape: `targets` is `[x, y, z, ...]` in the shape's units (z is ignored here),
     * multiplied by `scale`; `regions` is one region number per target (255 = none) or empty.
     */
    set_shape(targets: Float32Array, scale: number, regions: Uint8Array, strength: number): void;
    /**
     * Changes only the strength (0 to 1) of an existing shape.
     */
    set_shape_strength(strength: number): void;
    /**
     * Runs up to `ticks` steps, stopping early once cooled. Returns the final alpha.
     */
    tick(ticks: number): number;
}

export class Layout3 {
    free(): void;
    [Symbol.dispose](): void;
    alpha(): number;
    /**
     * Removes the shape.
     */
    clear_shape(): void;
    /**
     * Pins a node at (x, y, z). Used while dragging.
     */
    fix_node(id: number, x: number, y: number, z: number): void;
    is_cooled(): boolean;
    /**
     * `edges` is a flat `[source0, target0, ...]`. Invalid pairs (out of range, or a self-link) are ignored.
     */
    constructor(node_count: number, edges: Uint32Array, seed: number);
    node_count(): number;
    /**
     * Interleaved `[x0, y0, z0, x1, ...]` as f32, a copy.
     */
    positions(): Float32Array;
    reheat(alpha: number): void;
    release_node(id: number): void;
    /**
     * Gives some notes a spot of their own: `anchors` is `[x, y, z, ...]` per note and `flags` is 1 for the
     * notes that have one. Such a note is pulled straight to its spot instead of to the nearest target.
     */
    set_anchors(anchors: Float32Array, flags: Uint8Array): void;
    /**
     * One region number per node (255 = free); missing entries mean free.
     */
    set_node_regions(regions: Uint8Array): void;
    /**
     * Same meaning as `Layout::set_params`.
     */
    set_params(center_strength: number, repel_strength: number, link_strength: number, link_distance: number, theta: number, velocity_decay: number, gravity: number, repel_max_distance: number): void;
    /**
     * Overwrites start positions from interleaved `[x0, y0, z0, ...]` (warm start).
     */
    set_positions(positions: Float32Array): void;
    /**
     * Gives the layout a shape: `targets` is `[x, y, z, ...]` in the shape's units, multiplied by `scale`;
     * `regions` is one region number per target (255 = none) or empty.
     */
    set_shape(targets: Float32Array, scale: number, regions: Uint8Array, strength: number): void;
    /**
     * Changes only the strength (0 to 1) of an existing shape.
     */
    set_shape_strength(strength: number): void;
    /**
     * Runs up to `ticks` steps, stopping early once cooled. Returns the final alpha.
     */
    tick(ticks: number): number;
}

/**
 * Sums a slice of numbers. Used to prove the TypeScript -> Worker -> Wasm round trip.
 */
export function sum_f64(values: Float64Array): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_layout3_free: (a: number, b: number) => void;
    readonly __wbg_layout_free: (a: number, b: number) => void;
    readonly layout3_alpha: (a: number) => number;
    readonly layout3_clear_shape: (a: number) => void;
    readonly layout3_fix_node: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly layout3_is_cooled: (a: number) => number;
    readonly layout3_new: (a: number, b: number, c: number, d: number) => number;
    readonly layout3_node_count: (a: number) => number;
    readonly layout3_positions: (a: number) => [number, number];
    readonly layout3_reheat: (a: number, b: number) => void;
    readonly layout3_release_node: (a: number, b: number) => void;
    readonly layout3_set_anchors: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly layout3_set_node_regions: (a: number, b: number, c: number) => void;
    readonly layout3_set_params: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly layout3_set_positions: (a: number, b: number, c: number) => void;
    readonly layout3_set_shape: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly layout3_set_shape_strength: (a: number, b: number) => void;
    readonly layout3_tick: (a: number, b: number) => number;
    readonly layout_alpha: (a: number) => number;
    readonly layout_clear_shape: (a: number) => void;
    readonly layout_fix_node: (a: number, b: number, c: number, d: number) => void;
    readonly layout_is_cooled: (a: number) => number;
    readonly layout_new: (a: number, b: number, c: number, d: number) => number;
    readonly layout_node_count: (a: number) => number;
    readonly layout_positions: (a: number) => [number, number];
    readonly layout_reheat: (a: number, b: number) => void;
    readonly layout_release_node: (a: number, b: number) => void;
    readonly layout_set_anchors: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly layout_set_node_regions: (a: number, b: number, c: number) => void;
    readonly layout_set_params: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly layout_set_positions: (a: number, b: number, c: number) => void;
    readonly layout_set_shape: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly layout_set_shape_strength: (a: number, b: number) => void;
    readonly layout_tick: (a: number, b: number) => number;
    readonly sum_f64: (a: number, b: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
