/**
 * Skins: complete looks drawn by code (no image files). A skin sets colours, how nodes glow,
 * how links are drawn, a procedural background and optional moving effects. The pure helpers
 * here (seeded random numbers, colour buckets, curve geometry) are unit-tested; the renderer
 * does the actual painting.
 */
export type SkinId = 'default' | 'galaxy' | 'brain';

export const SKIN_NAMES: Record<SkinId, string> = {
	default: 'Default',
	galaxy: 'Galaxy',
	brain: 'Brain (stylised)',
};

export interface Skin {
	/** Names the background cache; pack themes get an id of their own. */
	id: string;
	/** Node colours, from the least to the most connected. */
	buckets: string[];
	linkColour: string;
	linkAlpha: number;
	accent: string;
	label: string;
	/** Fill behind the graph, or null to keep Obsidian's own background. */
	base: string | null;
	/** Soft glow around nodes, blended additively. */
	glow: boolean;
	curvedLinks: boolean;
	/** Dots travelling along some links. */
	pulses: boolean;
	/** Needs continuous redraw (twinkle, pulses). */
	animated: boolean;
	/** Nebula blobs (galaxy) or vignette tint (brain) for the background. */
	backdrop: { colours: string[]; seed: number };
	starfield: boolean;
}

export const SKINS: Record<Exclude<SkinId, 'default'>, Skin> = {
	galaxy: {
		id: 'galaxy',
		buckets: ['#8fb0ff', '#b9ccff', '#fff1d8', '#ffdca0', '#ffc070', '#ff9a48'],
		linkColour: '#6f93ff',
		linkAlpha: 0.1,
		accent: '#ffe9a8',
		label: '#e8eeff',
		base: '#03040a',
		glow: true,
		curvedLinks: false,
		pulses: false,
		animated: true,
		backdrop: { colours: ['#2a1760', '#0e3868', '#5a1d4c', '#123a8a'], seed: 7 },
		starfield: true,
	},
	brain: {
		id: 'brain',
		buckets: ['#c98ba0', '#e0a2b8', '#f2bccd', '#cfe3ff', '#8fd0ff', '#57c4ff'],
		linkColour: '#78b8ff',
		linkAlpha: 0.22,
		accent: '#ffd6e6',
		label: '#fbeaf0',
		base: '#09050d',
		glow: true,
		curvedLinks: true,
		pulses: true,
		animated: true,
		backdrop: { colours: ['#5a1f45', '#2a1450', '#4a1838'], seed: 21 },
		starfield: false,
	},
};

export function getSkin(id: string): Skin | null {
	return id === 'galaxy' || id === 'brain' ? SKINS[id] : null;
}

/** Small seeded random generator (mulberry32): the same seed always gives the same sequence. */
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface Star {
	/** 0 to 1 across the screen. */
	x: number;
	y: number;
	size: number;
	alpha: number;
	phase: number;
}

/** A fixed set of background stars, the same every time for a seed. */
export function makeStarfield(seed: number, count: number): Star[] {
	const rnd = seededRandom(seed);
	const stars: Star[] = [];
	for (let i = 0; i < count; i++) {
		const bright = rnd() < 0.08;
		stars.push({ x: rnd(), y: rnd(), size: bright ? 1.2 + rnd() * 0.8 : 0.4 + rnd() * 0.7, alpha: bright ? 0.8 : 0.25 + rnd() * 0.4, phase: rnd() * Math.PI * 2 });
	}
	return stars;
}

/**
 * Colour bucket for every node by how connected it is. A node's bucket depends on the share of
 * nodes with a strictly lower degree, so nodes with equal degree always share a colour (most notes
 * have only one or two links, so ties are the normal case). Thresholds: 20%, 50%, 80%, 95%, 99%.
 * `buckets` must be 2 or more; the first bucket is the least connected.
 */
export function degreeBuckets(degrees: Uint32Array, alive: Uint8Array, buckets: number): Uint8Array {
	const out = new Uint8Array(degrees.length);
	const values: number[] = [];
	for (let i = 0; i < degrees.length; i++) if (alive[i]) values.push(degrees[i] as number);
	if (values.length === 0 || buckets < 2) return out;
	values.sort((x, y) => x - y);
	const thresholds = [0.2, 0.5, 0.8, 0.95, 0.99].slice(0, buckets - 1);
	const below = (d: number): number => {
		let lo = 0;
		let hi = values.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if ((values[mid] as number) < d) lo = mid + 1;
			else hi = mid;
		}
		return lo / values.length;
	};
	for (let i = 0; i < degrees.length; i++) {
		if (!alive[i]) continue;
		const share = below(degrees[i] as number);
		out[i] = Math.min(thresholds.filter((t) => share >= t).length, buckets - 1);
	}
	return out;
}

/** Control point of a gentle curve between two points; `side` (+1 or -1) picks which way it bows. */
export function curveControl(ax: number, ay: number, bx: number, by: number, side: number, bow = 0.14): { x: number; y: number } {
	const dx = bx - ax;
	const dy = by - ay;
	return { x: (ax + bx) / 2 - dy * bow * side, y: (ay + by) / 2 + dx * bow * side };
}

/** Point at `t` (0 to 1) on the quadratic curve a -> control -> b. */
export function quadPoint(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number): { x: number; y: number } {
	const u = 1 - t;
	return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
}

/** Which way a link bows, from its index: stable, and roughly half each way. */
export function curveSide(edgeIndex: number): number {
	return (Math.imul(edgeIndex, 2654435761) >>> 31) === 0 ? 1 : -1;
}

/** A fixed random choice of up to `want` distinct links that carry pulses. */
export function pickPulseEdges(edgeCount: number, want: number, seed: number): Int32Array {
	const n = Math.min(edgeCount, want);
	const chosen = new Set<number>();
	const rnd = seededRandom(seed);
	while (chosen.size < n) chosen.add(Math.floor(rnd() * edgeCount));
	return Int32Array.from([...chosen].sort((a, b) => a - b));
}

/** Position of a pulse along its link, 0 to 1, repeating. `offset` makes pulses start at different places. */
export function pulseT(timeSeconds: number, offset: number, speed = 0.45): number {
	const t = timeSeconds * speed + offset;
	return t - Math.floor(t);
}
