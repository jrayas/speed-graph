import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACK_LIMITS, parsePackText, themeToSkin, validatePack } from '../src/packs/pack';
import { SKINS } from '../src/render/skins';

const minimal = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	format: 'speed-graph-pack',
	version: 1,
	id: 'p',
	layouts: [{ id: 'l' }],
	...extra,
});
const theme = (over: Record<string, unknown> = {}) => ({ id: 't', nodeColours: ['#112233', '#445566'], ...over });
const shape = (over: Record<string, unknown>) => ({ id: 's', ...over });
const errs = (raw: unknown) => {
	const r = validatePack(raw);
	assert.equal(r.ok, false, 'expected the pack to be rejected');
	return r.ok ? [] : r.errors;
};
const has = (list: { path: string; message: string }[], path: string, re: RegExp) => list.some((e) => e.path === path && re.test(e.message));
const ok = (raw: unknown) => {
	const r = validatePack(raw);
	assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.errors));
	return r.ok ? r : (null as never);
};

test('every example pack in docs/packs is valid, with no warnings', () => {
	const dir = join(process.cwd(), 'docs', 'packs');
	const files = readdirSync(dir).filter((f) => f.endsWith('.fgpack.json'));
	assert.ok(files.length >= 4, `found ${files.length}`);
	for (const f of files) {
		const r = parsePackText(readFileSync(join(dir, f), 'utf8'));
		assert.ok(r.ok, `${f}: ${r.ok ? '' : JSON.stringify(r.errors)}`);
		if (r.ok) assert.deepEqual(r.warnings, [], `${f} has warnings`);
	}
});

test('the galaxy example pack carries the same theme as the built-in Galaxy skin', () => {
	const r = parsePackText(readFileSync(join(process.cwd(), 'docs', 'packs', 'galaxy.fgpack.json'), 'utf8'));
	assert.ok(r.ok);
	if (!r.ok) return;
	const skin = themeToSkin(r.pack.themes[0]!);
	assert.deepEqual(skin.buckets, SKINS.galaxy.buckets);
	assert.equal(skin.linkColour, SKINS.galaxy.linkColour);
	assert.equal(skin.linkAlpha, SKINS.galaxy.linkAlpha);
	assert.equal(skin.base, SKINS.galaxy.base);
	assert.equal(skin.glow, true);
	assert.equal(skin.starfield, true);
	assert.deepEqual(skin.backdrop, SKINS.galaxy.backdrop);
});

test('a minimal pack is accepted and every default is filled in', () => {
	const r = ok(minimal());
	assert.equal(r.pack.name, 'p');
	const l = r.pack.layouts[0]!;
	assert.deepEqual(l.forces, { centre: 0.5, repel: 10, link: 1, linkDistance: 30, gravity: 0.2, shapeStrength: 0.5 });
	assert.equal(l.dimensions, 2);
	assert.equal(l.shape, null);
	const t = ok(minimal({ layouts: undefined, themes: [theme()] })).pack.themes[0]!;
	assert.equal(t.link.alpha, 0.3);
	assert.equal(t.base, null);
	assert.equal(t.glow, false);
});

test('file level problems', () => {
	assert.ok(has(errs(null), '(file)', /object/));
	assert.ok(has(errs([]), '(file)', /object/));
	assert.ok(has(errs(minimal({ format: 'other' })), 'format', /speed-graph-pack/));
	assert.ok(has(errs(minimal({ version: 2 })), 'version', /version 1/));
	assert.ok(has(errs(minimal({ id: undefined })), 'id', /Required/));
	assert.ok(has(errs(minimal({ id: 'Bad Id!' })), 'id', /lower-case/));
	assert.ok(has(errs({ format: 'speed-graph-pack', version: 1, id: 'x' }), '(file)', /no themes, shapes or layouts/));
	assert.ok(has(errs(minimal({ name: 'x'.repeat(81) })), 'name', /Longer than 80/));
});

test('problems are all reported together, each with a path', () => {
	const list = errs(minimal({ themes: [theme({ nodeColours: ['red'] }), theme({ id: 'Bad' })], layouts: [{ id: 'l', dimensions: 4 }] }));
	assert.ok(list.length >= 4, JSON.stringify(list));
	assert.ok(list.every((e) => e.path !== '' && e.message !== ''));
	assert.ok(has(list, 'themes[0].nodeColours', /2 to 8/));
	assert.ok(has(list, 'themes[0].nodeColours[0]', /colour/));
	assert.ok(has(list, 'themes[1].id', /lower-case/));
	assert.ok(has(list, 'layouts[0].dimensions', /2 or 3/));
});

