import type { Skin } from '../render/skins';
import { compileExpression } from './expression';

/**
 * The Fast Graph pack format: a plain JSON file that can hold themes, shapes and layouts, and no code.
 * validatePack checks everything, reports every problem with its path, and returns a fully filled-in pack.
 * See docs/pack-format.md.
 */
export const PACK_FORMAT = 'fast-graph-pack';
export const PACK_VERSION = 1;

export const PACK_LIMITS = {
	maxBytes: 256 * 1024,
	maxItemsPerKind: 8,
	maxSolids: 64,
	maxRegions: 20,
	maxPoints: 5000,
	maxParams: 16,
	maxSamples: 20000,
	maxName: 80,
	coordinate: 4,
} as const;

export interface ValidationIssue {
	/** For example "shapes[0].solids[2].radius". */
	path: string;
	message: string;
}

export type PackResult = { ok: true; pack: Pack; warnings: ValidationIssue[] } | { ok: false; errors: ValidationIssue[] };

export type Vec3 = [number, number, number];

export interface PackParam {
	id: string;
	name: string;
	default: number;
	min: number;
	max: number;
	step: number;
}

export interface ThemeDef {
	id: string;
	name: string;
	/** Fill behind the graph, or null for Obsidian's own background. */
	base: string | null;
	/** Node colours from the least to the most connected. */
	nodeColours: string[];
	link: { colour: string; alpha: number; curved: boolean; pulses: boolean };
	accent: string;
	label: string;
	glow: boolean;
	starfield: boolean;
	animated: boolean;
	backdrop: { colours: string[]; seed: number };
}

export type Solid =
	| { type: 'sphere'; at: Vec3; radius: number }
	| { type: 'ellipsoid'; at: Vec3; size: Vec3 }
	| { type: 'capsule'; from: Vec3; to: Vec3; radius: number }
	| { type: 'box'; at: Vec3; size: Vec3; round: number };

export interface Region {
	name: string;
	/** A search query (same language as colour groups) choosing which notes belong here. */
	match: string;
	solids: Solid[];
}

/** A named group of target points; notes whose `match` query fits go to these points only (see volume regions). */
export interface PointRegion {
	name: string;
	match: string;
	points: Vec3[];
	/** Each note in this region gets one point of its own, in order of how connected it is (most connected first), instead of the nearest point. */
	exclusive: boolean;
}

interface ShapeBase {
	id: string;
	name: string;
}
export type ShapeDef =
	| (ShapeBase & { kind: 'spiral'; arms: number; twist: number; bulge: number; thickness: number })
	| (ShapeBase & { kind: 'volume'; smooth: number; solids: Solid[]; regions: Region[] })
	| (ShapeBase & {
			kind: 'parametric';
			/** Curve mode: one range for t. Surface mode: ranges for u and v. */
			t: [number, number] | null;
			u: [number, number] | null;
			v: [number, number] | null;
			x: string;
			y: string;
			z: string;
			thickness: number;
			samples: number;
			/** Fill the closed outline and give it a pillow thickness (curve mode only). */
			fill: { depth: number; falloff: number } | null;
	  })
	| (ShapeBase & { kind: 'implicit'; value: string; bounds: number; resolution: number })
	| (ShapeBase & { kind: 'points'; points: Vec3[]; regions: PointRegion[] });

export interface LayoutDef {
	id: string;
	name: string;
	dimensions: 2 | 3;
	forces: { centre: number; repel: number; link: number; linkDistance: number; gravity: number; shapeStrength: number };
	/** Id of a shape in this pack, or null. */
	shape: string | null;
	/** Id of a theme in this pack, or null. */
	theme: string | null;
	/** Show the shape as a faint dotted guide in the flat view. */
	guide: boolean;
}

export interface Pack {
	format: typeof PACK_FORMAT;
	version: typeof PACK_VERSION;
	id: string;
	name: string;
	author: string;
	license: string;
	description: string;
	params: PackParam[];
	themes: ThemeDef[];
	shapes: ShapeDef[];
	layouts: LayoutDef[];
}

