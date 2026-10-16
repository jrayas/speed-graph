import { compileExpression } from './expression';
import type { Pack, ShapeDef, Solid, Vec3 } from './pack';

/**
 * Turns a pack shape into target points: the places notes are pulled towards.
 * Every kind ends up as the same thing (a cloud of xyz triples), so the layout engine needs only one force.
 * Points are made with a seeded generator, so the same shape always gives the same cloud.
 */
export interface ShapePoints {
	/** x, y, z for each target point, within roughly -1.5 to 1.5. */
	points: Float32Array;
	/** For volume shapes with regions: the region of each point (255 = none). Otherwise null. */
	regionOf: Uint8Array | null;
	regionNames: string[];
}

export type ShapeResult = ({ ok: true } & ShapePoints) | { ok: false; error: string };

export const DEFAULT_TARGETS = 4000;

class Rng {
	private s: number;
	constructor(seed: number) {
		this.s = (seed >>> 0) || 1;
	}
	/** mulberry32: small, fast and good enough for scattering points. */
	next(): number {
		this.s = (this.s + 0x6d2b79f5) >>> 0;
		let t = this.s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	/** Roughly normal (sum of three uniforms), mean 0, spread about 0.5. */
	gauss(): number {
		return this.next() + this.next() + this.next() - 1.5;
	}
}

const seedOf = (id: string): number => {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
	return h >>> 0;
};

function sdfSolid(s: Solid, x: number, y: number, z: number): number {
	switch (s.type) {
		case 'sphere':
			return Math.hypot(x - s.at[0], y - s.at[1], z - s.at[2]) - s.radius;
		case 'ellipsoid': {
			// Scaled-space approximation: exact on the surface along the axes, good enough as a fill test.
			const k = Math.hypot((x - s.at[0]) / s.size[0], (y - s.at[1]) / s.size[1], (z - s.at[2]) / s.size[2]);
			return (k - 1) * Math.min(s.size[0], s.size[1], s.size[2]);
		}
		case 'capsule': {
			const [ax, ay, az] = s.from;
			const bax = s.to[0] - ax;
			const bay = s.to[1] - ay;
			const baz = s.to[2] - az;
			const len2 = bax * bax + bay * bay + baz * baz;
			const h = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * bax + (y - ay) * bay + (z - az) * baz) / len2));
			return Math.hypot(x - ax - bax * h, y - ay - bay * h, z - az - baz * h) - s.radius;
		}
		case 'box': {
			const r = s.round * Math.min(s.size[0], s.size[1], s.size[2]);
			const qx = Math.abs(x - s.at[0]) - s.size[0] + r;
			const qy = Math.abs(y - s.at[1]) - s.size[1] + r;
			const qz = Math.abs(z - s.at[2]) - s.size[2] + r;
			return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
		}
	}
}

/** Smooth union of solids: a polynomial blend, so joins are rounded by about `k`. */
function sdfUnion(solids: readonly Solid[], k: number, x: number, y: number, z: number): number {
	let d = Infinity;
	for (const s of solids) {
		const e = sdfSolid(s, x, y, z);
		if (!Number.isFinite(d)) {
			d = e;
		} else if (k <= 0) {
			d = Math.min(d, e);
		} else {
			const h = Math.max(k - Math.abs(d - e), 0) / k;
			d = Math.min(d, e) - h * h * k * 0.25;
		}
	}
	return d;
}

function solidBounds(solids: readonly Solid[]): { lo: Vec3; hi: Vec3 } {
	const lo: Vec3 = [Infinity, Infinity, Infinity];
	const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
	const grow = (c: Vec3, r: Vec3): void => {
		for (let i = 0; i < 3; i++) {
			lo[i] = Math.min(lo[i] as number, (c[i] as number) - (r[i] as number));
			hi[i] = Math.max(hi[i] as number, (c[i] as number) + (r[i] as number));
		}
	};
	for (const s of solids) {
		if (s.type === 'sphere') grow(s.at, [s.radius, s.radius, s.radius]);
		else if (s.type === 'ellipsoid' || s.type === 'box') grow(s.at, s.size);
		else {
			grow(s.from, [s.radius, s.radius, s.radius]);
			grow(s.to, [s.radius, s.radius, s.radius]);
		}
	}
	return { lo, hi };
}

/** Random points inside the smooth union of `solids` (rejection sampling in its bounding box). */
function fillSolids(solids: readonly Solid[], smooth: number, n: number, rng: Rng, out: number[]): number {
	const { lo, hi } = solidBounds(solids);
	const pad = smooth * 0.5;
	let made = 0;
	for (let tries = 0; made < n && tries < n * 400; tries++) {
		const x = lo[0] - pad + rng.next() * (hi[0] - lo[0] + 2 * pad);
		const y = lo[1] - pad + rng.next() * (hi[1] - lo[1] + 2 * pad);
		const z = lo[2] - pad + rng.next() * (hi[2] - lo[2] + 2 * pad);
		if (sdfUnion(solids, smooth, x, y, z) < 0) {
			out.push(x, y, z);
			made++;
		}
	}
	return made;
}

