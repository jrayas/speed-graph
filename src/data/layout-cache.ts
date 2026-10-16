/**
 * Saved layout positions, so a second open is near-instant. Pure code: no Obsidian types.
 *
 * File format (little-endian, 32-byte header, then three arrays):
 *   u32 magic, u32 format, u32 count, u32 fingerprint A, u32 fingerprint B, u32 signature, u32 flags, u32 dimension (2 or 3)
 *   u32 hashA[count], u32 hashB[count], f32 positions[dimension * count]
 * Each node is keyed by a 64-bit hash of its path (two independent 32-bit hashes), not by its
 * numeric ID, because IDs are reused after a delete (ADR 0004).
 *
 * Invalidation rules:
 *  - a different format version or a damaged file is ignored;
 *  - positions are applied to every node whose path hash is in the file (so renamed, new or
 *    deleted notes simply miss);
 *  - the layout is restored exactly (no simulation) only if it was saved settled, the graph
 *    fingerprint (nodes and links) and the layout signature (forces and filters) are unchanged,
 *    and every visible node has a saved position. Otherwise it is a warm start that cools from
 *    a lower alpha the more nodes matched.
 */
export const CACHE_MAGIC = 0x434c4746; // "FGLC" read as little-endian bytes
export const CACHE_FORMAT = 2;
const HEADER_BYTES = 32;

export interface CacheRecord {
	fingerprint: [number, number];
	signature: number;
	settled: boolean;
	/** Numbers per position: 2 for the 2D layout, 3 for the 3D layout. */
	dim: 2 | 3;
	hashA: Uint32Array;
	hashB: Uint32Array;
	/** Interleaved x, y (and z in 3D) per entry. */
	positions: Float32Array;
}

function fmix(h: number): number {
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return h >>> 0;
}

/** Two independent 32-bit hashes of a path (64 bits together). */
export function hashPath(path: string): [number, number] {
	let a = 0x811c9dc5;
	let b = 5381;
	for (let i = 0; i < path.length; i++) {
		const c = path.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193);
		b = (Math.imul(b, 33) + c) | 0;
	}
	return [fmix(a), fmix(b ^ 0x9e3779b9)];
}

/** Hash of a string such as the layout settings, as one 32-bit number. */
export function hashText(text: string): number {
	const [a, b] = hashPath(text);
	return (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
}

/**
 * An order-independent fingerprint of the graph: a sum of per-node and per-link mixes.
 * Adding, removing or renaming a node, or adding, removing or reversing a link, changes it.
 */
export function graphFingerprint(
	hashA: Uint32Array,
	hashB: Uint32Array,
	alive: Uint8Array,
	edges: Uint32Array,
): [number, number] {
	let nodes = 0;
	for (let i = 0; i < alive.length; i++) {
		if (alive[i]) nodes = (nodes + fmix(((hashA[i] as number) ^ Math.imul(hashB[i] as number, 0x9e3779b1)) >>> 0)) >>> 0;
	}
	let links = 0;
	for (let e = 0; e < edges.length; e += 2) {
		const s = edges[e] as number;
		const t = edges[e + 1] as number;
		const mix = fmix(((hashA[s] as number) + Math.imul(hashB[t] as number, 0x2545f491) + Math.imul(hashA[t] as number, 0x1b873593)) >>> 0);
		links = (links + mix) >>> 0;
	}
	return [nodes, links];
}

export function encodeCache(rec: CacheRecord): ArrayBuffer {
	const count = rec.hashA.length;
	const dim = rec.dim;
	const buffer = new ArrayBuffer(HEADER_BYTES + count * (8 + 4 * dim));
	const header = new Uint32Array(buffer, 0, 8);
	header[0] = CACHE_MAGIC;
	header[1] = CACHE_FORMAT;
	header[2] = count;
	header[3] = rec.fingerprint[0];
	header[4] = rec.fingerprint[1];
	header[5] = rec.signature;
	header[6] = rec.settled ? 1 : 0;
	header[7] = dim;
	new Uint32Array(buffer, HEADER_BYTES, count).set(rec.hashA);
	new Uint32Array(buffer, HEADER_BYTES + count * 4, count).set(rec.hashB);
	new Float32Array(buffer, HEADER_BYTES + count * 8, count * dim).set(rec.positions.subarray(0, count * dim));
	return buffer;
}

/** Parses a cache file; returns null for anything that is not a valid, current, finite cache. */
export function decodeCache(buffer: ArrayBuffer): CacheRecord | null {
	if (buffer.byteLength < HEADER_BYTES || buffer.byteLength % 4 !== 0) return null;
	const header = new Uint32Array(buffer, 0, 8);
	if (header[0] !== CACHE_MAGIC || header[1] !== CACHE_FORMAT) return null;
	const count = header[2] as number;
	const dim = header[7] as number;
	if (dim !== 2 && dim !== 3) return null;
	if (buffer.byteLength !== HEADER_BYTES + count * (8 + 4 * dim)) return null;
	const positions = new Float32Array(buffer.slice(HEADER_BYTES + count * 8));
	for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) return null;
	return {
		fingerprint: [header[3] as number, header[4] as number],
		signature: header[5] as number,
		settled: ((header[6] as number) & 1) === 1,
		dim,
		hashA: new Uint32Array(buffer.slice(HEADER_BYTES, HEADER_BYTES + count * 4)),
		hashB: new Uint32Array(buffer.slice(HEADER_BYTES + count * 4, HEADER_BYTES + count * 8)),
		positions,
	};
}

