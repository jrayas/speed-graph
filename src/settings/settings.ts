import type { ColorGroup } from '../data/groups';
import { DEFAULT_LOOK, mergeLook, type Look } from '../render/appearance';
import { DEFAULT_DRIFT, mergeDrift, type DriftSettings } from '../render/drift';
import { DEFAULT_ELECTRONS, mergeElectrons, type ElectronSettings } from '../render/electrons';
import { DEFAULT_MOTION, mergeMotion, type Motion } from '../render/motion';
import { SKIN_NAMES } from '../render/skins';
import type { LayoutParams } from '../worker/worker';

/** Values shown in the graph view's own panel. Defaults are ours, not Obsidian's. */
export interface GraphSettings {
	/** 0 to 1: how strongly nodes are pulled to the centre (gravity = 0.4 x this). */
	centerForce: number;
	/** 0 to 20: repel strength. The engine uses -3 times this. */
	repelForce: number;
	/** 0 to 1: multiplier on the link force. */
	linkForce: number;
	/** 10 to 200: preferred link length in world units. */
	linkDistance: number;
	/** 0.5 to 3: multiplier on node size. */
	nodeSize: number;
	/** 0.5 to 4: link line width in pixels. */
	linkThickness: number;
	showArrows: boolean;
	/** Draw crowded areas as bubbles with a count when zoomed out. */
	clusters: boolean;
	/** Small bright dots travelling along the links, with a tail. Off by default. */
	electrons: ElectronSettings;
	/** A gentle, endless wandering of every note so the graph feels alive. Drawing only: the layout is untouched. Off by default. */
	drift: DriftSettings;
	/** The right and middle buttons also drag the view (the left button always does). Touch is unchanged. */
	rightButtonPan: boolean;
	/** Show the graph in 3D (orbit camera). Off by default. */
	view3d: boolean;
	/** Slowly turn the 3D view while you are not touching it. */
	autoRotate: boolean;
	/** Brightness, colour, glow and label controls (settings page). */
	look: Look;
	/** A pack layout ("packId/layoutId") whose shape, forces and theme are used, or '' for the normal graph. */
	activeLayout: string;
	/** 0 to 1: how firmly notes are pulled into the shape of the active pack layout. */
	shapeStrength: number;
	/** Whole-graph motion: heartbeat, breathing, vibrate, scared. Off by default. */
	motion: Motion;
	/** 'default' (our current look), 'galaxy' or 'brain'. */
	skin: string;
	/** Moving skin effects: twinkling stars, pulses along links. */
	skinEffects: boolean;
	/** 0 to 3: labels fade in once the zoom level passes this. */
	textFadeThreshold: number;
	/** Show the layout settling live (on) or only the finished result (off). */
	animate: boolean;
	/** Filter query (see data/search.ts). */
	search: string;
	showAttachments: boolean;
	showOrphans: boolean;
	/** "Existing files only": hide links to notes that do not exist. */
	hideUnresolved: boolean;
	/** Folders left out of the graph, one per line. */
	excludedFolders: string;
	groups: ColorGroup[];
	/** Show only the active note and the notes within `localDepth` links of it. */
	localGraph: boolean;
	/** 1 to 5: how many links away the local graph reaches. */
	localDepth: number;
}

export const DEFAULT_SETTINGS: GraphSettings = {
	centerForce: 0.5,
	repelForce: 10,
	linkForce: 1,
	linkDistance: 30,
	nodeSize: 1,
	linkThickness: 1,
	showArrows: false,
	clusters: false,
	rightButtonPan: true,
	electrons: { ...DEFAULT_ELECTRONS },
	drift: { ...DEFAULT_DRIFT },
	view3d: false,
	autoRotate: false,
	look: { ...DEFAULT_LOOK },
	activeLayout: '',
	shapeStrength: 0.5,
	motion: { ...DEFAULT_MOTION, speeds: { ...DEFAULT_MOTION.speeds } },
	skin: 'default',
	skinEffects: true,
	textFadeThreshold: 1,
	animate: true,
	search: '',
	showAttachments: false,
	showOrphans: true,
	hideUnresolved: false,
	excludedFolders: '',
	groups: [],
	localGraph: false,
	localDepth: 1,
};

