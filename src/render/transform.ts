/** screen = world * k + (x, y). */
export interface ViewTransform {
	x: number;
	y: number;
	k: number;
}

export const MIN_ZOOM = 0.005;
export const MAX_ZOOM = 40;

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export function clampZoom(k: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

export function screenToWorld(t: ViewTransform, sx: number, sy: number): { x: number; y: number } {
	return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
}

/** Zooms by `factor`, keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(t: ViewTransform, sx: number, sy: number, factor: number): ViewTransform {
	const k = clampZoom(t.k * factor);
	const world = screenToWorld(t, sx, sy);
	return { k, x: sx - world.x * k, y: sy - world.y * k };
}

/**
 * Bounds of the alive nodes, or null if there are none. With `trim` above 0, the
 * lowest and highest `trim` share of x and of y values are ignored, so a few far
 * outliers (such as unlinked notes pushed out by the repel force) do not shrink the view.
 */
export function computeBounds(positions: Float32Array, alive: Uint8Array, trim = 0): Bounds | null {
	const count = Math.min(alive.length, positions.length / 2);
	if (trim > 0) {
		const xs: number[] = [];
		const ys: number[] = [];
		for (let i = 0; i < count; i++) {
			if (!alive[i]) continue;
			xs.push(positions[2 * i] as number);
			ys.push(positions[2 * i + 1] as number);
		}
		if (xs.length === 0) return null;
		const fx = Float32Array.from(xs).sort();
		const fy = Float32Array.from(ys).sort();
		const lo = Math.floor(fx.length * trim);
		const hi = Math.max(lo, Math.ceil(fx.length * (1 - trim)) - 1);
		return { minX: fx[lo] as number, maxX: fx[hi] as number, minY: fy[lo] as number, maxY: fy[hi] as number };
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let i = 0; i < count; i++) {
		if (!alive[i]) continue;
		const x = positions[2 * i] as number;
		const y = positions[2 * i + 1] as number;
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/**
 * A transform that centres `bounds` in a width x height viewport with padding. `maxZoom` stops
 * a small graph (such as a local graph) from being blown up until its nodes fill the screen.
 */
export function fitBounds(bounds: Bounds, width: number, height: number, padding: number, maxZoom = MAX_ZOOM): ViewTransform {
	const w = Math.max(bounds.maxX - bounds.minX, 1);
	const h = Math.max(bounds.maxY - bounds.minY, 1);
	const k = Math.min(clampZoom(Math.min((width - 2 * padding) / w, (height - 2 * padding) / h)), maxZoom);
	const cx = (bounds.minX + bounds.maxX) / 2;
	const cy = (bounds.minY + bounds.maxY) / 2;
	return { k, x: width / 2 - cx * k, y: height / 2 - cy * k };
}
