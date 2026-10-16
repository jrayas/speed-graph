import test from 'node:test';
import assert from 'node:assert/strict';
import { BeatClock, DEFAULT_MOTION, effectiveBpm, MOTION_KINDS, MOTION_SPEED_RANGES, NO_MOTION, mergeMotion, motionFrame, type Motion } from '../src/render/motion';

const on = (kind: Motion['kind'], over: Partial<Motion> = {}): Motion => ({ ...DEFAULT_MOTION, speeds: { ...DEFAULT_MOTION.speeds }, kind, ...over });
const sample = (m: Motion, seconds: number, step = 0.005, from = 0) => {
	const out = [];
	for (let t = from; t < from + seconds; t += step) out.push(motionFrame(m, t));
	return out;
};

test('off and zero strength do nothing; default is off', () => {
	assert.equal(DEFAULT_MOTION.kind, 'off');
	assert.deepEqual(motionFrame(DEFAULT_MOTION, 1.234), NO_MOTION);
	assert.deepEqual(motionFrame(on('heartbeat', { strength: 0 }), 1.234), NO_MOTION);
	for (const kind of Object.keys(MOTION_KINDS) as Motion['kind'][]) assert.deepEqual(motionFrame(on(kind, { strength: 0 }), 0.3), NO_MOTION);
});

test('heartbeat: swells on the beat, rests between, repeats every 60 / bpm seconds', () => {
	const m = on('heartbeat'); // 72 bpm
	const period = 60 / 72;
	assert.ok(motionFrame(m, 0).scale > 1.03, 'no swell on the beat');
	assert.ok(Math.abs(motionFrame(m, period * 0.6).scale - 1) < 0.001, 'not at rest between beats');
	assert.ok(Math.abs(motionFrame(m, 3 * period).scale - motionFrame(m, 0).scale) < 1e-9, 'not periodic');
	const frames = sample(m, period, 0.005, period * 0.5); // half a period either side of one whole beat
	assert.ok(frames.every((f) => f.scale >= 1 && f.scale < 1.1 && f.dx === 0 && f.dy === 0));
	// two peaks per beat with the double beat, one without
	const peaks = (fr: typeof frames) => fr.filter((f, i) => i > 0 && i < fr.length - 1 && f.scale > (fr[i - 1] as typeof f).scale && f.scale >= (fr[i + 1] as typeof f).scale && f.scale > 1.01).length;
	assert.equal(peaks(frames), 2);
	assert.equal(peaks(sample(on('heartbeat', { doubleBeat: false }), period, 0.005, period * 0.5)), 1);
});

test('heartbeat rate and strength matter', () => {
	const fast = on('heartbeat', { speeds: { ...DEFAULT_MOTION.speeds, heartbeat: 120 } });
	assert.ok(Math.abs(motionFrame(fast, 0.5).scale - motionFrame(fast, 0).scale) < 1e-9); // 120 bpm = 0.5 s period
	assert.ok(motionFrame(on('heartbeat', { strength: 1 }), 0).scale > motionFrame(on('heartbeat', { strength: 0.25 }), 0).scale);
});

test('breathing is smooth, slow and centred on 1', () => {
	const frames = sample(on('breathe'), 5, 0.01); // 12 per minute = 5 s
	const mean = frames.reduce((a, f) => a + f.scale, 0) / frames.length;
	assert.ok(Math.abs(mean - 1) < 0.002);
	assert.ok(frames.every((f) => f.scale > 0.97 && f.scale < 1.03));
	for (let i = 1; i < frames.length; i++) assert.ok(Math.abs((frames[i] as (typeof frames)[0]).scale - (frames[i - 1] as (typeof frames)[0]).scale) < 0.002);
});

test('vibrate shakes in pixels, stays small and averages to no drift', () => {
	const frames = sample(on('vibrate'), 4, 0.002);
	assert.ok(frames.every((f) => f.scale === 1));
	const biggest = Math.max(...frames.map((f) => Math.hypot(f.dx, f.dy)));
	assert.ok(biggest > 1 && biggest < 8, `${biggest}`);
	const meanX = frames.reduce((a, f) => a + f.dx, 0) / frames.length;
	assert.ok(Math.abs(meanX) < 0.15, `${meanX}`);
});

test('scared: a sudden shrink at the start of each period, then a tremble that fades', () => {
	const m = on('shiver'); // 18 per minute: period 3.33 s
	const period = 60 / 18;
	const early = sample(m, 0.4, 0.002);
	assert.ok(Math.min(...early.map((f) => f.scale)) < 0.97, 'no flinch');
	assert.ok(sample(m, period, 0.002).every((f) => f.scale <= 1 + 1e-9), 'it should only shrink');
	const amp = (from: number, to: number) => Math.max(...sample(m, to, 0.002).filter((_, i) => i * 0.002 >= from).map((f) => Math.hypot(f.dx, f.dy)));
	assert.ok(amp(0.05, 0.5) > amp(2.5, 3.2), 'tremble did not fade');
	assert.ok(Math.abs(motionFrame(m, 2 * period + 1.5).scale - 1) < 1e-9);
});

