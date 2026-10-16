/**
 * Electrons: small bright dots that travel along links, each with a short fading tail, like current
 * in a circuit. Pure helpers shared by the flat and the 3D renderer; they decide WHICH links carry
 * an electron and WHERE it is, and the renderers do the drawing.
 *
 * To stay cheap on big graphs only a fixed share of the links carry one (never more than
 * ELECTRON_MAX), chosen by a steady stride so the same links are used on every frame.
 */
export const ELECTRON_MAX = 2500;
/** Links shorter than this on screen are too short to show a moving dot. */
export const ELECTRON_MIN_LINK_PX = 16;
/** How far behind the head each tail dot sits, in pixels, and how bright it is compared with the head. */
export const ELECTRON_TAIL_PX = [0, 7, 14, 21] as const;
export const ELECTRON_TAIL_ALPHA = [1, 0.55, 0.32, 0.16] as const;

export interface ElectronSettings {
	enabled: boolean;
	/** Pixels per second along the link, the same for long and short links. */
	speed: number;
	/** 0 to 1: the share of ELECTRON_MAX links that carry one. */
	amount: number;
}

export const ELECTRON_SPEED_RANGE = [20, 200, 5] as const;
export const ELECTRON_AMOUNT_RANGE = [0.05, 1, 0.05] as const;
export const DEFAULT_ELECTRONS: ElectronSettings = { enabled: false, speed: 70, amount: 0.4 };

/** Every how-many-th link carries an electron, so that at most about `ELECTRON_MAX x amount` do. */
export function electronStride(totalLinks: number, amount: number): number {
	const share = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
	const cap = Math.max(40, Math.round(ELECTRON_MAX * share));
	return Math.max(1, Math.floor(totalLinks / cap));
}

/** A steady number from 0 up to (not including) 1 for each link, so electrons do not start in step. */
export function electronOffset(index: number): number {
	let h = Math.imul(index + 1, 0x9e3779b1) >>> 0;
	h ^= h >>> 15;
	h = Math.imul(h, 0x85ebca6b) >>> 0;
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** How far along its link (0 at the source note, 1 at the target) the electron on link `index` is. Repeats forever. */
export function electronT(seconds: number, index: number, lengthPx: number, speedPx: number): number {
	if (!(lengthPx > 0) || !Number.isFinite(seconds)) return 0;
	const t = electronOffset(index) + (seconds * speedPx) / lengthPx;
	return t - Math.floor(t);
}

export function mergeElectrons(raw: { enabled?: unknown; speed?: unknown; amount?: unknown } | null | undefined): ElectronSettings {
	const out = { ...DEFAULT_ELECTRONS };
	if (!raw) return out;
	if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
	if (typeof raw.speed === 'number' && Number.isFinite(raw.speed)) out.speed = Math.min(ELECTRON_SPEED_RANGE[1], Math.max(ELECTRON_SPEED_RANGE[0], raw.speed));
	if (typeof raw.amount === 'number' && Number.isFinite(raw.amount)) out.amount = Math.min(ELECTRON_AMOUNT_RANGE[1], Math.max(ELECTRON_AMOUNT_RANGE[0], raw.amount));
	return out;
}