/** Builds a cache record from the nodes that have been laid out. */
export function buildRecord(
	hashA: Uint32Array,
	hashB: Uint32Array,
	alive: Uint8Array,
	known: Uint8Array,
	positions: Float32Array,
	fingerprint: [number, number],
	signature: number,
	settled: boolean,
	dim: 2 | 3 = 2,
): CacheRecord {
	let count = 0;
	for (let i = 0; i < alive.length; i++) if (alive[i] && known[i]) count++;
	const outA = new Uint32Array(count);
	const outB = new Uint32Array(count);
	const outPos = new Float32Array(count * dim);
	let k = 0;
	for (let i = 0; i < alive.length; i++) {
		if (!alive[i] || !known[i]) continue;
		outA[k] = hashA[i] as number;
		outB[k] = hashB[i] as number;
		for (let a = 0; a < dim; a++) outPos[dim * k + a] = positions[dim * i + a] as number;
		k++;
	}
	return { fingerprint, signature, settled, dim, hashA: outA, hashB: outB, positions: outPos };
}

/**
 * Copies saved positions onto matching alive nodes and marks them known. Returns how many matched.
 * Nodes without a match, and dead slots, are left alone.
 */
export function applyCache(
	rec: CacheRecord,
	hashA: Uint32Array,
	hashB: Uint32Array,
	alive: Uint8Array,
	positions: Float32Array,
	known: Uint8Array,
): number {
	const index = new Map<number, number>();
	for (let i = 0; i < rec.hashA.length; i++) {
		index.set(((rec.hashA[i] as number) ^ Math.imul(rec.hashB[i] as number, 0x9e3779b1)) >>> 0, i);
	}
	let matched = 0;
	for (let id = 0; id < alive.length; id++) {
		if (!alive[id]) continue;
		const a = hashA[id] as number;
		const b = hashB[id] as number;
		const at = index.get((a ^ Math.imul(b, 0x9e3779b1)) >>> 0);
		if (at === undefined || rec.hashA[at] !== a || rec.hashB[at] !== b) continue;
		const dim = rec.dim;
		for (let a = 0; a < dim; a++) positions[dim * id + a] = rec.positions[dim * at + a] as number;
		known[id] = 1;
		matched++;
	}
	return matched;
}

export interface RestorePlan {
	/** 'restore': show the saved layout as it is. 'warm': simulate from the saved positions. */
	mode: 'restore' | 'warm';
	/** Starting alpha for a warm start (1 = full simulation). */
	alpha: number;
}

/**
 * Decides how to use the cache for the nodes about to be shown.
 * `visibleKnown` / `visibleTotal` count visible nodes that have a position (from the cache or before).
 */
export function planFromCache(
	rec: CacheRecord | null,
	fingerprint: [number, number],
	signature: number,
	visibleKnown: number,
	visibleTotal: number,
): RestorePlan {
	const sameGraph = rec !== null && rec.fingerprint[0] === fingerprint[0] && rec.fingerprint[1] === fingerprint[1];
	if (rec && sameGraph && rec.signature === signature && rec.settled && visibleTotal > 0 && visibleKnown === visibleTotal) {
		return { mode: 'restore', alpha: 0 };
	}
	const fraction = visibleTotal === 0 ? 0 : visibleKnown / visibleTotal;
	if (fraction >= 0.9) return { mode: 'warm', alpha: 0.1 };
	if (fraction >= 0.5) return { mode: 'warm', alpha: 0.3 };
	return { mode: 'warm', alpha: 1 };
}
