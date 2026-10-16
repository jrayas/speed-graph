import { matchesSearch, parseSearch, type NodeInfo } from './search';

export interface ColorGroup {
	/** Same search language as the filter. */
	query: string;
	/** CSS colour, such as #ff8800. */
	color: string;
}

/**
 * For each node, the 1-based index of the first group it matches, or 0 for none.
 * Uses `Uint8Array`, so at most 255 groups count.
 */
export function assignGroups(
	capacity: number,
	alive: Uint8Array,
	infoOf: (id: number) => NodeInfo | undefined,
	groups: readonly ColorGroup[],
): Uint8Array {
	const out = new Uint8Array(capacity);
	const parsed = groups.slice(0, 255).map((g) => parseSearch(g.query));
	if (parsed.every((p) => p.length === 0)) return out;
	for (let id = 0; id < capacity; id++) {
		if (!alive[id]) continue;
		const info = infoOf(id);
		if (!info) continue;
		for (let g = 0; g < parsed.length; g++) {
			const query = parsed[g] as ReturnType<typeof parseSearch>;
			if (query.length > 0 && matchesSearch(query, info)) {
				out[id] = g + 1;
				break;
			}
		}
	}
	return out;
}
