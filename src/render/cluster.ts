/**
 * Level of detail for zoomed-out views: crowded areas are drawn as one bubble with a count,
 * sparse areas keep their individual nodes. Works on screen coordinates with a fixed grid, so
 * as you zoom in the cells hold fewer nodes and the bubbles dissolve into nodes by themselves.
 *
 * This runs on the main thread (it must keep up with every pan and zoom step); the layout stays
 * in the Wasm worker (ADR 0009).
 */
export interface Clusters {
	/** Per node: the cluster it belongs to, or -1 if it is drawn on its own. */
	cellOf: Int32Array;
	/** Per cluster. */
	count: Uint32Array;
	cx: Float32Array;
	cy: Float32Array;
	/** Most common colour group among the members (0 = default). */
	group: Uint8Array;
	clusters: number;
}

export interface ClusterParams {
	width: number;
	height: number;
	/** Side of a grid cell in screen pixels. */
	cellPx: number;
	/** A cell becomes a bubble when it holds at least this many nodes. */
	minCluster: number;
	/** Extra pixels around the viewport that are still clustered. */
	margin: number;
}

/**
 * @param screen x, y per node in screen pixels
 * @param drawn  1 for nodes that may be drawn (visible and on screen)
 * @param groupOf colour group per node
 * @param groups number of colour groups plus one (size of the vote table per cell)
 */
export function clusterNodes(
	screen: Float32Array,
	drawn: Uint8Array,
	count: number,
	groupOf: Uint8Array,
	groups: number,
	params: ClusterParams,
): Clusters {
	const { width, height, cellPx, minCluster, margin } = params;
	const cols = Math.max(1, Math.ceil((width + 2 * margin) / cellPx));
	const rows = Math.max(1, Math.ceil((height + 2 * margin) / cellPx));
	const cellTotal = cols * rows;
	const perCell = new Uint32Array(cellTotal);
	const cellIndex = new Int32Array(count).fill(-1);
	for (let i = 0; i < count; i++) {
		if (!drawn[i]) continue;
		const cx = Math.floor(((screen[2 * i] as number) + margin) / cellPx);
		const cy = Math.floor(((screen[2 * i + 1] as number) + margin) / cellPx);
		if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
		const cell = cy * cols + cx;
		cellIndex[i] = cell;
		perCell[cell] = (perCell[cell] as number) + 1;
	}
	// Number the cells that are crowded enough.
	const clusterOfCell = new Int32Array(cellTotal).fill(-1);
	let clusters = 0;
	for (let cell = 0; cell < cellTotal; cell++) if ((perCell[cell] as number) >= minCluster) clusterOfCell[cell] = clusters++;
	const out: Clusters = {
		cellOf: new Int32Array(count).fill(-1),
		count: new Uint32Array(clusters),
		cx: new Float32Array(clusters),
		cy: new Float32Array(clusters),
		group: new Uint8Array(clusters),
		clusters,
	};
	if (clusters === 0) return out;
	const votes = new Uint32Array(clusters * groups);
	for (let i = 0; i < count; i++) {
		const cell = cellIndex[i] as number;
		if (cell < 0) continue;
		const c = clusterOfCell[cell] as number;
		if (c < 0) continue;
		out.cellOf[i] = c;
		out.count[c] = (out.count[c] as number) + 1;
		out.cx[c] = (out.cx[c] as number) + (screen[2 * i] as number);
		out.cy[c] = (out.cy[c] as number) + (screen[2 * i + 1] as number);
		const g = Math.min(groupOf[i] as number, groups - 1);
		votes[c * groups + g] = (votes[c * groups + g] as number) + 1;
	}
	for (let c = 0; c < clusters; c++) {
		const n = out.count[c] as number;
		out.cx[c] = (out.cx[c] as number) / n;
		out.cy[c] = (out.cy[c] as number) / n;
		let best = 0;
		for (let g = 1; g < groups; g++) if ((votes[c * groups + g] as number) > (votes[c * groups + best] as number)) best = g;
		out.group[c] = best;
	}
	return out;
}

/** Links between bubbles and between a bubble and a lone node, as line segments with a weight. */
export interface ClusterLinks {
	x1: number[];
	y1: number[];
	x2: number[];
	y2: number[];
	/** How many real links this segment stands for. */
	weight: number[];
}

/**
 * Turns links into segments between bubble centres (several links between the same two bubbles
 * become one segment with a weight). Links inside one bubble vanish. Links between two lone nodes are
 * left to the normal drawing and are not returned. Links with an end that is not drawn are skipped.
 */
export function aggregateLinks(
	edges: Uint32Array,
	cl: Clusters,
	screen: Float32Array,
	drawn: Uint8Array,
): ClusterLinks {
	const links: ClusterLinks = { x1: [], y1: [], x2: [], y2: [], weight: [] };
	const pairs = new Map<number, number>();
	const clusters = cl.clusters;
	for (let e = 0; e < edges.length; e += 2) {
		const a = edges[e] as number;
		const b = edges[e + 1] as number;
		if (!drawn[a] || !drawn[b]) continue;
		const ca = cl.cellOf[a] as number;
		const cb = cl.cellOf[b] as number;
		if (ca < 0 && cb < 0) continue;
		if (ca >= 0 && ca === cb) continue;
		if (ca >= 0 && cb >= 0) {
			const key = ca < cb ? ca * clusters + cb : cb * clusters + ca;
			pairs.set(key, (pairs.get(key) ?? 0) + 1);
			continue;
		}
		const x1 = ca >= 0 ? (cl.cx[ca] as number) : (screen[2 * a] as number);
		const y1 = ca >= 0 ? (cl.cy[ca] as number) : (screen[2 * a + 1] as number);
		const x2 = cb >= 0 ? (cl.cx[cb] as number) : (screen[2 * b] as number);
		const y2 = cb >= 0 ? (cl.cy[cb] as number) : (screen[2 * b + 1] as number);
		links.x1.push(x1);
		links.y1.push(y1);
		links.x2.push(x2);
		links.y2.push(y2);
		links.weight.push(1);
	}
	for (const [key, weight] of pairs) {
		const lo = Math.floor(key / clusters);
		const hi = key % clusters;
		links.x1.push(cl.cx[lo] as number);
		links.y1.push(cl.cy[lo] as number);
		links.x2.push(cl.cx[hi] as number);
		links.y2.push(cl.cy[hi] as number);
		links.weight.push(weight);
	}
	return links;
}

/** The bubble under a screen point, or -1. `radiusOf` gives each bubble's drawn radius. */
export function hitCluster(cl: Clusters, sx: number, sy: number, radiusOf: (count: number) => number, slack: number): number {
	let best = -1;
	let bestDistance = Infinity;
	for (let c = 0; c < cl.clusters; c++) {
		const dx = (cl.cx[c] as number) - sx;
		const dy = (cl.cy[c] as number) - sy;
		const reach = radiusOf(cl.count[c] as number) + slack;
		const d2 = dx * dx + dy * dy;
		if (d2 <= reach * reach && d2 < bestDistance) {
			bestDistance = d2;
			best = c;
		}
	}
	return best;
}
