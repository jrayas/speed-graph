/* @ts-self-types="./fastgraph_core.d.ts" */

export class Layout {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LayoutFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_layout_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    alpha() {
        const ret = wasm.layout_alpha(this.__wbg_ptr);
        return ret;
    }
    /**
     * Removes the shape.
     */
    clear_shape() {
        wasm.layout_clear_shape(this.__wbg_ptr);
    }
    /**
     * Pins a node at (x, y), like d3's `fx`/`fy`. Used while dragging.
     * @param {number} id
     * @param {number} x
     * @param {number} y
     */
    fix_node(id, x, y) {
        wasm.layout_fix_node(this.__wbg_ptr, id, x, y);
    }
    /**
     * @returns {boolean}
     */
    is_cooled() {
        const ret = wasm.layout_is_cooled(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * `edges` is a flat `[source0, target0, source1, target1, ...]`. Invalid
     * pairs (out of range, or a self-link) are ignored.
     * @param {number} node_count
     * @param {Uint32Array} edges
     * @param {number} seed
     */
    constructor(node_count, edges, seed) {
        const ptr0 = passArray32ToWasm0(edges, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layout_new(node_count, ptr0, len0, seed);
        this.__wbg_ptr = ret;
        LayoutFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    node_count() {
        const ret = wasm.layout_node_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Interleaved `[x0, y0, x1, y1, ...]` as f32, a copy.
     * @returns {Float32Array}
     */
    positions() {
        const ret = wasm.layout_positions(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {number} alpha
     */
    reheat(alpha) {
        wasm.layout_reheat(this.__wbg_ptr, alpha);
    }
    /**
     * @param {number} id
     */
    release_node(id) {
        wasm.layout_release_node(this.__wbg_ptr, id);
    }
    /**
     * Gives some notes a spot of their own: `anchors` is `[x, y, z, ...]` per note and `flags` is 1 for the
     * notes that have one. Such a note is pulled straight to its spot instead of to the nearest target.
     * @param {Float32Array} anchors
     * @param {Uint8Array} flags
     */
    set_anchors(anchors, flags) {
        const ptr0 = passArrayF32ToWasm0(anchors, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(flags, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.layout_set_anchors(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * One region number per node (255 = free); missing entries mean free.
     * @param {Uint8Array} regions
     */
    set_node_regions(regions) {
        const ptr0 = passArray8ToWasm0(regions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.layout_set_node_regions(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * `gravity` pulls nodes to the centre (0 = off). `repel_max_distance` limits how far the
     * repel force reaches (use `Infinity` for no limit).
     * `repel_strength` is d3's many-body strength (negative repels). `theta`
     * is the Barnes-Hut opening angle (0 = exact).
     * @param {number} center_strength
     * @param {number} repel_strength
     * @param {number} link_strength
     * @param {number} link_distance
     * @param {number} theta
     * @param {number} velocity_decay
     * @param {number} gravity
     * @param {number} repel_max_distance
     */
    set_params(center_strength, repel_strength, link_strength, link_distance, theta, velocity_decay, gravity, repel_max_distance) {
        wasm.layout_set_params(this.__wbg_ptr, center_strength, repel_strength, link_strength, link_distance, theta, velocity_decay, gravity, repel_max_distance);
    }
    /**
     * Overwrites start positions from interleaved `[x0, y0, ...]`. Entries beyond
     * either array are left alone. Used to warm-start after the graph changes.
     * @param {Float32Array} positions
     */
    set_positions(positions) {
        const ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.layout_set_positions(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Restarts cooling from `alpha` (1.0 is a full restart; use less for a gentle nudge).
     * Gives the layout a shape: `targets` is `[x, y, z, ...]` in the shape's units (z is ignored here),
     * multiplied by `scale`; `regions` is one region number per target (255 = none) or empty.
     * @param {Float32Array} targets
     * @param {number} scale
     * @param {Uint8Array} regions
     * @param {number} strength
     */
    set_shape(targets, scale, regions, strength) {
        const ptr0 = passArrayF32ToWasm0(targets, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(regions, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.layout_set_shape(this.__wbg_ptr, ptr0, len0, scale, ptr1, len1, strength);
    }
    /**
     * Changes only the strength (0 to 1) of an existing shape.
     * @param {number} strength
     */
    set_shape_strength(strength) {
        wasm.layout_set_shape_strength(this.__wbg_ptr, strength);
    }
    /**
     * Runs up to `ticks` steps, stopping early once cooled. Returns the final alpha.
     * @param {number} ticks
     * @returns {number}
     */
    tick(ticks) {
        const ret = wasm.layout_tick(this.__wbg_ptr, ticks);
        return ret;
    }
}
if (Symbol.dispose) Layout.prototype[Symbol.dispose] = Layout.prototype.free;

export class Layout3 {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        Layout3Finalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_layout3_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    alpha() {
        const ret = wasm.layout3_alpha(this.__wbg_ptr);
        return ret;
    }
    /**
     * Removes the shape.
     */
    clear_shape() {
        wasm.layout3_clear_shape(this.__wbg_ptr);
    }
    /**
     * Pins a node at (x, y, z). Used while dragging.
     * @param {number} id
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    fix_node(id, x, y, z) {
        wasm.layout3_fix_node(this.__wbg_ptr, id, x, y, z);
    }
    /**
     * @returns {boolean}
     */
    is_cooled() {
        const ret = wasm.layout3_is_cooled(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * `edges` is a flat `[source0, target0, ...]`. Invalid pairs (out of range, or a self-link) are ignored.
     * @param {number} node_count
     * @param {Uint32Array} edges
     * @param {number} seed
     */
    constructor(node_count, edges, seed) {
        const ptr0 = passArray32ToWasm0(edges, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layout3_new(node_count, ptr0, len0, seed);
        this.__wbg_ptr = ret;
        Layout3Finalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    node_count() {
        const ret = wasm.layout3_node_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Interleaved `[x0, y0, z0, x1, ...]` as f32, a copy.
     * @returns {Float32Array}
     */
    positions() {
        const ret = wasm.layout3_positions(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {number} alpha
     */
    reheat(alpha) {
        wasm.layout3_reheat(this.__wbg_ptr, alpha);
    }
    /**
     * @param {number} id
     */
    release_node(id) {
        wasm.layout3_release_node(this.__wbg_ptr, id);
    }
    /**
     * Gives some notes a spot of their own: `anchors` is `[x, y, z, ...]` per note and `flags` is 1 for the
     * notes that have one. Such a note is pulled straight to its spot instead of to the nearest target.
     * @param {Float32Array} anchors
     * @param {Uint8Array} flags
     */
    set_anchors(anchors, flags) {
        const ptr0 = passArrayF32ToWasm0(anchors, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(flags, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.layout3_set_anchors(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * One region number per node (255 = free); missing entries mean free.
     * @param {Uint8Array} regions
     */
    set_node_regions(regions) {
        const ptr0 = passArray8ToWasm0(regions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.layout3_set_node_regions(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Same meaning as `Layout::set_params`.
     * @param {number} center_strength
     * @param {number} repel_strength
     * @param {number} link_strength
     * @param {number} link_distance
     * @param {number} theta
     * @param {number} velocity_decay
     * @param {number} gravity
     * @param {number} repel_max_distance
     */
    set_params(center_strength, repel_strength, link_strength, link_distance, theta, velocity_decay, gravity, repel_max_distance) {
        wasm.layout3_set_params(this.__wbg_ptr, center_strength, repel_strength, link_strength, link_distance, theta, velocity_decay, gravity, repel_max_distance);
    }
    /**
     * Overwrites start positions from interleaved `[x0, y0, z0, ...]` (warm start).
     * @param {Float32Array} positions
     */
    set_positions(positions) {
        const ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.layout3_set_positions(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Gives the layout a shape: `targets` is `[x, y, z, ...]` in the shape's units, multiplied by `scale`;
     * `regions` is one region number per target (255 = none) or empty.
     * @param {Float32Array} targets
     * @param {number} scale
     * @param {Uint8Array} regions
     * @param {number} strength
     */
    set_shape(targets, scale, regions, strength) {
        const ptr0 = passArrayF32ToWasm0(targets, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(regions, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.layout3_set_shape(this.__wbg_ptr, ptr0, len0, scale, ptr1, len1, strength);
    }
    /**
     * Changes only the strength (0 to 1) of an existing shape.
     * @param {number} strength
     */
    set_shape_strength(strength) {
        wasm.layout3_set_shape_strength(this.__wbg_ptr, strength);
    }
    /**
     * Runs up to `ticks` steps, stopping early once cooled. Returns the final alpha.
     * @param {number} ticks
     * @returns {number}
     */
    tick(ticks) {
        const ret = wasm.layout3_tick(this.__wbg_ptr, ticks);
        return ret;
    }
}
if (Symbol.dispose) Layout3.prototype[Symbol.dispose] = Layout3.prototype.free;

/**
 * Sums a slice of numbers. Used to prove the TypeScript -> Worker -> Wasm round trip.
 * @param {Float64Array} values
 * @returns {number}
 */
export function sum_f64(values) {
    const ptr0 = passArrayF64ToWasm0(values, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sum_f64(ptr0, len0);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./fastgraph_core_bg.js": import0,
    };
}

const LayoutFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_layout_free(ptr, 1));
const Layout3Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_layout3_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('fastgraph_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