// ---------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const HEX = /^#[0-9a-f]{6}$/i;

class Ctx {
	errors: ValidationIssue[] = [];
	warnings: ValidationIssue[] = [];
	error(path: string, message: string): void {
		this.errors.push({ path, message });
	}
	warn(path: string, message: string): void {
		this.warnings.push({ path, message });
	}
}

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const at = (path: string, key: string): string => (path ? `${path}.${key}` : key);

function rec(c: Ctx, v: unknown, path: string): Rec | null {
	if (isRec(v)) return v;
	c.error(path, 'Expected an object');
	return null;
}

function allow(c: Ctx, r: Rec, path: string, keys: readonly string[]): void {
	for (const k of Object.keys(r)) if (!keys.includes(k)) c.warn(at(path, k), 'Unknown field, ignored');
}

function str(c: Ctx, r: Rec, key: string, path: string, opts: { required?: boolean; max?: number; def?: string; pattern?: RegExp; patternHint?: string } = {}): string {
	const p = at(path, key);
	const v = r[key];
	if (v === undefined) {
		if (opts.required) c.error(p, 'Required');
		return opts.def ?? '';
	}
	if (typeof v !== 'string') {
		c.error(p, 'Expected text');
		return opts.def ?? '';
	}
	if (opts.max !== undefined && v.length > opts.max) c.error(p, `Longer than ${opts.max} characters`);
	if (opts.pattern && !opts.pattern.test(v)) c.error(p, opts.patternHint ?? 'Invalid format');
	return v;
}

function num(c: Ctx, r: Rec, key: string, path: string, min: number, max: number, def: number, opts: { int?: boolean } = {}): number {
	const p = at(path, key);
	const v = r[key];
	if (v === undefined) return def;
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		c.error(p, 'Expected a number');
		return def;
	}
	if (v < min || v > max) {
		c.error(p, `Must be between ${min} and ${max}`);
		return def;
	}
	if (opts.int && !Number.isInteger(v)) {
		c.error(p, 'Must be a whole number');
		return def;
	}
	return v;
}

function bool(c: Ctx, r: Rec, key: string, path: string, def: boolean): boolean {
	const v = r[key];
	if (v === undefined) return def;
	if (typeof v !== 'boolean') {
		c.error(at(path, key), 'Expected true or false');
		return def;
	}
	return v;
}

function hex(c: Ctx, v: unknown, path: string, def: string): string {
	if (typeof v === 'string' && HEX.test(v)) return v.toLowerCase();
	c.error(path, 'Expected a colour like #ff8800');
	return def;
}

function vec3(c: Ctx, v: unknown, path: string, lo: number, hi: number, def: Vec3): Vec3 {
	if (!Array.isArray(v) || (v.length !== 3 && v.length !== 2)) {
		c.error(path, 'Expected [x, y, z]');
		return def;
	}
	const out: number[] = [];
	for (let i = 0; i < 3; i++) {
		const n: unknown = i < v.length ? (v[i] as unknown) : 0;
		if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi) {
			c.error(`${path}[${i}]`, `Expected a number between ${lo} and ${hi}`);
			return def;
		}
		out.push(n);
	}
	return out as Vec3;
}

function range(c: Ctx, v: unknown, path: string): [number, number] | null {
	if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number' || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) {
		c.error(path, 'Expected a range like [0, 6.2832]');
		return null;
	}
	if (v[0] >= v[1]) {
		c.error(path, 'The first number must be smaller than the second');
		return null;
	}
	if (Math.abs(v[0]) > 1000 || Math.abs(v[1]) > 1000) {
		c.error(path, 'Range limits must be within -1000 and 1000');
		return null;
	}
	return [v[0], v[1]];
}

function list(c: Ctx, v: unknown, path: string, max: number): unknown[] {
	if (v === undefined) return [];
	if (!Array.isArray(v)) {
		c.error(path, 'Expected a list');
		return [];
	}
	if (v.length > max) {
		c.error(path, `At most ${max} items`);
		return v.slice(0, max);
	}
	return v;
}