test('unknown fields are warnings, not errors', () => {
	const r = ok(minimal({ sparkle: true, layouts: [{ id: 'l', extra: 1 }] }));
	assert.ok(r.warnings.some((w) => w.path === 'sparkle'));
	assert.ok(r.warnings.some((w) => w.path === 'layouts[0].extra'));
});

test('themes: colours, alpha and the colour list size', () => {
	assert.ok(has(errs(minimal({ themes: [theme({ nodeColours: ['#fff', '#000000'] })] })), 'themes[0].nodeColours[0]', /colour/));
	assert.ok(has(errs(minimal({ themes: [theme({ link: { alpha: 2 } })] })), 'themes[0].link.alpha', /between 0 and 1/));
	assert.ok(has(errs(minimal({ themes: [theme({ nodeColours: ['#000000'] })] })), 'themes[0].nodeColours', /2 to 8/));
	assert.ok(has(errs(minimal({ themes: [theme({ nodeColours: Array(9).fill('#000000') })] })), 'themes[0].nodeColours', /At most 8/));
	assert.ok(has(errs(minimal({ themes: [theme({ glow: 'yes' })] })), 'themes[0].glow', /true or false/));
	assert.equal(ok(minimal({ themes: [theme({ nodeColours: ['#ABCDEF', '#000000'] })] })).pack.themes[0]!.nodeColours[0], '#abcdef');
});

test('ids: unique inside a kind, and layouts must point at real shapes and themes', () => {
	assert.ok(has(errs(minimal({ themes: [theme(), theme()] })), 'themes[1].id', /Duplicate/));
	assert.ok(has(errs(minimal({ layouts: [{ id: 'l', shape: 'nope' }] })), 'layouts[0].shape', /No shape with id 'nope'/));
	assert.ok(has(errs(minimal({ layouts: [{ id: 'l', theme: 'nope' }] })), 'layouts[0].theme', /No theme with id 'nope'/));
	const good = ok(minimal({ themes: [theme()], shapes: [shape({ kind: 'spiral' })], layouts: [{ id: 'l', shape: 's', theme: 't' }] }));
	assert.equal(good.pack.layouts[0]!.shape, 's');
});

test('layout forces are range-checked', () => {
	assert.ok(has(errs(minimal({ layouts: [{ id: 'l', forces: { repel: 99 } }] })), 'layouts[0].forces.repel', /between 0 and 20/));
	assert.ok(has(errs(minimal({ layouts: [{ id: 'l', forces: { gravity: -1 } }] })), 'layouts[0].forces.gravity', /between 0 and 1/));
	assert.equal(ok(minimal({ layouts: [{ id: 'l', dimensions: 3, forces: { repel: 15 } }] })).pack.layouts[0]!.forces.repel, 15);
});

test('shape kind spiral', () => {
	const s = ok(minimal({ shapes: [shape({ kind: 'spiral' })] })).pack.shapes[0]!;
	assert.deepEqual(s.kind === 'spiral' ? [s.arms, s.twist, s.bulge, s.thickness] : null, [4, 2.4, 0.18, 0.08]);
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'spiral', arms: 2.5 })] })), 'shapes[0].arms', /whole number/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'spiral', arms: 20 })] })), 'shapes[0].arms', /between 1 and 8/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'blob' })] })), 'shapes[0].kind', /spiral/));
	assert.ok(has(errs(minimal({ shapes: [shape({})] })), 'shapes[0].kind', /Required/));
});

