/**
 * Whole-graph motion effects: a heartbeat, slow breathing, a vibration and a frightened flinch.
 * Each one is a tiny change to the view (a scale about the graph centre and a shake in pixels)
 * worked out from the clock, so it costs nothing per node and works the same in 2D and 3D.
 * Everything is off by default and the settings page controls it.
 */
export type MotionKind = 'off' | 'heartbeat' | 'breathe' | 'vibrate' | 'shiver' | 'panic' | 'shockwave';

export const MOTION_KINDS: Record<MotionKind, string> = {
	off: 'Off',
	heartbeat: 'Heartbeat',
	breathe: 'Breathing',
	vibrate: 'Vibrate',
	shiver: 'Scared (flinch and shiver)',
	panic: 'Panic (flicker that builds, then calms)',
	shockwave: 'Shockwave (pulse when you open or edit a note)',
};

export interface Motion {
	kind: MotionKind;
	/** 0 to 1: how big the movement is. */
	strength: number;
	/** Heartbeat: a lub-dub double beat (on) or a single thump (off). */
	doubleBeat: boolean;
	/** Heartbeat: beat faster while you are opening and editing notes, then slow back down. */
	activityLinked: boolean;
	/** Speed for each effect: beats per minute, breaths per minute, vibrations per second, flinches per minute. */
	speeds: { heartbeat: number; breathe: number; vibrate: number; shiver: number; panic: number };
}

export const MOTION_SPEED_RANGES = {
	heartbeat: [30, 180, 1],
	breathe: [4, 30, 1],
	vibrate: [8, 60, 1],
	shiver: [6, 40, 1],
	panic: [2, 12, 1],
} as const;

export const DEFAULT_MOTION: Motion = {
	kind: 'off',
	strength: 0.5,
	doubleBeat: true,
	activityLinked: false,
	speeds: { heartbeat: 72, breathe: 12, vibrate: 30, shiver: 18, panic: 5 },
};

/** What to do to the picture this frame. `scale` is about the middle of the graph; `dx` and `dy` are pixels. */
export interface MotionFrame {
	scale: number;
	dx: number;
	dy: number;
}

export const NO_MOTION: MotionFrame = { scale: 1, dx: 0, dy: 0 };

const gauss = (x: number, width: number): number => Math.exp(-((x / width) ** 2));
const fract = (x: number): number => x - Math.floor(x);

export function mergeMotion(raw: unknown): Motion {
	const d = DEFAULT_MOTION;
	const out: Motion = { ...d, speeds: { ...d.speeds } };
	if (typeof raw !== 'object' || raw === null) return out;
	const r = raw as Record<string, unknown>;
	if (typeof r.kind === 'string' && Object.prototype.hasOwnProperty.call(MOTION_KINDS, r.kind)) out.kind = r.kind as MotionKind;
	if (typeof r.strength === 'number' && Number.isFinite(r.strength)) out.strength = Math.min(1, Math.max(0, r.strength));
	if (typeof r.doubleBeat === 'boolean') out.doubleBeat = r.doubleBeat;
	if (typeof r.activityLinked === 'boolean') out.activityLinked = r.activityLinked;
	if (typeof r.speeds === 'object' && r.speeds !== null) {
		const s = r.speeds as Record<string, unknown>;
		for (const key of Object.keys(MOTION_SPEED_RANGES) as (keyof Motion['speeds'])[]) {
			const v = s[key];
			if (typeof v === 'number' && Number.isFinite(v)) out.speeds[key] = Math.min(MOTION_SPEED_RANGES[key][1], Math.max(MOTION_SPEED_RANGES[key][0], v));
		}
	}
	return out;
}

/** Things only the view knows: where the heart is in its beat, and how long ago something happened. */
export interface MotionContext {
	/** Heartbeat phase from 0 to 1 (from a BeatClock). Without it the beat follows the plain clock. */
	beatPhase?: number;
	/** Seconds since the last note was opened or edited (shockwave). */
	impulseAge?: number;
}

/** Keeps the heartbeat's place when its rate changes, so a faster rate speeds up smoothly instead of jumping. */
export class BeatClock {
	private phase = 0;
	private last = -1;
	advance(seconds: number, bpm: number): number {
		if (this.last < 0) this.last = seconds;
		const dt = Math.min(0.25, Math.max(0, seconds - this.last));
		this.last = seconds;
		this.phase = (this.phase + (dt * Math.max(0, bpm)) / 60) % 1;
		return this.phase;
	}
}