function id(c: Ctx, r: Rec, path: string, seen: Set<string>): string {
	const value = str(c, r, 'id', path, { required: true, pattern: ID, patternHint: 'Use 1 to 48 lower-case letters, digits, - or _' });
	if (seen.has(value)) c.error(at(path, 'id'), `Duplicate id '${value}'`);
	seen.add(value);
	return value;
}

// ---- themes ------------------------------------------------------------------------------

function theme(c: Ctx, raw: unknown, path: string, seen: Set<string>): ThemeDef | null {
	const r = rec(c, raw, path);
	if (!r) return null;
	allow(c, r, path, ['id', 'name', 'base', 'nodeColours', 'link', 'accent', 'label', 'glow', 'starfield', 'animated', 'backdrop']);
	const out: ThemeDef = {
		id: id(c, r, path, seen),
		name: str(c, r, 'name', path, { max: PACK_LIMITS.maxName, def: '' }),
		base: null,
		nodeColours: [],
		link: { colour: '#888888', alpha: 0.3, curved: false, pulses: false },
		accent: '#ffffff',
		label: '#dddddd',
		glow: bool(c, r, 'glow', path, false),
		starfield: bool(c, r, 'starfield', path, false),
		animated: bool(c, r, 'animated', path, false),
		backdrop: { colours: [], seed: 1 },
	};
	if (!out.name) out.name = out.id;
	if (r.base !== undefined && r.base !== null) out.base = hex(c, r.base, at(path, 'base'), '#000000');
	const colours = list(c, r.nodeColours, at(path, 'nodeColours'), 8);
	if (r.nodeColours === undefined || colours.length < 2) c.error(at(path, 'nodeColours'), 'Give 2 to 8 colours');
	colours.forEach((col, i) => out.nodeColours.push(hex(c, col, `${at(path, 'nodeColours')}[${i}]`, '#888888')));
	if (r.link !== undefined) {
		const lr = rec(c, r.link, at(path, 'link'));
		if (lr) {
			allow(c, lr, at(path, 'link'), ['colour', 'alpha', 'curved', 'pulses']);
			if (lr.colour !== undefined) out.link.colour = hex(c, lr.colour, at(path, 'link.colour'), '#888888');
			out.link.alpha = num(c, lr, 'alpha', at(path, 'link'), 0, 1, 0.3);
			out.link.curved = bool(c, lr, 'curved', at(path, 'link'), false);
			out.link.pulses = bool(c, lr, 'pulses', at(path, 'link'), false);
		}
	}
	if (r.accent !== undefined) out.accent = hex(c, r.accent, at(path, 'accent'), '#ffffff');
	if (r.label !== undefined) out.label = hex(c, r.label, at(path, 'label'), '#dddddd');
	if (r.backdrop !== undefined) {
		const br = rec(c, r.backdrop, at(path, 'backdrop'));
		if (br) {
			allow(c, br, at(path, 'backdrop'), ['colours', 'seed']);
			const bc = list(c, br.colours, at(path, 'backdrop.colours'), 4);
			bc.forEach((col, i) => out.backdrop.colours.push(hex(c, col, `${at(path, 'backdrop.colours')}[${i}]`, '#000000')));
			out.backdrop.seed = num(c, br, 'seed', at(path, 'backdrop'), 0, 1_000_000, 1, { int: true });
		}
	}
	return out;
}

/** A pack theme as the renderer's skin. */
export function themeToSkin(t: ThemeDef): Skin {
	// The id names the cached background, so it changes whenever the theme does.
	let h = 2166136261;
	const text = JSON.stringify(t);
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	return {
		id: `pack-${t.id}-${(h >>> 0).toString(16)}`,
		buckets: t.nodeColours,
		linkColour: t.link.colour,
		linkAlpha: t.link.alpha,
		accent: t.accent,
		label: t.label,
		base: t.base,
		glow: t.glow,
		curvedLinks: t.link.curved,
		pulses: t.link.pulses,
		animated: t.animated,
		backdrop: { colours: t.backdrop.colours.length > 0 ? t.backdrop.colours : ['#000000'], seed: t.backdrop.seed },
		starfield: t.starfield,
	};
}

