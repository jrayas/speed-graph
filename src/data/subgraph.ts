/** The visible part of the graph with compact IDs 0..n-1, for the layout engine. */
export interface Subgraph {
	/** compact index -> full ID */
	ids: Uint32Array;
	/** flat [source, target, ...] in compact indices; edges with a hidden end are dropped */
	edges: Uint32Array;
}

export function buildSubgraph(edges: Uint32Array, visible: Uint8Array): Subgraph {
	const compact = new Int32Array(visible.length).fill(-1);
	let count = 0;
	for (let id = 0; id < visible.length; id++) if (visible[id]) compact[id] = count++;
	const ids = new Uint32Array(count);
	for (let id = 0; id < visible.length; id++) if (visible[id]) ids[compact[id] as number] = id;
	const kept: number[] = [];
	for (let e = 0; e < edges.length; e += 2) {
		const a = compact[edges[e] as number] as number;
		const b = compact[edges[e + 1] as number] as number;
		if (a >= 0 && b >= 0) kept.push(a, b);
	}
	return { ids, edges: Uint32Array.from(kept) };
}

/**
 * Copies compact positions into the full-size array and marks those nodes as positioned.
 * `stride` is numbers per position: 2 (x, y) or 3 (x, y, z).
 */
export function scatterPositions(full: Float32Array, known: Uint8Array, ids: Uint32Array, compact: Float32Array, stride = 2): void {
	const count = Math.min(ids.length, Math.floor(compact.length / stride));
	for (let i = 0; i < count; i++) {
		const id = ids[i] as number;
		for (let a = 0; a < stride; a++) full[stride * id + a] = compact[stride * i + a] as number;
		known[id] = 1;
	}
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const R2_A1 = 0.7548776662466927;
const R2_A2 = 0.5698402909980532;

/**
 * Start positions for the visible nodes, compact. Nodes that have been laid out before keep
 * their position; new ones are placed on a spiral (2D) or spread through a sphere (3D) around the
 * origin so they do not pile up.
 */
export function gatherPositions(full: Float32Array, known: Uint8Array, ids: Uint32Array, stride = 2): Float32Array {
	const out = new Float32Array(ids.length * stride);
	let fresh = 0;
	for (let i = 0; i < ids.length; i++) {
		const id = ids[i] as number;
		if (known[id]) {
			for (let a = 0; a < stride; a++) out[stride * i + a] = full[stride * id + a] as number;
			continue;
		}
		if (stride === 3) {
			const u = (0.5 + fresh * R2_A1) % 1;
			const v = (0.5 + fresh * R2_A2) % 1;
			const cosTheta = 1 - 2 * u;
			const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
			const radius = 10 * Math.cbrt(0.5 + fresh);
			out[3 * i] = radius * sinTheta * Math.cos(2 * Math.PI * v);
			out[3 * i + 1] = radius * sinTheta * Math.sin(2 * Math.PI * v);
			out[3 * i + 2] = radius * cosTheta;
		} else {
			const radius = 10 * Math.sqrt(0.5 + fresh);
			const angle = fresh * GOLDEN_ANGLE;
			out[2 * i] = radius * Math.cos(angle);
			out[2 * i + 1] = radius * Math.sin(angle);
		}
		fresh++;
	}
	return out;
}