test('shape kind volume: solids, regions and limits', () => {
	const v = ok(minimal({ shapes: [shape({ kind: 'volume', solids: [{ type: 'sphere', radius: 0.5 }, { type: 'box', size: [1, 1, 1] }, { type: 'capsule', from: [0, 0, 0], to: [0, 1, 0], radius: 0.1 }, { type: 'ellipsoid', size: [1, 2, 3], at: [0.5, 0, 0] }] })] })).pack.shapes[0]!;
	assert.equal(v.kind === 'volume' ? v.solids.length : -1, 4);
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'volume' })] })), 'shapes[0].solids', /at least one/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'volume', solids: [{ type: 'cone' }] })] })), 'shapes[0].solids[0].type', /sphere/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'volume', solids: [{ type: 'sphere', radius: -1 }] })] })), 'shapes[0].solids[0].radius', /between/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'volume', solids: [{ type: 'sphere', at: [0, 0, 99] }] })] })), 'shapes[0].solids[0].at[2]', /between -4 and 4/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'volume', solids: [{ type: 'ellipsoid' }] })] })), 'shapes[0].solids[0].size', /Required/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'volume', regions: [{ name: 'r', solids: [] }] })] })), 'shapes[0].regions[0].solids', /at least one/));
	const many = Array.from({ length: PACK_LIMITS.maxSolids + 1 }, () => ({ type: 'sphere', radius: 0.1 }));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'volume', solids: many })] })), 'shapes[0].solids', /At most 64 items/));
	// the 64 solid budget is shared by the shape's own solids and all its regions
	const forty = Array.from({ length: 40 }, () => ({ type: 'sphere', radius: 0.1 }));
	assert.ok(errs(minimal({ shapes: [shape({ kind: 'volume', solids: forty, regions: [{ name: 'r', solids: forty }] })] })).some((e) => /At most 64 solids in a shape/.test(e.message)));
	const region = ok(minimal({ shapes: [shape({ kind: 'volume', regions: [{ name: 'Frontal', match: 'tag:#work', solids: [{ type: 'sphere', radius: 0.3 }] }] })] })).pack.shapes[0]!;
	assert.equal(region.kind === 'volume' ? region.regions[0]!.match : '', 'tag:#work');
});

test('shape kind parametric: curve or surface, formulas checked, fill rules', () => {
	const curve = ok(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 6.2832], x: 'sin(t)', y: 'cos(t)' })] })).pack.shapes[0]!;
	assert.equal(curve.kind === 'parametric' ? curve.z : '', '0');
	ok(minimal({ shapes: [shape({ kind: 'parametric', u: [0, 6.28], v: [-1, 1], x: 'cos(u)*(1 + v*cos(u/2)/2)', y: 'sin(u)*(1 + v*cos(u/2)/2)', z: 'v*sin(u/2)/2' })] }));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', x: 'sin(t)', y: 'cos(t)' })] })), 'shapes[0]', /either 't'/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 1], u: [0, 1], v: [0, 1], x: 'u', y: 'v' })] })), 'shapes[0]', /either 't'/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', u: [0, 1], x: 'u', y: 'u' })] })), 'shapes[0]', /both 'u' and 'v'/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', t: [3, 1], x: 't', y: 't' })] })), 'shapes[0].t', /smaller/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 1], y: 't' })] })), 'shapes[0].x', /Required/));
	const bad = errs(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 1], x: 'sin(t) +', y: 'foo(t)' })] }));
	assert.ok(has(bad, 'shapes[0].x', /ends too early \(at character 9\)/));
	assert.ok(has(bad, 'shapes[0].y', /Unknown function 'foo'/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 1], x: 'u', y: 't' })] })), 'shapes[0].x', /Unknown name 'u'/)); // u is not a variable in curve mode
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 1], x: 't', y: 't', samples: 10 })] })), 'shapes[0].samples', /between 50/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 1], x: 't', y: 't', fill: { depth: 0.5 }, z: 't' })] })), 'shapes[0].fill', /leave 'z' out/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'parametric', u: [0, 1], v: [0, 1], x: 'u', y: 'v', fill: {} })] })), 'shapes[0].fill', /only works with a curve/));
	assert.equal(ok(minimal({ shapes: [shape({ kind: 'parametric', t: [0, 1], x: 't', y: 't', fill: {} })] })).pack.shapes[0]!.kind, 'parametric');
});

test('formulas may use the pack parameters, and parameters are range-checked', () => {
	const withParam = { params: [{ id: 'k', name: 'K', default: 2, min: 0, max: 5 }], shapes: [shape({ kind: 'parametric', t: [0, 1], x: 'k*t', y: 't' })] };
	ok(minimal(withParam));
	assert.ok(has(errs(minimal({ shapes: withParam.shapes })), 'shapes[0].x', /Unknown name 'k'/));
	assert.ok(has(errs(minimal({ params: [{ id: 'k', default: 9, min: 0, max: 5 }] })), 'params[0].default', /between 0 and 5/));
	assert.ok(has(errs(minimal({ params: [{ id: 'k', min: 3, max: 1 }] })), 'params[0]', /smaller than 'max'/));
	assert.ok(has(errs(minimal({ params: [{ id: 'k' }, { id: 'k' }] })), 'params[1].id', /Duplicate/));
});