/** The beat rate right now: the set rate, plus up to 60 per minute while there is recent activity (0 to 1). */
export function effectiveBpm(m: Motion, activity: number): number {
	const boost = m.activityLinked ? 60 * Math.min(1, Math.max(0, activity)) : 0;
	return Math.min(200, m.speeds.heartbeat + boost);
}

/** The frame for `seconds` on a steady clock. Safe for any input: bad numbers give no motion. */
export function motionFrame(m: Motion, seconds: number, context: MotionContext = {}): MotionFrame {
	if (m.kind === 'off' || !Number.isFinite(seconds) || m.strength <= 0) return NO_MOTION;
	const s = Math.min(1, m.strength);
	switch (m.kind) {
		case 'heartbeat': {
			// A beat is a quick swell. Double beat: a strong "lub" then, a little later, a softer "dub".
			const phase = context.beatPhase !== undefined && Number.isFinite(context.beatPhase) ? fract(context.beatPhase) : fract((seconds * m.speeds.heartbeat) / 60);
			const beat = gauss(phase, 0.045) + (m.doubleBeat ? 0.65 * gauss(phase - 0.2, 0.05) : 0);
			return { scale: 1 + 0.07 * s * beat, dx: 0, dy: 0 };
		}
		case 'breathe': {
			const wave = Math.sin((2 * Math.PI * seconds * m.speeds.breathe) / 60);
			return { scale: 1 + 0.04 * s * wave, dx: 0, dy: 0 };
		}
		case 'vibrate': {
			const f = m.speeds.vibrate;
			// two unrelated rates so the shake never looks like a regular wobble
			const a = Math.sin(2 * Math.PI * f * seconds) + 0.5 * Math.sin(2 * Math.PI * f * 1.618 * seconds + 1.3);
			const b = Math.sin(2 * Math.PI * f * 0.83 * seconds + 2.1) + 0.5 * Math.sin(2 * Math.PI * f * 1.37 * seconds);
			return { scale: 1, dx: 2.6 * s * a, dy: 2.6 * s * b };
		}
		case 'shockwave': {
			// One sharp swell that rings down, each time a note is opened or edited.
			const age = context.impulseAge;
			if (age === undefined || !Number.isFinite(age) || age < 0 || age > 3) return NO_MOTION;
			return { scale: 1 + 0.12 * s * Math.exp(-age * 3.2) * Math.cos(age * 13), dx: 0, dy: 0 };
		}
		case 'panic': {
			// Calm, then a flicker that builds faster and faster, then a sudden calm again.
			const period = 60 / m.speeds.panic;
			const q = (seconds - Math.floor(seconds / period) * period) / period;
			const env = q < 0.7 ? (q / 0.7) ** 2 : Math.max(0, 1 - (q - 0.7) / 0.08);
			const rate = 9 + 18 * env;
			const a = Math.sin(2 * Math.PI * rate * seconds) + 0.6 * Math.sin(2 * Math.PI * rate * 1.73 * seconds + 0.9);
			const b = Math.sin(2 * Math.PI * rate * 0.91 * seconds + 1.9) + 0.6 * Math.sin(2 * Math.PI * rate * 1.37 * seconds);
			return { scale: 1 + 0.025 * s * env * a, dx: 3.5 * s * env * a, dy: 3.5 * s * env * b };
		}
		case 'shiver': {
			// Every so often a sudden flinch (the graph shrinks back), then a trembling that dies away.
			const period = 60 / m.speeds.shiver;
			const q = seconds - Math.floor(seconds / period) * period;
			const flinch = q < 0.4 ? Math.sin((Math.PI * q) / 0.4) * Math.exp(-q * 2) * 1.6 : 0;
			const tremble = Math.exp(-q / 0.9) * s;
			const shake = Math.sin(2 * Math.PI * 24 * seconds);
			return { scale: 1 - 0.06 * s * flinch, dx: 3 * tremble * shake, dy: 2 * tremble * Math.sin(2 * Math.PI * 19 * seconds + 0.7) };
		}
	}
}
