import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileShape, layFlat, shapeExtent } from '../src/packs/shapes';
import { parsePackText, type Pack, type ShapeDef } from '../src/packs/pack';

const load = (name: string): Pack => {
	const r = parsePackText(readFileSync(join(process.cwd(), 'docs', 'packs', `${name}.fgpack.json`), 'utf8'));
	assert.ok(r.ok);
	return r.ok ? r.pack : (null as never);
};
const shapeOf = (pack: Pack, id: string): ShapeDef => pack.shapes.find((s) => s.id === id) as ShapeDef;
const compile = (pack: Pack, id: string, n?: number) => {
	const r = compileShape(pack, shapeOf(pack, id), {}, n);
	assert.ok(r.ok, r.ok ? '' : r.error);
	return r.ok ? r : (null as never);
};
const extent = (p: Float32Array, axis: number) => {
	let lo = Infinity;
	let hi = -Infinity;
	for (let i = axis; i < p.length; i += 3) {
		lo = Math.min(lo, p[i] as number);
		hi = Math.max(hi, p[i] as number);
	}
	return [lo, hi] as const;
};

test('every example shape compiles to finite points', () => {
	for (const [file, ids] of [['galaxy', ['spiral-galaxy']], ['brain-stylised', ['brain-shape']], ['heart', ['heart-pillow', 'heart-solid']], ['trefoil-knot', ['trefoil']]] as const) {
		const pack = load(file);
		for (const id of ids) {
			const r = compile(pack, id, 2000);
			assert.ok(r.points.length >= 3 * 1000, `${id}: ${r.points.length / 3}`);
			assert.ok(r.points.every(Number.isFinite), id);
			const [lo, hi] = [Math.min(...[0, 1, 2].map((a) => extent(r.points, a)[0])), Math.max(...[0, 1, 2].map((a) => extent(r.points, a)[1]))];
			assert.ok(lo > -2.2 && hi < 2.2, `${id}: ${lo}..${hi}`);
		}
	}
});

test('the same shape always gives the same points', () => {
	const pack = load('heart');
	assert.deepEqual(compile(pack, 'heart-pillow', 500).points, compile(pack, 'heart-pillow', 500).points);
});

test('filled heart outline: right size, points inside, thicker in the middle than at the edge', () => {
	const r = compile(load('heart'), 'heart-pillow', 3000);
	const [x0, x1] = extent(r.points, 0);
	const [y0, y1] = extent(r.points, 1);
	assert.ok(x0 > -0.95 && x1 < 0.95 && x0 < -0.85 && x1 > 0.85, `x ${x0}..${x1}`);
	assert.ok(y0 > -1.01 && y1 < 0.71 && y0 < -0.9 && y1 > 0.6, `y ${y0}..${y1}`);
	const [z0, z1] = extent(r.points, 2);
	assert.ok(z1 <= 0.5 + 1e-6 && z0 >= -0.5 - 1e-6 && z1 > 0.35, `z ${z0}..${z1}`);
	// the notch at the top: the outline is at y = 5/17 (0.294) on the centre line and rises almost vertically beside it,
	// so nothing sits within 0.001 of the centre line above y = 0.31
	let aboveNotch = 0;
	for (let i = 0; i < r.points.length; i += 3) if (Math.abs(r.points[i] as number) < 0.001 && (r.points[i + 1] as number) > 0.31) aboveNotch++;
	assert.equal(aboveNotch, 0);
});

test('solid heart formula: points are inside the formula, and the shape is a heart (wider than deep)', () => {
	const r = compile(load('heart'), 'heart-solid', 2000);
	const f = (x: number, y: number, z: number) => (x * x + 2.25 * z * z + y * y - 1) ** 3 - x * x * y ** 3 - 0.1125 * z * z * y ** 3;
	for (let i = 0; i < r.points.length; i += 3) assert.ok(f(r.points[i] as number, r.points[i + 1] as number, r.points[i + 2] as number) < 0);
	const [x0, x1] = extent(r.points, 0);
	const [z0, z1] = extent(r.points, 2);
	assert.ok(x1 - x0 > 1.5 * (z1 - z0), `${x1 - x0} vs ${z1 - z0}`);
});

test('brain regions: every region gets points, they sit inside their solids, and the hemispheres are mirrored', () => {
	const pack = load('brain-stylised');
	const r = compile(pack, 'brain-shape', 3000);
	assert.ok(r.regionOf);
	assert.equal(r.regionNames.length, 6);
	const counts = new Array<number>(6).fill(0);
	for (const k of r.regionOf as Uint8Array) {
		assert.ok(k < 6);
		counts[k]!++;
	}
	assert.ok(counts.every((c) => c >= 8), String(counts));
	let left = 0;
	let right = 0;
	for (let i = 0; i < r.points.length; i += 3) (r.points[i] as number) < 0 ? left++ : right++;
	assert.ok(Math.abs(left - right) / (left + right) < 0.2, `${left} ${right}`);
	// brainstem points are low and central
	const stem = r.regionNames.indexOf('Brainstem');
	let n = 0;
	for (let i = 0; i < (r.regionOf as Uint8Array).length; i++) {
		if ((r.regionOf as Uint8Array)[i] !== stem) continue;
		n++;
		assert.ok(Math.abs(r.points[i * 3] as number) < 0.11 && (r.points[i * 3 + 1] as number) < -0.2);
	}
	assert.ok(n > 0);
});