// ---- shapes ------------------------------------------------------------------------------

function solid(c: Ctx, raw: unknown, path: string): Solid | null {
	const r = rec(c, raw, path);
	if (!r) return null;
	const K = PACK_LIMITS.coordinate;
	const type = str(c, r, 'type', path, { required: true });
	const pos = (key: string): Vec3 => (r[key] === undefined ? [0, 0, 0] : vec3(c, r[key], at(path, key), -K, K, [0, 0, 0]));
	const size3 = (key: string): Vec3 => {
		if (r[key] === undefined) {
			c.error(at(path, key), 'Required');
			return [1, 1, 1];
		}
		const v = vec3(c, r[key], at(path, key), 0.001, K, [1, 1, 1]);
		return v;
	};
	switch (type) {
		case 'sphere':
			allow(c, r, path, ['type', 'at', 'radius']);
			return { type, at: pos('at'), radius: num(c, r, 'radius', path, 0.001, K, 0.5) };
		case 'ellipsoid':
			allow(c, r, path, ['type', 'at', 'size']);
			return { type, at: pos('at'), size: size3('size') };
		case 'capsule':
			allow(c, r, path, ['type', 'from', 'to', 'radius']);
			return { type, from: pos('from'), to: pos('to'), radius: num(c, r, 'radius', path, 0.001, K, 0.2) };
		case 'box':
			allow(c, r, path, ['type', 'at', 'size', 'round']);
			return { type, at: pos('at'), size: size3('size'), round: num(c, r, 'round', path, 0, 1, 0) };
		default:
			c.error(at(path, 'type'), "Expected 'sphere', 'ellipsoid', 'capsule' or 'box'");
			return null;
	}
}

function solids(c: Ctx, v: unknown, path: string, budget: { left: number }): Solid[] {
	const items = list(c, v, path, PACK_LIMITS.maxSolids);
	const out: Solid[] = [];
	items.forEach((item, i) => {
		budget.left--;
		if (budget.left < 0) {
			if (budget.left === -1) c.error(path, `At most ${PACK_LIMITS.maxSolids} solids in a shape`);
			return;
		}
		const s = solid(c, item, `${path}[${i}]`);
		if (s) out.push(s);
	});
	return out;
}

/** A copy without null fields: a saved (filled-in) pack writes null for "not given", and that must read back the same. */
const withoutNulls = (r: Rec): Rec => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null));

