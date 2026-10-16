/**
 * Drift: a gentle, endless wandering of every note, so a settled graph feels alive instead of frozen.
 *
 * It is applied only when the graph is DRAWN. The layout engine never hears about it, so the real
 * positions, the saved layout, the shapes and dragging are untouched, and it cannot make the layout
 * wander off or "break". Each note follows its own slow path made from two sine waves at unrelated
 * rates; the size is a few pixels on screen and the speed is slow (a full wander takes several seconds).
 *
 * The formula lives here (for the flat view, the labels and the tests) and is repeated in the 3D
 * shaders (render/renderer3d.ts); keep the two in step.
 */
export interface DriftSettings {
	enabled: boolean;
	/** 0 to 1: how far each note wanders (about 1 to 7 pixels). */
	amount: number;
	/** 0 to 1: how fast (a wander takes about 25 seconds at 0 and 4 seconds at 1). */
	speed: number;
}

export const DEFAULT_DRIFT: DriftSettings = { enabled: false, amount: 0.4, speed: 0.4 };
export const DRIFT_AMOUNT_RANGE = [0, 1, 0.05] as const;
export const DRIFT_SPEED_RANGE = [0, 1, 0.05] as const;

/** Floats per note in the seed array: x, y, z phases, the first rate, then x, y, z phases for the second wave and its rate. */
export const DRIFT_SEED_STRIDE = 8;

/** Biggest distance a note moves from its real place, in pixels. */
export function driftAmplitudePx(amount: number): number {
	const a = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
	return a === 0 ? 0 : 1 + 6 * a;
}

/** Angular speed in radians per second. */
export function driftOmega(speed: number): number {
	const s = Number.isFinite(speed) ? Math.min(1, Math.max(0, speed)) : 0;
	return 2 * Math.PI * (0.04 + 0.21 * s);
}

/** Repeatable pseudo-random numbers from 0 up to 1 (mulberry32). */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fixed random phases and rates for `count` notes. The same note always gets the same ones. */
export function makeDriftSeeds(count: number): Float32Array {
	const out = new Float32Array(count * DRIFT_SEED_STRIDE);
	for (let i = 0; i < count; i++) {
		const next = rng(i * 2654435761 + 12345);
		const o = i * DRIFT_SEED_STRIDE;
		for (let k = 0; k < 3; k++) out[o + k] = next() * Math.PI * 2;
		out[o + 3] = 0.75 + 0.5 * next();
		for (let k = 4; k < 7; k++) out[o + k] = next() * Math.PI * 2;
		out[o + 7] = 0.75 + 0.5 * next();
	}
	return out;
}

/** The note's offset as a share of the amplitude, each of x, y, z from -1 to 1, written to `out`. */
export function driftUnit(seeds: Float32Array, id: number, seconds: number, omega: number, out: Float32Array | number[]): void {
	const o = id * DRIFT_SEED_STRIDE;
	if (!(o >= 0 && o + DRIFT_SEED_STRIDE <= seeds.length) || !Number.isFinite(seconds)) {
		out[0] = 0;
		out[1] = 0;
		out[2] = 0;
		return;
	}
	const a = seconds * omega * (seeds[o + 3] as number);
	const b = seconds * omega * 1.73 * (seeds[o + 7] as number);
	for (let k = 0; k < 3; k++) out[k] = 0.62 * Math.sin(a + (seeds[o + k] as number)) + 0.38 * Math.sin(b + (seeds[o + 4 + k] as number));
}

export function mergeDrift(raw: { enabled?: unknown; amount?: unknown; speed?: unknown } | null | undefined): DriftSettings {
	const out = { ...DEFAULT_DRIFT };
	if (!raw) return out;
	if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
	if (typeof raw.amount === 'number' && Number.isFinite(raw.amount)) out.amount = Math.min(1, Math.max(0, raw.amount));
	if (typeof raw.speed === 'number' && Number.isFinite(raw.speed)) out.speed = Math.min(1, Math.max(0, raw.speed));
	return out;
}