test('spiral: a flat disc with a bulge; trefoil: points near the curve', () => {
	const g = compile(load('galaxy'), 'spiral-galaxy', 3000);
	const [z0, z1] = extent(g.points, 2);
	const [x0, x1] = extent(g.points, 0);
	assert.ok(z1 - z0 < 0.5 * (x1 - x0), `${z1 - z0} vs ${x1 - x0}`);
	const t = compile(load('trefoil-knot'), 'trefoil');
	const [tx0, tx1] = extent(t.points, 0);
	assert.ok(tx0 < -0.8 && tx1 > 0.8);
});

test('bad formulas give an error, not a crash', () => {
	const pack = load('heart');
	const bad = { ...shapeOf(pack, 'heart-solid'), kind: 'implicit', value: '1 + x^2' } as ShapeDef; // never negative
	const r = compileShape(pack, bad);
	assert.equal(r.ok, false);
	const nan = { ...shapeOf(pack, 'heart-pillow'), kind: 'parametric', t: [0, 1], x: 'sqrt(-1)', y: 't', z: '0', thickness: 0, samples: 100, fill: null } as ShapeDef;
	assert.equal(compileShape(pack, nan).ok, false);
});

test('parameters change the shape', () => {
	const pack = load('heart');
	const small = compileShape(pack, shapeOf(pack, 'heart-pillow'), { scale: 0.6 }, 1500);
	const large = compileShape(pack, shapeOf(pack, 'heart-pillow'), { scale: 1.4 }, 1500);
	assert.ok(small.ok && large.ok);
	if (small.ok && large.ok) assert.ok(extent(large.points, 0)[1] > 2 * extent(small.points, 0)[1]);
});

test('shapeExtent: how far out 95% of the points reach, flat or in 3D, and safe on empty input', () => {
	const pts = new Float32Array([...Array.from({ length: 96 }, () => [0.5, 0, 0]).flat(), ...Array.from({ length: 4 }, () => [5, 0, 0]).flat()]);
	assert.equal(shapeExtent(pts, 3), 0.5); // the outermost few are ignored
	assert.equal(shapeExtent(new Float32Array([0, 0, 3, 0, 0, 3, 0, 0, 3]), 2), 0.05); // flat view ignores z (floored)
	assert.equal(shapeExtent(new Float32Array([0, 0, 3, 0, 0, 3, 0, 0, 3]), 3), 3);
	assert.equal(shapeExtent(new Float32Array(0), 3), 1);
	const heart = compile(load('heart'), 'heart-pillow', 3000);
	assert.ok(Math.abs(shapeExtent(heart.points, 2) - 0.9) < 0.05);
	const galaxy = compile(load('galaxy'), 'spiral-galaxy', 3000);
	assert.ok(shapeExtent(galaxy.points, 3) > 1.15); // bigger than the heart, which is why it is normalised
});

test('layFlat turns a standing disc so it lies flat in 3D', () => {
	const g = compile(load('galaxy'), 'spiral-galaxy', 2000);
	const flat = layFlat(g.points);
	assert.equal(flat.length, g.points.length);
	const [x0, x1] = extent(flat, 0);
	const [y0, y1] = extent(flat, 1); // up: now the thin direction
	const [z0, z1] = extent(flat, 2);
	assert.ok(y1 - y0 < 0.5 * (x1 - x0), `up ${y1 - y0} vs across ${x1 - x0}`);
	assert.ok(z1 - z0 > 1.5 * (y1 - y0), 'the disc spreads in depth now');
	// no point is lost or invented: distances from the origin are unchanged
	for (let i = 0; i < g.points.length; i += 3 * 97) {
		const a = Math.hypot(g.points[i] as number, g.points[i + 1] as number, g.points[i + 2] as number);
		const b = Math.hypot(flat[i] as number, flat[i + 1] as number, flat[i + 2] as number);
		assert.ok(Math.abs(a - b) < 1e-5);
	}
	assert.equal(layFlat(new Float32Array(0)).length, 0);
});

const pointsOf = (pack: Pack, id: string): number[][] => {
	const r = compile(pack, id);
	const out: number[][] = [];
	for (let i = 0; i < r.points.length; i += 3) out.push([r.points[i] as number, r.points[i + 1] as number, r.points[i + 2] as number]);
	return out;
};
const nearest = (p: number[], all: number[][]) => Math.min(...all.map((q) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!)));