export const RANGES = {
	centerForce: [0, 1, 0.01],
	repelForce: [0, 20, 0.5],
	linkForce: [0, 1, 0.01],
	linkDistance: [10, 200, 1],
	nodeSize: [0.5, 3, 0.1],
	linkThickness: [0.5, 4, 0.1],
	textFadeThreshold: [0, 3, 0.1],
	localDepth: [1, 5, 1],
	shapeStrength: [0, 1, 0.05],
} as const;

type NumericKey = keyof typeof RANGES;

function clampNumber(value: unknown, key: NumericKey): number {
	const [min, max] = RANGES[key];
	const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_SETTINGS[key];
	return Math.min(max, Math.max(min, n));
}

/** Merges saved data over the defaults, ignoring anything of the wrong type. */
export function mergeSettings(raw: unknown): GraphSettings {
	const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	const out: GraphSettings = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(RANGES) as NumericKey[]) out[key] = clampNumber(data[key], key);
	if (typeof data.showArrows === 'boolean') out.showArrows = data.showArrows;
	if (typeof data.animate === 'boolean') out.animate = data.animate;
	if (typeof data.clusters === 'boolean') out.clusters = data.clusters;
	if (typeof data.skin === 'string' && Object.prototype.hasOwnProperty.call(SKIN_NAMES, data.skin)) out.skin = data.skin;
	if (typeof data.skinEffects === 'boolean') out.skinEffects = data.skinEffects;
	if (typeof data.view3d === 'boolean') out.view3d = data.view3d;
	if (typeof data.autoRotate === 'boolean') out.autoRotate = data.autoRotate;
	if (typeof data.search === 'string') out.search = data.search.slice(0, 500);
	if (typeof data.showAttachments === 'boolean') out.showAttachments = data.showAttachments;
	if (typeof data.showOrphans === 'boolean') out.showOrphans = data.showOrphans;
	if (typeof data.hideUnresolved === 'boolean') out.hideUnresolved = data.hideUnresolved;
	if (typeof data.excludedFolders === 'string') out.excludedFolders = data.excludedFolders.slice(0, 4000);
	// The focus (local graph) toggle is for the current session only: it always starts off.
	out.localGraph = false;
	out.localDepth = Math.round(out.localDepth);
	out.groups = mergeGroups(data.groups);
	out.look = mergeLook(data.look);
	out.motion = mergeMotion(data.motion);
	if (typeof data.rightButtonPan === 'boolean') out.rightButtonPan = data.rightButtonPan;
	out.drift = mergeDrift(typeof data.drift === 'object' ? data.drift : null);
	out.electrons = mergeElectrons(typeof data.electrons === 'object' ? data.electrons : null);
	if (typeof data.activeLayout === 'string') out.activeLayout = data.activeLayout.slice(0, 120);
	return out;
}

const MAX_GROUPS = 20;
const COLOR = /^#[0-9a-f]{3,8}$/i;

/** Keeps only well-formed groups: a text query and a #hex colour. */
export function mergeGroups(raw: unknown): ColorGroup[] {
	if (!Array.isArray(raw)) return [];
	const out: ColorGroup[] = [];
	for (const item of raw.slice(0, MAX_GROUPS) as unknown[]) {
		const g = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
		if (typeof g.query === 'string' && typeof g.color === 'string' && COLOR.test(g.color)) {
			out.push({ query: g.query.slice(0, 200), color: g.color });
		}
	}
	return out;
}

/** `gravity` replaces the usual 0.4 x centre force (a pack layout sets it directly). */
export function toLayoutParams(s: GraphSettings, gravity?: number): LayoutParams {
	return {
		centerStrength: 1,
		repelStrength: -3 * s.repelForce,
		linkStrength: s.linkForce,
		linkDistance: s.linkDistance,
		theta: 0.9,
		velocityDecay: 0.4,
		gravity: gravity ?? 0.4 * s.centerForce,
		// No repel range limit: a limit shorter than the start layout left its spiral pattern in big graphs (ADR 0008).
		repelMaxDistance: Infinity,
	};
}
