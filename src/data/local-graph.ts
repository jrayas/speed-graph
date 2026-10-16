import type { Adjacency } from './adjacency';

/**
 * Nodes within `depth` links of `start` (depth 1 = the note and its direct
 * neighbours), following links in either direction and only through nodes
 * that are `allowed`. Returns a 0/1 mask. A start that is not allowed gives an empty mask.
 */
export function neighbourhood(adjacency: Adjacency, capacity: number, start: number, depth: number, allowed: Uint8Array): Uint8Array {
	const reached = new Uint8Array(capacity);
	if (start < 0 || start >= capacity || !allowed[start]) return reached;
	reached[start] = 1;
	let frontier = [start];
	for (let level = 0; level < depth && frontier.length > 0; level++) {
		const next: number[] = [];
		for (const node of frontier) {
			for (let i = adjacency.offsets[node] as number; i < (adjacency.offsets[node + 1] as number); i++) {
				const other = adjacency.neighbours[i] as number;
				if (!reached[other] && allowed[other]) {
					reached[other] = 1;
					next.push(other);
				}
			}
		}
		frontier = next;
	}
	return reached;
}
