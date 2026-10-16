import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ELECTRONS, ELECTRON_MAX, electronOffset, electronStride, electronT, mergeElectrons } from '../src/render/electrons';

test('electrons are off by default', () => {
	assert.equal(DEFAULT_ELECTRONS.enabled, false);
});

test('stride keeps the electron count under the cap for any graph size', () => {
	for (const total of [0, 10, 100, 2500, 5000, 60000, 1_000_000]) {
		for (const amount of [0.05, 0.4, 1]) {
			const stride = electronStride(total, amount);
			assert.ok(stride >= 1);
			const count = Math.ceil(total / stride);
			assert.ok(count <= ELECTRON_MAX * 2, `${total} ${amount}: ${count}`); // floor() can allow just under twice the cap on small ratios
			assert.ok(count <= Math.max(40, Math.round(ELECTRON_MAX * amount)) * 2);
		}
	}
	assert.equal(electronStride(100, 1), 1); // a small graph: every link
	assert.ok(electronStride(60000, 1) >= 24);
	assert.ok(electronStride(60000, 0.1) > electronStride(60000, 1)); // less amount, fewer electrons
	assert.equal(electronStride(60000, NaN), electronStride(60000, 0));
});

test('offsets are steady, spread over 0 to 1 and differ between links', () => {
	assert.equal(electronOffset(7), electronOffset(7));
	const seen = new Set<number>();
	let low = 0;
	for (let i = 0; i < 1000; i++) {
		const o = electronOffset(i);
		assert.ok(o >= 0 && o < 1);
		if (o < 0.5) low++;
		seen.add(o);
	}
	assert.ok(seen.size > 990);
	assert.ok(low > 430 && low < 570, `${low}`);
});

test('an electron moves from the source towards the target and repeats', () => {
	const len = 100;
	const speed = 50; // 2 seconds to cross
	const t0 = electronT(0, 3, len, speed);
	const t1 = electronT(0.5, 3, len, speed);
	assert.ok(Math.abs(((t1 - t0 + 1) % 1) - 0.25) < 1e-9, 'a quarter of the way after half a second');
	assert.ok(Math.abs(electronT(2, 3, len, speed) - t0) < 1e-9, 'back where it started after one crossing');
	for (let s = 0; s < 10; s += 0.37) {
		const t = electronT(s, 3, len, speed);
		assert.ok(t >= 0 && t < 1);
	}
});

test('the same on-screen speed on long and short links', () => {
	const speed = 60;
	const crossings = (len: number) => (1 * speed) / len; // fraction of the link per second
	assert.ok(Math.abs(crossings(60) - 1) < 1e-9);
	assert.ok(Math.abs(crossings(240) - 0.25) < 1e-9);
	// the pixel distance moved in one second is the speed, whatever the length
	for (const len of [20, 80, 500]) {
		const a = electronT(0, 1, len, speed);
		const b = electronT(0.1, 1, len, speed);
		assert.ok(Math.abs((((b - a) % 1) + 1) % 1) * len - 6 < 1e-6);
	}
});

test('bad numbers give a harmless position', () => {
	assert.equal(electronT(1, 0, 0, 50), 0);
	assert.equal(electronT(1, 0, -5, 50), 0);
	assert.equal(electronT(NaN, 0, 50, 50), 0);
	assert.equal(electronT(Infinity, 0, 50, 50), 0);
});

test('mergeElectrons keeps only valid saved values', () => {
	assert.deepEqual(mergeElectrons(undefined), DEFAULT_ELECTRONS);
	assert.deepEqual(mergeElectrons({ enabled: 'yes', speed: 'fast', amount: null }), DEFAULT_ELECTRONS);
	assert.deepEqual(mergeElectrons({ enabled: true, speed: 9999, amount: -3 }), { enabled: true, speed: 200, amount: 0.05 });
	assert.deepEqual(mergeElectrons({ enabled: false, speed: 100, amount: 0.5 }), { enabled: false, speed: 100, amount: 0.5 });
});
