/**
 * How bright, vivid and large everything is drawn. Every default is the neutral value, so the graph
 * looks exactly as it did before until a slider is moved. Pure code, unit-tested; the renderers apply it.
 */
export interface Look {
	/** Everything: node, link and label colours, glow and backdrop. */
	brightness: number;
	/** 0 is grey, 1 normal, 2 vivid. */
	saturation: number;
	nodeBrightness: number;
	/** Multiplies how solid nodes are. */
	nodeOpacity: number;
	/** Multiplies link opacity. */
	linkBrightness: number;
	labelBrightness: number;
	/** Label text size in pixels. */
	labelSize: number;
	/** Skin backdrop (nebula, stars, base colour). */
	backgroundBrightness: number;
	/** Halo around glowing nodes. */
	glowStrength: number;
	/** Speed of twinkle, pulses and auto-rotation. */
	effectsSpeed: number;
	useNodeColour: boolean;
	nodeColour: string;
	useLinkColour: boolean;
	linkColour: string;
	useBackgroundColour: boolean;
	backgroundColour: string;
	/** 3D field of view in degrees. */
	fov: number;
	/** 3D: how strongly far links fade. */
	depthFade: number;
}

export const DEFAULT_LOOK: Look = {
	brightness: 1,
	saturation: 1,
	nodeBrightness: 1,
	nodeOpacity: 1,
	linkBrightness: 1,
	labelBrightness: 1,
	labelSize: 12,
	backgroundBrightness: 1,
	glowStrength: 1,
	effectsSpeed: 1,
	useNodeColour: false,
	nodeColour: '#ff8fb1',
	useLinkColour: false,
	linkColour: '#78b8ff',
	useBackgroundColour: false,
	backgroundColour: '#0b0b12',
	fov: 50,
	depthFade: 1,
};

/** min, max, step for each number, used by the settings page and for clamping saved data. */
export const LOOK_RANGES = {
	brightness: [0.2, 2.5, 0.05],
	saturation: [0, 2, 0.05],
	nodeBrightness: [0.2, 2.5, 0.05],
	nodeOpacity: [0.1, 1, 0.05],
	linkBrightness: [0, 3, 0.05],
	labelBrightness: [0.2, 2.5, 0.05],
	labelSize: [8, 24, 1],
	backgroundBrightness: [0, 2, 0.05],
	glowStrength: [0, 2, 0.05],
	effectsSpeed: [0, 3, 0.1],
	fov: [20, 90, 1],
	depthFade: [0, 1.5, 0.05],
} as const;

export type LookNumberKey = keyof typeof LOOK_RANGES;
const HEX = /^#[0-9a-f]{6}$/i;

/** Merges saved data over the defaults, clamping numbers and ignoring anything malformed. */
export function mergeLook(raw: unknown): Look {
	const data = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
	const out: Look = { ...DEFAULT_LOOK };
	for (const key of Object.keys(LOOK_RANGES) as LookNumberKey[]) {
		const [min, max] = LOOK_RANGES[key];
		const v = data[key];
		out[key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAULT_LOOK[key];
	}
	for (const key of ['useNodeColour', 'useLinkColour', 'useBackgroundColour'] as const) {
		if (typeof data[key] === 'boolean') out[key] = data[key];
	}
	for (const key of ['nodeColour', 'linkColour', 'backgroundColour'] as const) {
		const v = data[key];
		if (typeof v === 'string' && HEX.test(v)) out[key] = v.toLowerCase();
	}
	return out;
}

export type Rgb = [number, number, number];

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** Saturation first (0 = grey), then brightness (a plain multiplier), clamped to the colour range. */
export function adjustRgb(rgb: Rgb, brightness: number, saturation: number): Rgb {
	const grey = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
	const out: Rgb = [0, 0, 0];
	for (let i = 0; i < 3; i++) out[i] = clamp255((grey + ((rgb[i] as number) - grey) * saturation) * brightness);
	return out;
}

export function rgbToCss(rgb: Rgb, alpha = 1): string {
	return alpha >= 1 ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Parses #rgb, #rrggbb, rgb() and rgba(); null for anything else (renderers then ask the browser). */
export function parseSimpleColour(text: string): { rgb: Rgb; alpha: number } | null {
	const t = text.trim().toLowerCase();
	let m = /^#([0-9a-f]{3})$/.exec(t);
	if (m) {
		const h = m[1] as string;
		return { rgb: [parseInt(h[0] as string, 16) * 17, parseInt(h[1] as string, 16) * 17, parseInt(h[2] as string, 16) * 17], alpha: 1 };
	}
	m = /^#([0-9a-f]{6})$/.exec(t);
	if (m) {
		const h = m[1] as string;
		return { rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], alpha: 1 };
	}
	m = /^rgba?\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)[,\s]+(-?[\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(t);
	if (m) {
		const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
		return { rgb: [clamp255(parseFloat(m[1] as string)), clamp255(parseFloat(m[2] as string)), clamp255(parseFloat(m[3] as string))], alpha: Math.max(0, Math.min(1, a)) };
	}
	return null;
}

/** An opacity multiplier that can never push an alpha above 1 or below 0. */
export function scaleAlpha(alpha: number, factor: number): number {
	return Math.max(0, Math.min(1, alpha * factor));
}

/** Field of view in radians. */
export function fovRadians(look: Look): number {
	return (look.fov * Math.PI) / 180;
}
