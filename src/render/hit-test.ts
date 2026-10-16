/**
 * Finds the alive node nearest to a world point, within its radius plus slack.
 * Returns -1 if none. A linear scan: about 0.1 ms for 25,000 nodes.
 */
export function nearestNode(
	positions: Float32Array,
	alive: Uint8Array,
	radiusWorld: Float32Array,
	wx: number,
	wy: number,
	slackWorld: number,
): number {
	let best = -1;
	let bestDistance = Infinity;
	const count = Math.min(alive.length, positions.length / 2);
	for (let i = 0; i < count; i++) {
		if (!alive[i]) continue;
		const dx = (positions[2 * i] as number) - wx;
		const dy = (positions[2 * i + 1] as number) - wy;
		const reach = (radiusWorld[i] as number) + slackWorld;
		const d2 = dx * dx + dy * dy;
		if (d2 <= reach * reach && d2 < bestDistance) {
			bestDistance = d2;
			best = i;
		}
	}
	return best;
}