/** Rough volume of a union, for sharing the point budget between regions. */
function estimateVolume(solids: readonly Solid[], smooth: number, rng: Rng): number {
	const { lo, hi } = solidBounds(solids);
	const box = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
	let inside = 0;
	const samples = 600;
	for (let i = 0; i < samples; i++) {
		const x = lo[0] + rng.next() * (hi[0] - lo[0]);
		const y = lo[1] + rng.next() * (hi[1] - lo[1]);
		const z = lo[2] + rng.next() * (hi[2] - lo[2]);
		if (sdfUnion(solids, smooth, x, y, z) < 0) inside++;
	}
	return Math.max(box * (inside / samples), 1e-6);
}

function pointInPolygon(px: number, py: number, xs: Float64Array, ys: Float64Array): boolean {
	let inside = false;
	for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
		const xi = xs[i] as number;
		const yi = ys[i] as number;
		const xj = xs[j] as number;
		const yj = ys[j] as number;
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function finish(out: number[], regions: number[] | null, names: string[], what: string): ShapeResult {
	if (out.length < 9) return { ok: false, error: `${what} produced no usable points. Check the formula and ranges.` };
	return { ok: true, points: Float32Array.from(out), regionOf: regions ? Uint8Array.from(regions) : null, regionNames: names };
}

/** Builds the target points for one shape of a pack. `n` is the point budget (volume, spiral, implicit and filled shapes). */
export function compileShape(pack: Pack, shape: ShapeDef, paramValues: Readonly<Record<string, number>> = {}, n = DEFAULT_TARGETS): ShapeResult {
	const values: Record<string, number> = {};
	for (const p of pack.params) values[p.id] = p.default;
	Object.assign(values, paramValues);
	const rng = new Rng(seedOf(`${pack.id}/${shape.id}`));
	const out: number[] = [];

	switch (shape.kind) {
		case 'points': {
			for (const p of shape.points) out.push(p[0], p[1], p[2]);
			return finish(out, null, [], 'The shape');
		}
		case 'spiral': {
			const { arms, twist, bulge, thickness } = shape;
			for (let i = 0; i < n; i++) {
				if (rng.next() < bulge) {
					// a rounded bulge at the centre
					out.push(rng.gauss() * 0.3, rng.gauss() * 0.3, rng.gauss() * 0.3 * (0.4 + thickness * 4));
					continue;
				}
				const r = Math.sqrt(rng.next()) * 1.3;
				const arm = Math.floor(rng.next() * arms);
				const angle = (arm / arms) * Math.PI * 2 + twist * r + rng.gauss() * (0.5 / (0.4 + r));
				const spread = rng.gauss() * 0.08 * (0.3 + r);
				out.push(Math.cos(angle) * r + spread, Math.sin(angle) * r + spread, rng.gauss() * thickness * (1.2 - r * 0.6));
			}
			return finish(out, null, [], 'The spiral');
		}
		case 'volume': {
			const groups: { solids: Solid[]; name: string }[] = [];
			if (shape.solids.length > 0) groups.push({ solids: shape.solids, name: '' });
			for (const r of shape.regions) groups.push({ solids: r.solids, name: r.name });
			const volumes = groups.map((g) => estimateVolume(g.solids, shape.smooth, rng));
			const total = volumes.reduce((a, b) => a + b, 0);
			const regions: number[] = [];
			let regionIndex = 0;
			groups.forEach((g, i) => {
				const share = Math.max(8, Math.round(((volumes[i] as number) / total) * n));
				const made = fillSolids(g.solids, shape.smooth, share, rng, out);
				const isRegion = g.name !== '';
				const tag = isRegion ? regionIndex : 255;
				if (isRegion) regionIndex++;
				for (let k = 0; k < made; k++) regions.push(tag);
			});
			return finish(out, shape.regions.length > 0 ? regions : null, shape.regions.map((r) => r.name), 'The volume');
		}
		case 'implicit': {
			const f = compileExpression(shape.value, ['x', 'y', 'z'], values);
			if (!f.ok) return { ok: false, error: f.error };
			const b = shape.bounds;
			const v = [0, 0, 0];
			for (let tries = 0, made = 0; made < n && tries < n * 120; tries++) {
				v[0] = (rng.next() * 2 - 1) * b;
				v[1] = (rng.next() * 2 - 1) * b;
				v[2] = (rng.next() * 2 - 1) * b;
				if (f.evaluate(v) < 0) {
					out.push(v[0], v[1], v[2]);
					made++;
				}
			}
			return finish(out, null, [], 'The solid formula (negative values mean inside; nothing was negative)');
		}
		case 'parametric': {
			const vars = shape.t ? ['t'] : ['u', 'v'];
			const fx = compileExpression(shape.x, vars, values);
			const fy = compileExpression(shape.y, vars, values);
			const fz = compileExpression(shape.z, vars, values);
			if (!fx.ok) return { ok: false, error: fx.error };
			if (!fy.ok) return { ok: false, error: fy.error };
			if (!fz.ok) return { ok: false, error: fz.error };
			const th = shape.thickness;
			if (shape.t) {
				const [t0, t1] = shape.t;
				const count = shape.samples;
				const xs = new Float64Array(count);
				const ys = new Float64Array(count);
				const arg = [0];
				for (let i = 0; i < count; i++) {
					arg[0] = t0 + ((t1 - t0) * i) / count;
					xs[i] = fx.evaluate(arg);
					ys[i] = fy.evaluate(arg);
				}
				if (shape.fill) {
					if (![...xs, ...ys].every(Number.isFinite)) return { ok: false, error: 'The outline has points with no value.' };
					const { depth, falloff } = shape.fill;
					let minX = Infinity;
					let maxX = -Infinity;
					let minY = Infinity;
					let maxY = -Infinity;
					for (let i = 0; i < count; i++) {
						minX = Math.min(minX, xs[i] as number);
						maxX = Math.max(maxX, xs[i] as number);
						minY = Math.min(minY, ys[i] as number);
						maxY = Math.max(maxY, ys[i] as number);
					}
					// distance to the outline is measured against a thinned copy of it, which is plenty for a smooth pillow
					const step = Math.max(1, Math.floor(count / 400));
					for (let tries = 0, made = 0; made < n && tries < n * 60; tries++) {
						const px = minX + rng.next() * (maxX - minX);
						const py = minY + rng.next() * (maxY - minY);
						if (!pointInPolygon(px, py, xs, ys)) continue;
						let d2 = Infinity;
						for (let i = 0; i < count; i += step) d2 = Math.min(d2, ((xs[i] as number) - px) ** 2 + ((ys[i] as number) - py) ** 2);
						const half = depth * Math.sqrt(Math.min(1, Math.sqrt(d2) / falloff));
						out.push(px, py, (rng.next() * 2 - 1) * half);
						made++;
					}
					return finish(out, null, [], 'The filled outline');
				}
				const arg2 = [0];
				for (let i = 0; i < count; i++) {
					arg2[0] = t0 + ((t1 - t0) * i) / count;
					const x = fx.evaluate(arg2);
					const y = fy.evaluate(arg2);
					const z = fz.evaluate(arg2);
					if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push(x + rng.gauss() * th, y + rng.gauss() * th, z + rng.gauss() * th);
				}
				return finish(out, null, [], 'The curve');
			}
			const [u0, u1] = shape.u as [number, number];
			const [v0, v1] = shape.v as [number, number];
			const arg = [0, 0];
			for (let i = 0; i < shape.samples; i++) {
				arg[0] = u0 + rng.next() * (u1 - u0);
				arg[1] = v0 + rng.next() * (v1 - v0);
				const x = fx.evaluate(arg);
				const y = fy.evaluate(arg);
				const z = fz.evaluate(arg);
				if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push(x + rng.gauss() * th, y + rng.gauss() * th, z + rng.gauss() * th);
			}
			return finish(out, null, [], 'The surface');
		}
	}
}

/** How far out most of the shape reaches: the distance from the origin that 95% of the points are within (x and y only for the flat view). */
export function shapeExtent(points: Float32Array, dims: 2 | 3): number {
	const count = Math.floor(points.length / 3);
	if (count === 0) return 1;
	const d = new Float64Array(count);
	for (let i = 0; i < count; i++) d[i] = Math.hypot(points[3 * i] as number, points[3 * i + 1] as number, dims === 3 ? (points[3 * i + 2] as number) : 0);
	d.sort();
	return Math.max(0.05, d[Math.min(count - 1, Math.floor(count * 0.95))] as number);
}

/**
 * Turns a shape that was drawn standing up (x right, y up, z depth) so it lies flat in 3D (x right, z away, y up).
 * A galaxy is a disc; seen in 3D it should lie like a plate, not stand like a wall.
 */
export function layFlat(points: Float32Array): Float32Array {
	const out = new Float32Array(points.length);
	for (let i = 0; i + 2 < points.length; i += 3) {
		out[i] = points[i] as number;
		out[i + 1] = points[i + 2] as number;
		out[i + 2] = -(points[i + 1] as number);
	}
	return out;
}
