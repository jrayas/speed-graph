import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DRIFT, DRIFT_SEED_STRIDE, driftAmplitudePx, driftOmega, driftUnit, makeDriftSeeds, mergeDrift } from '../src/render/drift';

test('drift is off by default and amounts map to a few pixels', () => {
	assert.equal(DEFAULT_DRIFT.enabled, false);
	assert.equal(driftAmplitudePx(0), 0);
	assert.equal(driftAmplitudePx(1), 7);
	assert.ok(driftAmplitudePx(0.4) > 2 && driftAmplitudePx(0.4) < 5);
	assert.equal(driftAmplitudePx(NaN), 0);
	assert.equal(driftAmplitudePx(9), 7);
	assert.ok(driftOmega(1) > driftOmega(0));
	assert.ok(Number.isFinite(driftOmega(NaN)));
});

test('seeds are repeatable and different for every note', () => {
	const a = makeDriftSeeds(500);
	assert.equal(a.length, 500 * DRIFT_SEED_STRIDE);
	assert.deepEqual(makeDriftSeeds(500).slice(0, 80), a.slice(0, 80)); // same note, same numbers, whatever the count
	assert.deepEqual(makeDriftSeeds(10), a.slice(0, 10 * DRIFT_SEED_STRIDE));
	const firstPhase = new Set<number>();
	for (let i = 0; i < 500; i++) firstPhase.add(a[i * DRIFT_SEED_STRIDE] as number);
	assert.ok(firstPhase.size > 490);
	for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i] as number));
	for (let i = 0; i < 500; i++) {
		assert.ok((a[i * DRIFT_SEED_STRIDE + 3] as number) >= 0.75 && (a[i * DRIFT_SEED_STRIDE + 3] as number) <= 1.25);
	}
});

test('the offset never exceeds the amplitude and wanders on every axis', () => {
	const seeds = makeDriftSeeds(200);
	const out = [0, 0, 0];
	const omega = driftOmega(0.4);
	let biggest = 0;
	const reach = [0, 0, 0];
	for (let id = 0; id < 200; id++) {
		for (let t = 0; t < 60; t += 0.25) {
			driftUnit(seeds, id, t, omega, out);
			for (let k = 0; k < 3; k++) {
				assert.ok(Math.abs(out[k] as number) <= 1 + 1e-6);
				biggest = Math.max(biggest, Math.abs(out[k] as number));
				reach[k] = Math.max(reach[k] as number, Math.abs(out[k] as number));
			}
		}
	}
	assert.ok(biggest > 0.9, `${biggest}`); // it really uses its range
	assert.ok(reach.every((r) => r > 0.85));
});

test('it is smooth and slow: no jumps between neighbouring frames', () => {
	const seeds = makeDriftSeeds(50);
	const a = [0, 0, 0];
	const b = [0, 0, 0];
	for (const speed of [0, 0.4, 1]) {
		const omega = driftOmega(speed);
		let worst = 0;
		for (let id = 0; id < 50; id++) {
			for (let t = 0; t < 30; t += 1 / 30) {
				driftUnit(seeds, id, t, omega, a);
				driftUnit(seeds, id, t + 1 / 30, omega, b);
				for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs((a[k] as number) - (b[k] as number)));
			}
		}
		// at the fastest setting a note moves under a tenth of its range per frame; at 7 px that is well under a pixel
		assert.ok(worst < 0.1, `speed ${speed}: ${worst}`);
	}
});

test('on average a note stays where the layout put it (no drift away over time)', () => {
	const seeds = makeDriftSeeds(100);
	const out = [0, 0, 0];
	const omega = driftOmega(0.4);
	for (let id = 0; id < 100; id += 7) {
		let sx = 0;
		let n = 0;
		for (let t = 0; t < 4000; t += 0.5) {
			driftUnit(seeds, id, t, omega, out);
			sx += out[0] as number;
			n++;
		}
		assert.ok(Math.abs(sx / n) < 0.12, `note ${id}: ${sx / n}`);
	}
});

test('notes move independently, not as one block', () => {
	const seeds = makeDriftSeeds(100);
	const a = [0, 0, 0];
	const b = [0, 0, 0];
	let same = 0;
	for (let t = 0; t < 20; t += 0.5) {
		driftUnit(seeds, 1, t, driftOmega(0.5), a);
		driftUnit(seeds, 2, t, driftOmega(0.5), b);
		if (Math.abs((a[0] as number) - (b[0] as number)) < 0.02) same++;
	}
	assert.ok(same < 8, `${same}`);
});

test('bad input is harmless', () => {
	const seeds = makeDriftSeeds(3);
	const out = [9, 9, 9];
	driftUnit(seeds, 99, 1, 1, out);
	assert.deepEqual(out, [0, 0, 0]); // unknown note
	driftUnit(seeds, 1, NaN, 1, out);
	assert.deepEqual(out, [0, 0, 0]);
	driftUnit(seeds, -1, 1, 1, out);
	assert.deepEqual(out, [0, 0, 0]);
	assert.equal(makeDriftSeeds(0).length, 0);
});

test('mergeDrift keeps only valid saved values', () => {
	assert.deepEqual(mergeDrift(undefined), DEFAULT_DRIFT);
	assert.deepEqual(mergeDrift({ enabled: 'yes', amount: 'a', speed: null }), DEFAULT_DRIFT);
	assert.deepEqual(mergeDrift({ enabled: true, amount: 5, speed: -1 }), { enabled: true, amount: 1, speed: 0 });
});