test('bad input is harmless', () => {
	for (const kind of Object.keys(MOTION_KINDS) as Motion['kind'][]) {
		for (const t of [NaN, Infinity, -5, 1e9]) {
			const f = motionFrame(on(kind), t);
			assert.ok(Number.isFinite(f.scale) && Number.isFinite(f.dx) && Number.isFinite(f.dy), `${kind} ${t}`);
			assert.ok(f.scale > 0.8 && f.scale < 1.2);
		}
	}
});

test('mergeMotion keeps only valid saved values', () => {
	assert.deepEqual(mergeMotion(undefined), DEFAULT_MOTION);
	assert.deepEqual(mergeMotion('x'), DEFAULT_MOTION);
	const m = mergeMotion({ kind: 'heartbeat', strength: 7, doubleBeat: false, speeds: { heartbeat: 5, breathe: 'x', vibrate: 999, shiver: 20 } });
	assert.equal(m.kind, 'heartbeat');
	assert.equal(m.strength, 1);
	assert.equal(m.doubleBeat, false);
	assert.equal(m.speeds.heartbeat, MOTION_SPEED_RANGES.heartbeat[0]);
	assert.equal(m.speeds.breathe, DEFAULT_MOTION.speeds.breathe);
	assert.equal(m.speeds.vibrate, MOTION_SPEED_RANGES.vibrate[1]);
	assert.equal(m.speeds.shiver, 20);
	assert.equal(mergeMotion({ kind: 'explode' }).kind, 'off');
	assert.equal(mergeMotion({ kind: '__proto__' }).kind, 'off');
});

test('shockwave: nothing until an event, then a swell that rings down and ends', () => {
	const m = on('shockwave');
	assert.deepEqual(motionFrame(m, 5), NO_MOTION); // no event yet
	assert.deepEqual(motionFrame(m, 5, { impulseAge: 10 }), NO_MOTION); // long ago
	assert.deepEqual(motionFrame(m, 5, { impulseAge: -1 }), NO_MOTION);
	assert.ok(motionFrame(m, 5, { impulseAge: 0 }).scale > 1.04, 'no swell at the event');
	const scales = [0, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 2.9].map((age) => motionFrame(m, 5, { impulseAge: age }).scale);
	assert.ok(Math.abs((scales.at(-1) as number) - 1) < 0.001, 'it did not die away');
	assert.ok(scales.every((v) => v > 0.9 && v < 1.15));
	assert.ok(Math.min(...scales) < 1, 'it should ring past rest');
});

test('panic: calm at the start of each cycle, strongest just before the sudden calm', () => {
	const m = on('panic'); // 5 per minute: 12 s cycle
	const amp = (from: number, to: number) => Math.max(...sample(m, to - from, 0.01, from).map((f) => Math.hypot(f.dx, f.dy)));
	assert.ok(amp(0, 1) < 0.5, 'should start calm');
	assert.ok(amp(7.5, 8.3) > 3, 'should build up');
	assert.ok(amp(7.5, 8.3) > amp(3, 4) * 2);
	assert.ok(amp(9.8, 11.9) < 0.01, 'should be calm after the drop');
	assert.ok(sample(m, 12, 0.01).every((f) => f.scale > 0.95 && f.scale < 1.05));
});

test('activity-linked heartbeat: faster with activity, and the beat clock does not jump when the rate changes', () => {
	const m = on('heartbeat', { activityLinked: true });
	assert.equal(effectiveBpm(m, 0), 72);
	assert.equal(effectiveBpm(m, 1), 132);
	assert.equal(effectiveBpm(m, 5), 132); // clamped
	assert.equal(effectiveBpm(on('heartbeat'), 1), 72); // switched off
	assert.ok(effectiveBpm(on('heartbeat', { activityLinked: true, speeds: { ...DEFAULT_MOTION.speeds, heartbeat: 180 } }), 1) <= 200);
	const clock = new BeatClock();
	let last = clock.advance(0, 72);
	let biggestJump = 0;
	for (let t = 0.016; t < 6; t += 0.016) {
		const p = clock.advance(t, t < 3 ? 72 : 132);
		biggestJump = Math.max(biggestJump, Math.min(Math.abs(p - last), 1 - Math.abs(p - last)));
		last = p;
	}
	assert.ok(biggestJump < 0.05, `phase jumped by ${biggestJump}`);
	// after a long pause (hidden window) the clock moves on by at most a quarter second
	const c2 = new BeatClock();
	c2.advance(0, 60);
	assert.ok(Math.abs(c2.advance(1000, 60) - 0.25) < 1e-9);
	assert.deepEqual(motionFrame(m, 1, { beatPhase: 0 }), motionFrame(m, 99, { beatPhase: 0 })); // follows the clock given, not the time
});
