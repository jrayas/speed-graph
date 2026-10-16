import { parseSimpleColour, type Rgb } from './appearance';

const cache = new Map<string, { rgb: Rgb; alpha: number }>();

/** Any CSS colour as RGB plus alpha. Simple forms are parsed directly; anything else (hsl, names, var results) is resolved by the browser. */
export function parseCssColour(css: string): { rgb: Rgb; alpha: number } {
	const simple = parseSimpleColour(css);
	if (simple) return simple;
	const hit = cache.get(css);
	if (hit) return hit;
	let out: { rgb: Rgb; alpha: number } = { rgb: [136, 136, 136], alpha: 1 };
	const canvas = createEl('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const g = canvas.getContext('2d', { willReadFrequently: true });
	if (g) {
		g.fillStyle = '#888888';
		g.fillStyle = css;
		g.fillRect(0, 0, 1, 1);
		const d = g.getImageData(0, 0, 1, 1).data;
		out = { rgb: [d[0] as number, d[1] as number, d[2] as number], alpha: (d[3] as number) / 255 };
	}
	cache.set(css, out);
	return out;
}