function shape(c: Ctx, raw: unknown, path: string, seen: Set<string>, params: Record<string, number>): ShapeDef | null {
	const first = rec(c, raw, path);
	if (!first) return null;
	const r = withoutNulls(first);
	const base: ShapeBase = { id: id(c, r, path, seen), name: str(c, r, 'name', path, { max: PACK_LIMITS.maxName, def: '' }) };
	if (!base.name) base.name = base.id;
	const kind = str(c, r, 'kind', path, { required: true });
	switch (kind) {
		case 'spiral': {
			allow(c, r, path, ['id', 'name', 'kind', 'arms', 'twist', 'bulge', 'thickness']);
			return { ...base, kind, arms: num(c, r, 'arms', path, 1, 8, 4, { int: true }), twist: num(c, r, 'twist', path, 0, 8, 2.4), bulge: num(c, r, 'bulge', path, 0, 1, 0.18), thickness: num(c, r, 'thickness', path, 0, 1, 0.08) };
		}
		case 'volume': {
			allow(c, r, path, ['id', 'name', 'kind', 'smooth', 'solids', 'regions']);
			const budget = { left: PACK_LIMITS.maxSolids };
			const own = solids(c, r.solids, at(path, 'solids'), budget);
			const regions: Region[] = [];
			list(c, r.regions, at(path, 'regions'), PACK_LIMITS.maxRegions).forEach((raw2, i) => {
				const rp = `${at(path, 'regions')}[${i}]`;
				const rr = rec(c, raw2, rp);
				if (!rr) return;
				allow(c, rr, rp, ['name', 'match', 'solids']);
				const region: Region = { name: str(c, rr, 'name', rp, { required: true, max: PACK_LIMITS.maxName }), match: str(c, rr, 'match', rp, { max: 200, def: '' }), solids: solids(c, rr.solids, at(rp, 'solids'), budget) };
				if (region.solids.length === 0) c.error(at(rp, 'solids'), 'A region needs at least one solid');
				regions.push(region);
			});
			if (own.length === 0 && regions.length === 0) c.error(at(path, 'solids'), 'Give at least one solid or region');
			return { ...base, kind, smooth: num(c, r, 'smooth', path, 0, 0.5, 0.1), solids: own, regions };
		}
		case 'parametric': {
			allow(c, r, path, ['id', 'name', 'kind', 't', 'u', 'v', 'x', 'y', 'z', 'thickness', 'samples', 'fill']);
			const hasT = r.t !== undefined;
			const hasUV = r.u !== undefined || r.v !== undefined;
			let t: [number, number] | null = null;
			let u: [number, number] | null = null;
			let v: [number, number] | null = null;
			if (hasT === hasUV) c.error(path, "Give either 't' (a curve) or both 'u' and 'v' (a surface)");
			else if (hasT) t = range(c, r.t, at(path, 't'));
			else {
				if (r.u === undefined || r.v === undefined) c.error(path, "A surface needs both 'u' and 'v'");
				u = r.u === undefined ? null : range(c, r.u, at(path, 'u'));
				v = r.v === undefined ? null : range(c, r.v, at(path, 'v'));
			}
			const vars = hasT ? ['t'] : ['u', 'v'];
			const formula = (key: 'x' | 'y' | 'z', def: string | null): string => {
				const text = str(c, r, key, path, def === null ? { required: true } : { def });
				if (text !== '') {
					const res = compileExpression(text, vars, params);
					if (!res.ok) c.error(at(path, key), `${res.error} (at character ${res.position + 1})`);
				}
				return text;
			};
			const x = formula('x', null);
			const y = formula('y', null);
			const z = formula('z', '0');
			let fill: { depth: number; falloff: number } | null = null;
			if (r.fill !== undefined) {
				const fr = rec(c, r.fill, at(path, 'fill'));
				if (fr) {
					allow(c, fr, at(path, 'fill'), ['depth', 'falloff']);
					fill = { depth: num(c, fr, 'depth', at(path, 'fill'), 0.01, 2, 0.5), falloff: num(c, fr, 'falloff', at(path, 'fill'), 0.01, 2, 0.45) };
					if (!hasT) c.error(at(path, 'fill'), 'Fill only works with a curve (t)');
					if (z !== '0') c.error(at(path, 'fill'), "Fill makes its own thickness, so leave 'z' out");
				}
			}
			return { ...base, kind, t, u, v, x, y, z, thickness: num(c, r, 'thickness', path, 0, 1, 0.05), samples: num(c, r, 'samples', path, 50, PACK_LIMITS.maxSamples, 4000, { int: true }), fill };
		}
		case 'implicit': {
			allow(c, r, path, ['id', 'name', 'kind', 'value', 'bounds', 'resolution']);
			const value = str(c, r, 'value', path, { required: true });
			if (value !== '') {
				const res = compileExpression(value, ['x', 'y', 'z'], params);
				if (!res.ok) c.error(at(path, 'value'), `${res.error} (at character ${res.position + 1})`);
			}
			return { ...base, kind, value, bounds: num(c, r, 'bounds', path, 0.5, PACK_LIMITS.coordinate, 1.6), resolution: num(c, r, 'resolution', path, 16, 64, 48, { int: true }) };
		}
		case 'points': {
			allow(c, r, path, ['id', 'name', 'kind', 'points', 'regions']);
			const readPoints = (v: unknown, pp: string): Vec3[] => {
				const items = list(c, v, pp, PACK_LIMITS.maxPoints);
				const out: Vec3[] = [];
				for (let i = 0; i < items.length && c.errors.length < 200; i++) out.push(vec3(c, items[i], `${pp}[${i}]`, -PACK_LIMITS.coordinate, PACK_LIMITS.coordinate, [0, 0, 0]));
				return out;
			};
			const pts = readPoints(r.points, at(path, 'points'));
			const regions: PointRegion[] = [];
			list(c, r.regions, at(path, 'regions'), PACK_LIMITS.maxRegions).forEach((raw2, i) => {
				const rp = `${at(path, 'regions')}[${i}]`;
				const rr = rec(c, raw2, rp);
				if (!rr) return;
				allow(c, rr, rp, ['name', 'match', 'points', 'exclusive']);
				const region: PointRegion = { exclusive: bool(c, rr, 'exclusive', rp, false), name: str(c, rr, 'name', rp, { required: true, max: PACK_LIMITS.maxName }), match: str(c, rr, 'match', rp, { max: 200, def: '' }), points: readPoints(rr.points, at(rp, 'points')) };
				if (region.points.length === 0) c.error(at(rp, 'points'), 'A region needs at least one point');
				regions.push(region);
			});
			const total = pts.length + regions.reduce((a2, g) => a2 + g.points.length, 0);
			if (total === 0) c.error(at(path, 'points'), 'Give at least one point');
			if (total > PACK_LIMITS.maxPoints) c.error(at(path, 'points'), `At most ${PACK_LIMITS.maxPoints} points in a shape, all regions together`);
			return { ...base, kind, points: pts, regions };
		}
		default:
			c.error(at(path, 'kind'), "Expected 'spiral', 'volume', 'parametric', 'implicit' or 'points'");
			return null;
	}
}

