export interface Adjacency {
	/** Neighbours of node i are `neighbours[offsets[i] .. offsets[i + 1]]`. */
	offsets: Uint32Array;
	neighbours: Uint32Array;
}

/** Undirected neighbour lists (CSR form) from a flat [source, target, ...] edge array. */
export function buildAdjacency(edges: Uint32Array, capacity: number): Adjacency {
	const offsets = new Uint32Array(capacity + 1);
	for (let i = 0; i < edges.length; i++) {
		const id = edges[i] as number;
		offsets[id + 1] = (offsets[id + 1] as number) + 1;
	}
	for (let i = 0; i < capacity; i++) offsets[i + 1] = (offsets[i + 1] as number) + (offsets[i] as number);
	const fill = offsets.slice(0, capacity);
	const neighbours = new Uint32Array(edges.length);
	for (let e = 0; e < edges.length; e += 2) {
		const a = edges[e] as number;
		const b = edges[e + 1] as number;
		neighbours[fill[a] as number] = b;
		fill[a] = (fill[a] as number) + 1;
		neighbours[fill[b] as number] = a;
		fill[b] = (fill[b] as number) + 1;
	}
	return { offsets, neighbours };
}