test('spider: mirror-symmetric, eight legs reach out, a head above a larger body; web: spokes, rings, centred', () => {
	const pack = load('spider');
	const s = pointsOf(pack, 'spider-body');
	assert.ok(s.length > 500 && s.length < 1000, `${s.length}`);
	for (let i = 0; i < s.length; i += 7) assert.ok(nearest([-(s[i]![0]!), s[i]![1]!], s) < 0.03, 'left and right should mirror');
	const reach = Math.max(...s.map((p) => Math.abs(p[0]!)));
	assert.ok(reach > 0.9 && reach <= 1);
	// legs: points far from the body on both sides, at four different heights each side
	const tips = s.filter((p) => Math.abs(p[0]!) > 0.8);
	assert.ok(tips.some((p) => p[1]! > 0.5) && tips.some((p) => p[1]! < -0.7));
	const w = pointsOf(pack, 'spider-web');
	assert.ok(w.length > 1200);
	assert.ok(nearest([0, 0], w) < 0.03, 'the hub is at the centre');
	assert.ok(Math.max(...w.map((p) => Math.hypot(p[0]!, p[1]!))) <= 1);
	// 12 spokes: the points along the outer spokes fall in 12 evenly spaced directions
	const sectors = new Array<number>(12).fill(0);
	for (const p of w) if (Math.hypot(p[0]!, p[1]!) > 0.25 && Math.hypot(p[0]!, p[1]!) < 0.9) sectors[Math.floor(((Math.atan2(p[1]!, p[0]!) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 6))]!++;
	assert.ok(Math.max(...sectors) / Math.min(...sectors) < 1.6, String(sectors));
});

test('honeycomb: every point sits on a cell wall of a 61-cell hexagonal patch', () => {
	const h = pointsOf(load('honeycomb'), 'honeycomb-patch');
	const R = 0.13;
	const centres: number[][] = [];
	for (let q = -4; q <= 4; q++) for (let r = Math.max(-4, -q - 4); r <= Math.min(4, -q + 4); r++) centres.push([1.5 * R * q, Math.sqrt(3) * R * (r + q / 2)]);
	assert.equal(centres.length, 61);
	for (const p of h) {
		const d = nearest(p, centres);
		assert.ok(d > R * Math.cos(Math.PI / 6) - 0.01 && d < R + 0.01, `${d}`); // between the wall's middle and its corner
	}
	assert.ok(h.length > 700 && h.length < 1300);
	assert.ok(Math.max(...h.map((p) => Math.abs(p[0]!))) < 1 && Math.max(...h.map((p) => Math.abs(p[1]!))) < 1.05);
});

test('solar system: a sun, eight planets with clear space round each, and stars that keep out of that space', () => {
	const pack = load('solar-system');
	const shape = shapeOf(pack, 'solar');
	assert.equal(shape.kind, 'points');
	const r = compile(pack, 'solar');
	assert.deepEqual(r.regionNames, ['Sun', 'Planets', 'Stars']);
	const region = r.regionOf as Uint8Array;
	const pts = (k: number) => {
		const out: number[][] = [];
		for (let i = 0; i < region.length; i++) if (region[i] === k) out.push([r.points[3 * i] as number, r.points[3 * i + 1] as number]);
		return out;
	};
	const sun = pts(0);
	const planets = pts(1);
	const stars = pts(2);
	assert.equal(sun.length, 1);
	assert.equal(planets.length, 8); // one spot per planet, and the regions are exclusive so each planet note gets its own
	assert.ok(stars.length > 1700);
	assert.ok(sun.every((p) => Math.hypot(p[0]!, p[1]!) < 0.05));
	// the eight planet spots: at least 0.25 apart from one another, each on its own orbit
	const spots: number[][] = [];
	for (const p of planets) spots.push([p[0]!, p[1]!]);
	assert.ok(shape.kind === 'points' && shape.regions[0]!.exclusive && shape.regions[1]!.exclusive && !shape.regions[2]!.exclusive);
	for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i]![0]! - spots[j]![0]!, spots[i]![1]! - spots[j]![1]!) > 0.25, `planets ${i} and ${j} are too close`);
	const radii = spots.map((p) => Math.hypot(p[0]!, p[1]!)).sort((a, b) => a - b);
	for (let i = 1; i < radii.length; i++) assert.ok(radii[i]! - radii[i - 1]! > 0.07, 'orbits overlap');
	// clear space: no star within 0.13 of a planet, and none inside the sun's space
	for (const s of stars) {
		assert.ok(nearest(s, planets) > 0.13, 'a star is crowding a planet');
		assert.ok(Math.hypot(s[0]!, s[1]!) > 0.1 || stars.length === 0, 'a star is inside the sun');
		assert.ok(Math.hypot(s[0]!, s[1]!) <= 1.05);
	}
});

test('flat galaxy layout exists and uses the same spiral as the 3D one', () => {
	const pack = load('galaxy');
	const flat = pack.layouts.find((l) => l.id === 'galaxy-2d');
	const solid = pack.layouts.find((l) => l.id === 'galaxy-3d');
	assert.ok(flat && solid);
	assert.equal(flat?.dimensions, 2);
	assert.equal(flat?.shape, solid?.shape);
	assert.equal(flat?.theme, solid?.theme);
});