// ---- layouts and the pack ------------------------------------------------------------------

function layout(c: Ctx, raw: unknown, path: string, seen: Set<string>): LayoutDef | null {
	const r = rec(c, raw, path);
	if (!r) return null;
	allow(c, r, path, ['id', 'name', 'dimensions', 'forces', 'shape', 'theme', 'guide']);
	const out: LayoutDef = {
		id: id(c, r, path, seen),
		name: str(c, r, 'name', path, { max: PACK_LIMITS.maxName, def: '' }),
		dimensions: 2,
		forces: { centre: 0.5, repel: 10, link: 1, linkDistance: 30, gravity: 0.2, shapeStrength: 0.5 },
		shape: null,
		theme: null,
		guide: bool(c, r, 'guide', path, false),
	};
	if (!out.name) out.name = out.id;
	if (r.dimensions !== undefined) {
		if (r.dimensions === 2 || r.dimensions === 3) out.dimensions = r.dimensions;
		else c.error(at(path, 'dimensions'), 'Expected 2 or 3');
	}
	if (r.forces !== undefined) {
		const fr = rec(c, r.forces, at(path, 'forces'));
		if (fr) {
			const fp = at(path, 'forces');
			allow(c, fr, fp, ['centre', 'repel', 'link', 'linkDistance', 'gravity', 'shapeStrength']);
			out.forces = {
				centre: num(c, fr, 'centre', fp, 0, 1, 0.5),
				repel: num(c, fr, 'repel', fp, 0, 20, 10),
				link: num(c, fr, 'link', fp, 0, 1, 1),
				linkDistance: num(c, fr, 'linkDistance', fp, 10, 200, 30),
				gravity: num(c, fr, 'gravity', fp, 0, 1, 0.2),
				shapeStrength: num(c, fr, 'shapeStrength', fp, 0, 1, 0.5),
			};
		}
	}
	for (const key of ['shape', 'theme'] as const) {
		const v = r[key];
		if (v === undefined || v === null) continue;
		if (typeof v === 'string') out[key] = v;
		else c.error(at(path, key), 'Expected the id of a shape or theme in this pack');
	}
	return out;
}

function param(c: Ctx, raw: unknown, path: string, seen: Set<string>): PackParam | null {
	const r = rec(c, raw, path);
	if (!r) return null;
	allow(c, r, path, ['id', 'name', 'default', 'min', 'max', 'step']);
	const pid = id(c, r, path, seen);
	const min = num(c, r, 'min', path, -1000, 1000, 0);
	const max = num(c, r, 'max', path, -1000, 1000, 1);
	if (min >= max) c.error(path, "'min' must be smaller than 'max'");
	const def = num(c, r, 'default', path, min, max, min);
	return { id: pid, name: str(c, r, 'name', path, { max: PACK_LIMITS.maxName, def: pid }), default: def, min, max, step: num(c, r, 'step', path, 0.0001, 1000, 0.1) };
}

