import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, curveControl, curveSide, degreeBuckets, getSkin, makeStarfield, pickPulseEdges, pulseT, quadPoint, seededRandom } from '../src/render/skins';

test('seeded random numbers repeat for a seed and stay in [0, 1)', () => {
	const a = seededRandom(5);
	const b = seededRandom(5);
	for (let i = 0; i < 100; i++) {
		const v = a();
		assert.equal(v, b());
		assert.ok(v >= 0 && v < 1);
	}
	assert.notEqual(seededRandom(5)(), seededRandom(6)());
});

test('starfield is deterministic, in range, and mostly dim with a few bright stars', () => {
	const s = makeStarfield(3, 500);
	assert.deepEqual(s, makeStarfield(3, 500));
	assert.equal(s.length, 500);
	assert.ok(s.every((p) => p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1 && p.size > 0 && p.alpha > 0 && p.alpha <= 1));
	const bright = s.filter((p) => p.alpha >= 0.8).length;
	assert.ok(bright > 5 && bright < 100, `bright stars: ${bright}`);
});

test('degree buckets: least connected first, hubs last, dead slots ignored', () => {
	const degrees = new Uint32Array(1000);
	const alive = new Uint8Array(1000).fill(1);
	for (let i = 0; i < 1000; i++) degrees[i] = i < 600 ? 1 : i < 900 ? 3 : i < 991 ? 8 : 40; // 9 hubs: under 1% of the nodes
	alive[5] = 0;
	const b = degreeBuckets(degrees, alive, 6);
	assert.equal(b[0], 0);
	assert.equal(b[999], 5);
	assert.ok((b[700] as number) > (b[0] as number) && (b[995] as number) >= (b[700] as number));
	assert.equal(b[5], 0);
	assert.ok(b.every((v) => v < 6));
	assert.deepEqual([...degreeBuckets(new Uint32Array(3), new Uint8Array(3), 6)], [0, 0, 0]);
});

test('curve control point bows to the chosen side and the curve passes through both ends', () => {
	const c1 = curveControl(0, 0, 100, 0, 1);
	const c2 = curveControl(0, 0, 100, 0, -1);
	assert.equal(c1.x, 50);
	assert.ok(c1.y > 0 && c2.y < 0 && Math.abs(c1.y + c2.y) < 1e-9);
	assert.deepEqual(quadPoint(0, 0, c1.x, c1.y, 100, 0, 0), { x: 0, y: 0 });
	assert.deepEqual(quadPoint(0, 0, c1.x, c1.y, 100, 0, 1), { x: 100, y: 0 });
	const mid = quadPoint(0, 0, c1.x, c1.y, 100, 0, 0.5);
	assert.ok(Math.abs(mid.x - 50) < 1e-9 && mid.y > 0);
});

test('curve side is stable and splits roughly evenly', () => {
	assert.equal(curveSide(10), curveSide(10));
	let plus = 0;
	for (let i = 0; i < 10000; i++) plus += curveSide(i) === 1 ? 1 : 0;
	assert.ok(plus > 4000 && plus < 6000, `plus: ${plus}`);
});

test('pulse links are distinct, sorted, deterministic and capped by the link count', () => {
	const p = pickPulseEdges(1000, 100, 9);
	assert.equal(p.length, 100);
	assert.equal(new Set(p).size, 100);
	assert.deepEqual([...p], [...pickPulseEdges(1000, 100, 9)]);
	assert.equal(pickPulseEdges(10, 100, 9).length, 10);
	assert.equal(pickPulseEdges(0, 100, 9).length, 0);
	for (let t = 0; t < 20; t += 0.37) assert.ok(pulseT(t, 0.2) >= 0 && pulseT(t, 0.2) < 1);
});

test('skin lookup: known ids give skins, anything else gives the default (null)', () => {
	assert.equal(getSkin('galaxy'), SKINS.galaxy);
	assert.equal(getSkin('brain'), SKINS.brain);
	assert.equal(getSkin('default'), null);
	assert.equal(getSkin('nope'), null);
	for (const skin of Object.values(SKINS)) assert.ok(skin.buckets.length >= 2 && skin.buckets.every((c) => /^#[0-9a-f]{6}$/i.test(c)));
});