test('shape kind implicit', () => {
	const s = ok(minimal({ shapes: [shape({ kind: 'implicit', value: 'length(x, y, z) - 1' })] })).pack.shapes[0]!;
	assert.deepEqual(s.kind === 'implicit' ? [s.bounds, s.resolution] : null, [1.6, 48]);
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'implicit' })] })), 'shapes[0].value', /Required/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'implicit', value: 'x + t' })] })), 'shapes[0].value', /Unknown name 't'/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'implicit', value: 'x', resolution: 128 })] })), 'shapes[0].resolution', /between 16 and 64/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'implicit', value: 'x', bounds: 100 })] })), 'shapes[0].bounds', /between/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'implicit', value: 'constructor' })] })), 'shapes[0].value', /Unknown name/));
});

test('shape kind points: two or three numbers each, limited count', () => {
	const s = ok(minimal({ shapes: [shape({ kind: 'points', points: [[0, 1], [1, 2, 3]] })] })).pack.shapes[0]!;
	assert.deepEqual(s.kind === 'points' ? s.points : null, [[0, 1, 0], [1, 2, 3]]);
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', points: [] })] })), 'shapes[0].points', /at least one/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', points: [[1, 2, 3, 4]] })] })), 'shapes[0].points[0]', /\[x, y, z\]/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', points: [[0, 'a', 0]] })] })), 'shapes[0].points[0][1]', /number/));
	const tooMany = Array.from({ length: PACK_LIMITS.maxPoints + 1 }, () => [0, 0, 0]);
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', points: tooMany })] })), 'shapes[0].points', /At most 5000/));
});

test('list sizes are limited', () => {
	const many = Array.from({ length: 9 }, (_, i) => theme({ id: `t${i}` }));
	assert.ok(has(errs(minimal({ themes: many })), 'themes', /At most 8/));
});