/** Checks a parsed pack. Returns the filled-in pack, or every problem found. */
export function validatePack(raw: unknown): PackResult {
	const c = new Ctx();
	const r = rec(c, raw, '');
	if (!r) return { ok: false, errors: c.errors.map((e) => ({ ...e, path: '(file)' })) };
	allow(c, r, '', ['format', 'version', 'id', 'name', 'author', 'license', 'description', 'params', 'themes', 'shapes', 'layouts']);
	if (r.format !== PACK_FORMAT) c.error('format', `Expected "${PACK_FORMAT}"`);
	if (r.version !== PACK_VERSION) c.error('version', r.version === undefined ? `Required: ${PACK_VERSION}` : `This plugin reads version ${PACK_VERSION}, the file says ${JSON.stringify(r.version)}`);
	const packIds = new Set<string>();
	const pack: Pack = {
		format: PACK_FORMAT,
		version: PACK_VERSION,
		id: id(c, r, '', packIds),
		name: str(c, r, 'name', '', { max: PACK_LIMITS.maxName, def: '' }),
		author: str(c, r, 'author', '', { max: PACK_LIMITS.maxName, def: '' }),
		license: str(c, r, 'license', '', { max: PACK_LIMITS.maxName, def: '' }),
		description: str(c, r, 'description', '', { max: 500, def: '' }),
		params: [],
		themes: [],
		shapes: [],
		layouts: [],
	};
	if (!pack.name) pack.name = pack.id;
	const paramIds = new Set<string>();
	list(c, r.params, 'params', PACK_LIMITS.maxParams).forEach((p, i) => {
		const v = param(c, p, `params[${i}]`, paramIds);
		if (v) pack.params.push(v);
	});
	const paramValues: Record<string, number> = {};
	for (const p of pack.params) paramValues[p.id] = p.default;
	const themeIds = new Set<string>();
	list(c, r.themes, 'themes', PACK_LIMITS.maxItemsPerKind).forEach((t, i) => {
		const v = theme(c, t, `themes[${i}]`, themeIds);
		if (v) pack.themes.push(v);
	});
	const shapeIds = new Set<string>();
	list(c, r.shapes, 'shapes', PACK_LIMITS.maxItemsPerKind).forEach((s, i) => {
		const v = shape(c, s, `shapes[${i}]`, shapeIds, paramValues);
		if (v) pack.shapes.push(v);
	});
	const layoutIds = new Set<string>();
	list(c, r.layouts, 'layouts', PACK_LIMITS.maxItemsPerKind).forEach((l, i) => {
		const v = layout(c, l, `layouts[${i}]`, layoutIds);
		if (!v) return;
		if (v.shape !== null && !shapeIds.has(v.shape)) c.error(`layouts[${i}].shape`, `No shape with id '${v.shape}' in this pack`);
		if (v.theme !== null && !themeIds.has(v.theme)) c.error(`layouts[${i}].theme`, `No theme with id '${v.theme}' in this pack`);
		pack.layouts.push(v);
	});
	if (pack.themes.length + pack.shapes.length + pack.layouts.length === 0) c.error('(file)', 'The pack contains no themes, shapes or layouts');
	return c.errors.length > 0 ? { ok: false, errors: c.errors } : { ok: true, pack, warnings: c.warnings };
}

/** Reads pack text: size check, JSON parse, then validatePack. */
export function parsePackText(text: string): PackResult {
	if (text.length > PACK_LIMITS.maxBytes) return { ok: false, errors: [{ path: '(file)', message: `Larger than ${PACK_LIMITS.maxBytes / 1024} KB` }] };
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return { ok: false, errors: [{ path: '(file)', message: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` }] };
	}
	return validatePack(raw);
}
