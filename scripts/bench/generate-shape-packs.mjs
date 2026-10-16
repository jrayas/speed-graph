// Draws the 2D example packs as data: spider and spider web, honeycomb, solar system, arc reactor.
// Repeatable (seeded). Usage: node bench/generate-shape-packs.mjs   (writes docs/packs/*.fgpack.json)
// Coordinates: x right, y up, roughly within -1 and 1 (the plugin flips y for the flat view).
import { writeFileSync, readFileSync } from 'node:fs';
const out = new URL('../docs/packs/', import.meta.url);
const r3 = (v) => Math.round(v * 1000) / 1000;
const pt = (x, y) => [r3(x), r3(y), 0];
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Points every `step` along a polyline. */
function along(poly, step) {
	const pts = [];
	for (let i = 0; i + 1 < poly.length; i++) {
		const a = poly[i], b = poly[i + 1], n = Math.max(1, Math.round(dist(a, b) / step));
		for (let k = 0; k < n; k++) pts.push(pt(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
	}
	const last = poly[poly.length - 1];
	pts.push(pt(last[0], last[1]));
	return pts;
}
/** Points on a grid inside an ellipse. */
function fillEllipse(cx, cy, rx, ry, step) {
	const pts = [];
	for (let y = cy - ry; y <= cy + ry; y += step) for (let x = cx - rx; x <= cx + rx; x += step) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) pts.push(pt(x, y));
	return pts;
}
const dedupe = (pts, eps = 0.012) => { const keep = []; for (const p of pts) if (!keep.some((q) => dist(p, q) < eps)) keep.push(p); return keep; };

const base = (id, name, description, extra) => ({ format: 'fast-graph-pack', version: 1, id, name, author: 'Fast Graph', license: '0BSD', description, ...extra });
const forces = (over = {}) => ({ centre: 0.2, repel: 5, link: 0.2, linkDistance: 30, gravity: 0.05, shapeStrength: 1, ...over });

// ---------------- spider and spider web ----------------
{
	// the spider: a head, a body and eight jointed legs (four each side)
	const legs = [
		[[0.1, 0.14], [0.45, 0.55], [0.9, 0.62]],
		[[0.12, 0.08], [0.6, 0.38], [0.95, 0.18]],
		[[0.12, 0.0], [0.62, 0.0], [0.95, -0.35]],
		[[0.1, -0.08], [0.5, -0.4], [0.8, -0.85]],
	];
	const spider = [];
	for (const leg of legs) for (const sx of [1, -1]) spider.push(...along(leg.map(([x, y]) => [x * sx, y]), 0.022));
	spider.push(...fillEllipse(0, 0.2, 0.14, 0.14, 0.03)); // head
	spider.push(...fillEllipse(0, -0.2, 0.22, 0.32, 0.032)); // body
	const spiderPts = dedupe(spider);
	// the web: 12 spokes and 9 rings that sag between the spokes
	const spokes = 12, web = [];
	for (let k = 0; k < spokes; k++) { const a = (k / spokes) * Math.PI * 2; web.push(...along([[0, 0], [Math.cos(a) * 0.96, Math.sin(a) * 0.96]], 0.026)); }
	for (let ring = 1; ring <= 9; ring++) {
		const radius = 0.1 + ring * 0.095;
		for (let k = 0; k < spokes; k++) {
			const a0 = (k / spokes) * Math.PI * 2, a1 = ((k + 1) / spokes) * Math.PI * 2, n = Math.max(2, Math.round(((radius * (a1 - a0)) / 0.026)));
			for (let i = 0; i < n; i++) { const s = i / n, a = a0 + (a1 - a0) * s, rr = radius * (1 - 0.07 * Math.sin(Math.PI * s)); web.push(pt(Math.cos(a) * rr, Math.sin(a) * rr)); }
		}
	}
	const webPts = dedupe(web, 0.014);
	const pack = base('spider', 'Spider', 'A spider (head, body and eight legs) and a spider web, as flat shapes. Notes line up along the legs and the silk.', {
		themes: [{ id: 'silk', name: 'Silk', base: '#070b14', nodeColours: ['#8a97b5', '#a9b6d4', '#c9d3ea', '#e3e9f6', '#ffffff', '#ffe9a8'], link: { colour: '#9fb2d8', alpha: 0.14, curved: false, pulses: false }, accent: '#ffffff', label: '#dfe6f5', glow: true, starfield: false, animated: true, backdrop: { colours: ['#16213a', '#101a30'], seed: 5 } }],
		shapes: [
			{ id: 'spider-body', name: 'Spider', kind: 'points', points: spiderPts },
			{ id: 'spider-web', name: 'Spider web', kind: 'points', points: webPts },
		],
		layouts: [
			{ id: 'spider-2d', name: 'Spider (2D)', dimensions: 2, shape: 'spider-body', theme: 'silk', guide: true, forces: forces({ repel: 6 }) },
			{ id: 'web-2d', name: 'Spider web (2D)', dimensions: 2, shape: 'spider-web', theme: 'silk', guide: true, forces: forces({ repel: 3, link: 0.1 }) },
		],
	});
	writeFileSync(new URL('spider.fgpack.json', out), JSON.stringify(pack, null, 1) + '\n');
	console.log('spider', spiderPts.length, 'web', webPts.length);
}

// ---------------- honeycomb ----------------
{
	const R = 0.13, K = 4, cells = [];
	for (let q = -K; q <= K; q++) for (let r = Math.max(-K, -q - K); r <= Math.min(K, -q + K); r++) cells.push([1.5 * R * q, Math.sqrt(3) * R * (r + q / 2)]);
	const walls = [];
	for (const [cx, cy] of cells) {
		const corner = (i) => [cx + R * Math.cos((Math.PI / 3) * i), cy + R * Math.sin((Math.PI / 3) * i)];
		for (let i = 0; i < 6; i++) walls.push(...along([corner(i), corner(i + 1)], 0.026));
	}
	const pts = dedupe(walls, 0.014);
	const pack = base('honeycomb', 'Honeycomb', 'A patch of honeycomb: notes sit on the cell walls.', {
		themes: [{ id: 'honey', name: 'Honey', base: '#140c03', nodeColours: ['#b57a1c', '#d99a2b', '#f2b84b', '#ffd36a', '#ffe8a3', '#fff6d6'], link: { colour: '#e0a23a', alpha: 0.16, curved: false, pulses: false }, accent: '#fff1b8', label: '#ffe9bd', glow: true, starfield: false, animated: true, backdrop: { colours: ['#3a2409', '#2a1a06'], seed: 9 } }],
		shapes: [{ id: 'honeycomb-patch', name: 'Honeycomb', kind: 'points', points: pts }],
		layouts: [{ id: 'honeycomb-2d', name: 'Honeycomb (2D)', dimensions: 2, shape: 'honeycomb-patch', theme: 'honey', guide: true, forces: forces({ repel: 3, link: 0.1 }) }],
	});
	writeFileSync(new URL('honeycomb.fgpack.json', out), JSON.stringify(pack, null, 1) + '\n');
	console.log('honeycomb cells', cells.length, 'points', pts.length);
}

// ---------------- solar system ----------------
{
	const rand = rng(77);
	const orbits = [0.2, 0.32, 0.45, 0.58, 0.7, 0.81, 0.91, 0.99];
	// each planet sits on its own orbit, spread round the sun by the golden angle so none are near each other
	const planets = orbits.map((radius, i) => { const a = i * 2.39996 + 0.6; return [radius * Math.cos(a), radius * Math.sin(a)]; });
	const planetPts = [];
	for (const [x, y] of planets) planetPts.push(pt(x, y)); // one spot per planet: each planet note gets its own
	const sunPts = [pt(0, 0)];
	const stars = [];
	// stars lining each orbit
	for (const radius of orbits) { const n = Math.round((2 * Math.PI * radius) / 0.075); for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rand() * 0.02; stars.push(pt(Math.cos(a) * radius, Math.sin(a) * radius)); } }
	// and a scatter of stars between, with a clear space round the sun and every planet
	let tries = 0;
	while (stars.length < 1900 && tries++ < 200000) {
		const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 1.02, p = [Math.cos(a) * d, Math.sin(a) * d];
		if (Math.hypot(p[0], p[1]) < 0.13) continue;
		if (planets.some((q) => dist(p, q) < 0.14)) continue;
		stars.push(pt(p[0], p[1]));
	}
	const starPts = stars.filter((s) => !planets.some((q) => dist(s, q) < 0.14));
	const pack = base('solar-system', 'Solar system', 'Your most-connected notes become the sun and eight planets, each on its own orbit with clear space around it; every other note is a star.', {
		themes: [{ id: 'space', name: 'Space', base: '#02030a', nodeColours: ['#5f6d92', '#8397c9', '#c6d4ff', '#fff3c4', '#ffb35c', '#ff7a3d'], link: { colour: '#4a5a8a', alpha: 0.07, curved: false, pulses: false }, accent: '#ffe9a8', label: '#e8eeff', glow: true, starfield: true, animated: true, backdrop: { colours: ['#161047', '#0a2a55', '#3a1245'], seed: 31 } }],
		shapes: [{ id: 'solar', name: 'Solar system', kind: 'points', points: [], regions: [
			{ name: 'Sun', match: 'top:1', exclusive: true, points: sunPts },
			{ name: 'Planets', match: 'top:9', exclusive: true, points: planetPts },
			{ name: 'Stars', match: 'degree>=0', points: starPts },
		] }],
		layouts: [{ id: 'solar-2d', name: 'Solar system (2D)', dimensions: 2, shape: 'solar', theme: 'space', forces: forces({ repel: 6, link: 0.1, gravity: 0.03 }) }],
	});
	writeFileSync(new URL('solar-system.fgpack.json', out), JSON.stringify(pack, null, 1) + '\n');
	console.log('solar: sun', sunPts.length, 'planets', planets.length, 'planet points', planetPts.length, 'stars', starPts.length);
}