test('parsePackText: size, JSON and a round trip', () => {
	const r1 = parsePackText('x'.repeat(PACK_LIMITS.maxBytes + 1));
	assert.ok(!r1.ok && /Larger than 256 KB/.test(r1.errors[0]!.message));
	const r2 = parsePackText('{ not json');
	assert.ok(!r2.ok && /Not valid JSON/.test(r2.errors[0]!.message));
	const r3 = parsePackText(JSON.stringify(minimal()));
	assert.ok(r3.ok);
	// prototype pollution attempts are plain data and change nothing
	const r4 = parsePackText('{"format":"speed-graph-pack","version":1,"id":"x","layouts":[{"id":"l"}],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
	assert.ok(r4.ok);
	assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('a checked pack reads back identically (so saved packs reload): every example, every kind', () => {
	const dir = join(process.cwd(), 'docs', 'packs');
	const texts = readdirSync(dir).filter((f) => f.endsWith('.fgpack.json')).map((f) => readFileSync(join(dir, f), 'utf8'));
	// one pack with every shape kind and optional bits both given and left out
	texts.push(
		JSON.stringify(
			minimal({
				params: [{ id: 'k', default: 1, min: 0, max: 2 }],
				themes: [theme({ base: '#000000' }), theme({ id: 't2' })],
				shapes: [
					shape({ kind: 'spiral' }),
					shape({ id: 'v', kind: 'volume', solids: [{ type: 'box', size: [1, 1, 1] }], regions: [{ name: 'r', solids: [{ type: 'sphere', radius: 0.3 }] }] }),
					shape({ id: 'c', kind: 'parametric', t: [0, 1], x: 'k*t', y: 't' }),
					shape({ id: 'sf', kind: 'parametric', u: [0, 1], v: [0, 1], x: 'u', y: 'v', z: 'u*v' }),
					shape({ id: 'fl', kind: 'parametric', t: [0, 6.28], x: 'sin(t)', y: 'cos(t)', fill: {} }),
					shape({ id: 'i', kind: 'implicit', value: 'length(x,y,z)-1' }),
					shape({ id: 'p', kind: 'points', points: [[0, 0, 0]] }),
				],
				layouts: [{ id: 'l', shape: 'v', theme: 't' }, { id: 'l2' }],
			}),
		),
	);
	for (const text of texts) {
		const first = parsePackText(text);
		assert.ok(first.ok, first.ok ? '' : JSON.stringify(first.errors));
		if (!first.ok) continue;
		const again = parsePackText(JSON.stringify(first.pack, null, 2));
		assert.ok(again.ok, again.ok ? '' : JSON.stringify(again.errors));
		if (again.ok) {
			assert.deepEqual(again.pack, first.pack);
			assert.deepEqual(again.warnings, []);
		}
	}
});

test('shape kind points with regions: groups of target points chosen by a query', () => {
	const solar = ok(minimal({ shapes: [shape({ kind: 'points', regions: [{ name: 'Sun', match: 'top:1', points: [[0, 0, 0]] }, { name: 'Stars', match: 'degree>=0', points: [[0.5, 0.5], [0.6, 0.1, 0.2]] }] })] })).pack.shapes[0]!;
	assert.equal(solar.kind === 'points' ? solar.regions.length : -1, 2);
	assert.deepEqual(solar.kind === 'points' ? solar.regions[1]!.points : null, [[0.5, 0.5, 0], [0.6, 0.1, 0.2]]);
	assert.equal(solar.kind === 'points' ? solar.points.length : -1, 0); // only regions is fine
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points' })] })), 'shapes[0].points', /at least one point/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', regions: [{ name: 'r', points: [] }] })] })), 'shapes[0].regions[0].points', /at least one point/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', regions: [{ match: 'x', points: [[0, 0, 0]] }] })] })), 'shapes[0].regions[0].name', /Required/));
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', regions: [{ name: 'r', points: [[0, 0, 9]] }] })] })), 'shapes[0].regions[0].points[0][2]', /between -4 and 4/));
	const half = Array.from({ length: 3000 }, () => [0, 0, 0]);
	assert.ok(errs(minimal({ shapes: [shape({ kind: 'points', points: half, regions: [{ name: 'r', points: half }] })] })).some((e) => /At most 5000 points in a shape/.test(e.message)));
	// a saved (filled-in) pack with regions reads back the same
	const first = parsePackText(JSON.stringify(minimal({ shapes: [shape({ kind: 'points', points: [[0, 0, 0]], regions: [{ name: 'r', match: 'top:2', points: [[1, 1, 0]] }] })] })));
	assert.ok(first.ok);
	if (first.ok) {
		const again = parsePackText(JSON.stringify(first.pack));
		assert.ok(again.ok);
		if (again.ok) assert.deepEqual(again.pack, first.pack);
	}
});

test('exclusive point regions and layout guides: defaults, validation and round trip', () => {
	const r = ok(minimal({ shapes: [shape({ kind: 'points', regions: [{ name: 'a', points: [[0, 0]] }, { name: 'b', exclusive: true, points: [[1, 1]] }] })], layouts: [{ id: 'l', shape: 's' }, { id: 'g', shape: 's', guide: true }] }));
	const s = r.pack.shapes[0]!;
	assert.deepEqual(s.kind === 'points' ? s.regions.map((x) => x.exclusive) : null, [false, true]);
	assert.deepEqual(r.pack.layouts.map((l) => l.guide), [false, true]);
	assert.ok(has(errs(minimal({ shapes: [shape({ kind: 'points', regions: [{ name: 'a', exclusive: 'yes', points: [[0, 0]] }] })] })), 'shapes[0].regions[0].exclusive', /true or false/));
	assert.ok(has(errs(minimal({ layouts: [{ id: 'l', guide: 1 }] })), 'layouts[0].guide', /true or false/));
	const again = parsePackText(JSON.stringify(r.pack));
	assert.ok(again.ok);
	if (again.ok) assert.deepEqual(again.pack, r.pack);
});

test('a pack made for the plugin\'s old name (format "fast-graph-pack") is still read, and comes out with the new label', () => {
	const old = { format: 'fast-graph-pack', version: 1, id: 'old', layouts: [{ id: 'l' }] };
	const r = ok(old);
	assert.equal(r.pack.format, 'speed-graph-pack');
	const again = parsePackText(JSON.stringify(r.pack));
	assert.ok(again.ok);
	assert.ok(has(errs({ ...old, format: 'something-else' }), 'format', /speed-graph-pack/));
});