// ---------------- arc reactor ----------------
{
	const circle = (radius, step = 0.022) => { const n = Math.max(12, Math.round((2 * Math.PI * radius) / step)); return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return pt(Math.cos(a) * radius, Math.sin(a) * radius); }); };
	const polar = (radius, angle) => [Math.cos(angle) * radius, Math.sin(angle) * radius];
	const arc = (radius, a0, a1, step = 0.022) => { const n = Math.max(2, Math.round((radius * Math.abs(a1 - a0)) / step)); return Array.from({ length: n + 1 }, (_, i) => pt(...polar(radius, a0 + ((a1 - a0) * i) / n))); };
	const frame = [];
	frame.push(...circle(0.96), ...circle(0.9)); // the double outer ring
	frame.push(...circle(0.4), ...circle(0.34)); // the double inner ring
	frame.push(...circle(0.2, 0.026)); // the core
	frame.push(...along([0, 1, 2, 3].map((i) => polar(0.3, Math.PI / 2 + (i % 3) * ((2 * Math.PI) / 3))), 0.022)); // the triangle inside
	const coilCentres = [];
	for (let k = 0; k < 10; k++) {
		const mid = Math.PI / 2 - (k * 2 * Math.PI) / 10, half = (12 * Math.PI) / 180; // ten coil blocks, 24 degrees wide with a gap between
		const rIn = 0.5, rOut = 0.8;
		frame.push(...arc(rIn, mid - half, mid + half), ...arc(rOut, mid - half, mid + half));
		frame.push(...along([polar(rIn, mid - half), polar(rOut, mid - half)], 0.022), ...along([polar(rIn, mid + half), polar(rOut, mid + half)], 0.022));
		coilCentres.push(pt(...polar(0.65, mid)));
	}
	const framePts = dedupe(frame, 0.012);
	const pack = base('arc-reactor', 'Arc reactor', 'An arc reactor: a double outer ring, ten coil blocks, an inner ring and a glowing core. Your most-connected note is the core and the next ten sit on the coils; every other note lines the rings.', {
		themes: [{ id: 'reactor', name: 'Reactor', base: '#01070d', nodeColours: ['#0f4c63', '#1b88a8', '#46d4ff', '#9be9ff', '#e6fbff', '#ffffff'], link: { colour: '#37c8f5', alpha: 0.12, curved: false, pulses: false }, accent: '#bff3ff', label: '#d6f6ff', glow: true, starfield: false, animated: true, backdrop: { colours: ['#052a3d', '#031a2a'], seed: 12 } }],
		shapes: [{ id: 'reactor-frame', name: 'Arc reactor', kind: 'points', points: [], regions: [
			{ name: 'Core', match: 'top:1', exclusive: true, points: [pt(0, 0)] },
			{ name: 'Coils', match: 'top:11', exclusive: true, points: coilCentres },
			{ name: 'Rings', match: 'degree>=0', points: framePts },
		] }],
		layouts: [{ id: 'arc-reactor-2d', name: 'Arc reactor (2D)', dimensions: 2, shape: 'reactor-frame', theme: 'reactor', guide: true, forces: forces({ repel: 3, link: 0.1, gravity: 0.03 }) }],
	});
	writeFileSync(new URL('arc-reactor.fgpack.json', out), JSON.stringify(pack, null, 1) + '\n');
	console.log('arc reactor: ring points', framePts.length, 'coil spots', coilCentres.length);
}

// ---------------- spiral galaxy, flat ----------------
{
	const file = new URL('galaxy.fgpack.json', out);
	const pack = JSON.parse(readFileSync(file, 'utf8'));
	if (!pack.layouts.some((l) => l.id === 'galaxy-2d')) pack.layouts.push({ id: 'galaxy-2d', name: 'Galaxy (2D)', dimensions: 2, shape: 'spiral-galaxy', theme: 'galaxy-theme', forces: { ...pack.layouts[0].forces } });
	writeFileSync(file, JSON.stringify(pack, null, 2) + '\n');
	console.log('galaxy layouts', pack.layouts.map((l) => l.id).join(', '));
}
