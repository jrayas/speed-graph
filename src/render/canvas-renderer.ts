import type { Adjacency } from '../data/adjacency';
import { DEFAULT_LOOK, adjustRgb, rgbToCss, scaleAlpha, type Look } from './appearance';
import { aggregateLinks, clusterNodes, hitCluster, type Clusters } from './cluster';
import { parseCssColour } from './css-colour';
import { curveControl, curveSide, makeStarfield, pickPulseEdges, pulseT, quadPoint, degreeBuckets, seededRandom, type Skin, type Star } from './skins';
import { type ViewTransform } from './transform';
import { NO_MOTION, type MotionFrame } from './motion';
import { driftAmplitudePx, driftOmega, driftUnit, makeDriftSeeds, type DriftSettings } from './drift';
import { ELECTRON_MIN_LINK_PX, ELECTRON_TAIL_ALPHA, ELECTRON_TAIL_PX, electronStride, electronT, type ElectronSettings } from './electrons';

export interface RenderData {
	capacity: number;
	alive: Uint8Array;
	edges: Uint32Array;
	adjacency: Adjacency;
	/** Link count per node (for skins that colour by how connected a node is). */
	degree: Uint32Array;
	/** Node radius in world units. */
	radiusWorld: Float32Array;
	labelOf: (id: number) => string;
}

export interface RenderOptions {
	/** Draw crowded areas as bubbles with a count when zoomed out. */
	clusters: boolean;
	linkThickness: number;
	showArrows: boolean;
	textFadeThreshold: number;
	/** Moving dots along the links. */
	electrons?: ElectronSettings;
	/** A gentle wandering of every note while drawing. */
	drift?: DriftSettings;
}

interface Colours {
	node: string;
	accent: string;
	link: string;
	label: string;
}

const OUT_VIEW = 16;
const MAX_LABELS = 300;
/** Grid cell for bubbles, in screen pixels, and how many nodes make a cell a bubble. */
const CLUSTER_CELL_PX = 28;
const CLUSTER_MIN = 8;
/** Less than half a cell, so neighbouring bubbles do not overlap. */
const BUBBLE_MAX_RADIUS = 13;
/** Skins cap how big a node can get on screen (the default skin does not), so zooming in stays tidy. */
const SKIN_MAX_NODE_PX = 15;

/** Radius of a bubble standing for `count` nodes, in screen pixels. */
export function bubbleRadius(count: number): number {
	return Math.min(BUBBLE_MAX_RADIUS, 3 + 1.8 * Math.sqrt(count));
}

/** Canvas 2D renderer: draws precomputed positions, batching each style into one path. */
export class CanvasRenderer {
	private readonly ctx: CanvasRenderingContext2D;
	private data: RenderData | null = null;
	private positions: Float32Array = new Float32Array(0);
	private screen: Float32Array = new Float32Array(0);
	private codes: Uint8Array = new Uint8Array(0);
	private marks: Uint8Array = new Uint8Array(0);
	/** 1 = shown. Starts as the data's `alive` mask; filters replace it. */
	private visible: Uint8Array = new Uint8Array(0);
	/** Per node: 0 = default colour, n = the n-th colour group. */
	private groupOf: Uint8Array = new Uint8Array(0);
	private groupColours: string[] = [];
	private groupCounts: number[] = [0];
	private transform: ViewTransform = { x: 0, y: 0, k: 1 };
	private motion: MotionFrame = NO_MOTION;
	private options: RenderOptions = { clusters: true, linkThickness: 1, showArrows: false, textFadeThreshold: 1 };
	private clusterState: Clusters | null = null;
	private skin: Skin | null = null;
	private effects = true;
	private suspended = false;
	private look: Look = DEFAULT_LOOK;
	private readonly toneCache = new Map<string, string>();
	/** Time for effects, scaled by the speed setting. */
	private fxTime = 0;
	/** Colour class per node: skin bucket, or 'group n' when a colour group applies. */
	private classOf: Uint8Array = new Uint8Array(0);
	private classColours: string[] = [];
	private classCounts: number[] = [0];
	private stars: Star[] = [];
	private nebula: HTMLCanvasElement | null = null;
	private nebulaFor = '';
	private readonly sprites = new Map<string, HTMLCanvasElement>();
	private pulseEdges: Int32Array = new Int32Array(0);
	private animTimer = 0;
	private time = 0;
	private drawn: Uint8Array = new Uint8Array(0);
	private pickable: Uint8Array = new Uint8Array(0);
	private highlight = -1;
	private driftSeeds: Float32Array = new Float32Array(0);
	private readonly driftTmp = [0, 0, 0];
	/** How still each recently hovered note is held (0 = drifting freely, 1 = still); eased so it never pops. */
	private readonly calm = new Map<number, number>();
	private calmAt = 0;
	private width = 1;
	private height = 1;
	private dpr = 1;
	private colours: Colours = { node: '#888', accent: '#7b6cd9', link: '#888', label: '#ddd' };
	private font = 'sans-serif';
	private frame = 0;
	private labelCache = new Map<number, string>();
	/** Duration of the last draw call, for the frame-time readout. */
	lastDrawMs = 0;

	constructor(private readonly canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D is not available');
		this.ctx = ctx;
		this.refreshColours();
	}

	/** Re-reads theme colours from Obsidian's CSS variables. */
	refreshColours(): void {
		const style = getComputedStyle(this.canvas);
		const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
		this.colours = {
			node: read('--text-muted', '#888'),
			accent: read('--interactive-accent', '#7b6cd9'),
			link: read('--text-faint', '#888'),
			label: read('--text-normal', '#ddd'),
		};
		this.font = style.fontFamily || 'sans-serif';
		this.requestDraw();
	}

	resize(width: number, height: number, dpr: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.dpr = dpr;
		this.canvas.width = Math.round(this.width * dpr);
		this.canvas.height = Math.round(this.height * dpr);
		this.requestDraw();
	}

	setData(data: RenderData): void {
		this.data = data;
		this.visible = data.alive;
		this.groupOf = new Uint8Array(data.capacity);
		this.groupCounts = [data.capacity];
		this.screen = new Float32Array(data.capacity * 2);
		this.codes = new Uint8Array(data.capacity);
		this.drawn = new Uint8Array(data.capacity);
		this.pickable = new Uint8Array(data.capacity);
		this.clusterState = null;
		this.pulseEdges = pickPulseEdges(data.edges.length / 2, 220, 99);
		this.rebuildClasses();
		this.labelCache.clear();
		this.setHighlight(-1);
	}

	/** Which nodes to draw (1 = shown). Must have the data's capacity. */
	setVisible(mask: Uint8Array): void {
		this.visible = mask;
		this.requestDraw();
	}

	/** `colours[n - 1]` is the colour of group n; `assignment[id]` is the node's group (0 = none). */
	setGroups(colours: string[], assignment: Uint8Array): void {
		this.groupColours = colours;
		this.groupOf = assignment;
		const counts = new Array<number>(colours.length + 1).fill(0);
		for (let i = 0; i < assignment.length; i++) {
			const g = assignment[i] as number;
			counts[g] = (counts[g] ?? 0) + 1;
		}
		this.groupCounts = counts;
		this.rebuildClasses();
		this.requestDraw();
	}

	/** Brightness, colour, glow and label settings. Neutral values draw exactly as before. */
	setLook(look: Look): void {
		this.look = look;
		this.toneCache.clear();
		this.updateAnimation();
		this.requestDraw();
	}

	/** A colour with saturation and the given brightness applied. Neutral settings return the colour untouched. */
	private tone(css: string, brightness: number): string {
		const sat = this.look.saturation;
		if (brightness === 1 && sat === 1) return css;
		const key = `${css}|${brightness}|${sat}`;
		const hit = this.toneCache.get(key);
		if (hit !== undefined) return hit;
		const p = parseCssColour(css);
		const out = rgbToCss(adjustRgb(p.rgb, brightness, sat), p.alpha);
		this.toneCache.set(key, out);
		return out;
	}

	/** While suspended (the 3D view is showing) nothing is drawn and the effects loop is off. */
	setSuspended(on: boolean): void {
		this.suspended = on;
		if (on) window.clearTimeout(this.animTimer);
		else this.updateAnimation();
		this.requestDraw();
	}

	/** Switches the look. null is the default (Obsidian's own colours, plain dots and lines). */
	setSkin(skin: Skin | null): void {
		this.skin = skin;
		this.rebuildClasses();
		this.updateAnimation();
		this.requestDraw();
	}

	/** Turns moving effects (twinkle, pulses) on or off. They also stay off if the system asks for reduced motion. */
	setEffects(on: boolean): void {
		this.effects = on;
		this.updateAnimation();
		this.requestDraw();
	}

	private get palette(): { node: string; accent: string; link: string; label: string } {
		const skin = this.skin;
		const look = this.look;
		const b = look.brightness;
		const baseNode = look.useNodeColour ? look.nodeColour : skin ? (skin.buckets[2] ?? this.colours.node) : this.colours.node;
		const baseLink = look.useLinkColour ? look.linkColour : skin ? skin.linkColour : this.colours.link;
		return {
			node: this.tone(baseNode, b * look.nodeBrightness),
			accent: this.tone(skin ? skin.accent : this.colours.accent, b),
			link: this.tone(baseLink, b),
			label: this.tone(skin ? skin.label : this.colours.label, b * look.labelBrightness),
		};
	}

	/** Colour for a node class (skin bucket or colour group), brightness and node colour override applied. */
	private classColour(cls: number): string {
		const look = this.look;
		const skin = this.skin;
		const base = skin ? skin.buckets.length : 1;
		const isGroup = cls >= base;
		let css = this.classColours[cls] ?? this.colours.node;
		if (!skin && cls === 0) css = this.colours.node;
		if (look.useNodeColour && !isGroup) css = look.nodeColour;
		return this.tone(css, look.brightness * look.nodeBrightness);
	}

	private get moving(): boolean {
		return !!this.skin?.animated && this.effects && this.look.effectsSpeed > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/** Electrons are on, and the system has not asked for reduced motion. */
	private get flowing(): boolean {
		return !!this.options.electrons?.enabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/** Drift is on, and the system has not asked for reduced motion. */
	private get drifting(): boolean {
		const d = this.options.drift;
		return !!d?.enabled && d.amount > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/** Eases the hovered note to a standstill (so it is easy to click) and releases the one just left. */
	private updateCalm(now: number): void {
		const step = Math.min(0.1, Math.max(0, (now - this.calmAt) / 1000)) / 0.18;
		this.calmAt = now;
		if (this.highlight >= 0 && !this.calm.has(this.highlight)) this.calm.set(this.highlight, 0);
		for (const [id, value] of this.calm) {
			const target = id === this.highlight ? 1 : 0;
			const next = value < target ? Math.min(target, value + step) : Math.max(target, value - step);
			if (next === 0 && target === 0) this.calm.delete(id);
			else this.calm.set(id, next);
		}
	}

	/** On-screen node radius in pixels. */
	private nodeRadius(worldRadius: number, k: number): number {
		const r = Math.max(1, worldRadius * k);
		return this.skin ? Math.min(SKIN_MAX_NODE_PX, r) : r;
	}

	/** Runs a gentle redraw loop (about 30 frames a second) while a skin has moving effects. */
	private updateAnimation(): void {
		window.clearTimeout(this.animTimer);
		this.animTimer = 0;
		if (!(this.moving || this.flowing || this.drifting) || this.suspended) return;
		const step = () => {
			this.animTimer = window.setTimeout(step, 33);
			if (this.canvas.isConnected && document.visibilityState === 'visible') this.requestDraw();
		};
		step();
	}

	/** Which colour class each node belongs to: a skin bucket (by link count) or a colour group. */
	private rebuildClasses(): void {
		const data = this.data;
		if (!data) return;
		const n = data.capacity;
		const skin = this.skin;
		const base = skin ? skin.buckets.length : 1;
		const colours = skin ? [...skin.buckets] : [this.colours.node];
		for (const g of this.groupColours) colours.push(g);
		const buckets = skin ? degreeBuckets(data.degree, data.alive, skin.buckets.length) : null;
		const classOf = new Uint8Array(n);
		const counts = new Array<number>(colours.length).fill(0);
		for (let i = 0; i < n; i++) {
			const g = this.groupOf[i] ?? 0;
			const cls = g > 0 ? base + g - 1 : (buckets?.[i] ?? 0);
			classOf[i] = cls;
			counts[cls] = (counts[cls] ?? 0) + 1;
		}
		this.classOf = classOf;
		this.classColours = colours;
		this.classCounts = counts;
	}

	/** A soft round glow in one colour, drawn once and reused. */
	private sprite(colour: string): HTMLCanvasElement {
		let sprite = this.sprites.get(colour);
		if (sprite) return sprite;
		sprite = createEl('canvas');
		sprite.width = 64;
		sprite.height = 64;
		const g = sprite.getContext('2d');
		if (g) {
			const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
			grad.addColorStop(0, colour);
			grad.addColorStop(0.18, colour);
			grad.addColorStop(1, 'rgba(0,0,0,0)');
			g.fillStyle = grad;
			g.fillRect(0, 0, 64, 64);
		}
		this.sprites.set(colour, sprite);
		return sprite;
	}

	/** Soft coloured clouds on a transparent canvas, the same for a given skin. */
	private makeNebula(skin: Skin): HTMLCanvasElement {
		const size = 512;
		const canvas = createEl('canvas');
		canvas.width = size;
		canvas.height = size;
		const g = canvas.getContext('2d');
		if (!g) return canvas;
		const rnd = seededRandom(skin.backdrop.seed);
		g.globalCompositeOperation = 'lighter';
		for (let i = 0; i < 16; i++) {
			const x = rnd() * size;
			const y = rnd() * size;
			const r = 70 + rnd() * 170;
			const colour = skin.backdrop.colours[Math.floor(rnd() * skin.backdrop.colours.length)] ?? '#222';
			const grad = g.createRadialGradient(x, y, 0, x, y, r);
			grad.addColorStop(0, colour + '88');
			grad.addColorStop(1, colour + '00');
			g.fillStyle = grad;
			g.fillRect(x - r, y - r, 2 * r, 2 * r);
		}
		return canvas;
	}

	private paintBackground(skin: Skin | null): void {
		const { ctx, width: w, height: h } = this;
		const look = this.look;
		const bg = look.backgroundBrightness * look.brightness;
		ctx.globalAlpha = 1;
		const base = look.useBackgroundColour ? look.backgroundColour : (skin?.base ?? '#000');
		ctx.fillStyle = this.tone(base, bg);
		ctx.fillRect(0, 0, w, h);
		if (!skin) return;
		if (this.nebulaFor !== skin.id || !this.nebula) {
			this.nebula = this.makeNebula(skin);
			this.nebulaFor = skin.id;
			this.stars = skin.starfield ? makeStarfield(skin.backdrop.seed + 1, 260) : [];
		}
		// Slow parallax: the backdrop drifts a little as you pan.
		const span = Math.max(w, h) * 1.7;
		const ox = (w - span) / 2 + this.transform.x * 0.03;
		const oy = (h - span) / 2 + this.transform.y * 0.03;
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = Math.min(1, 0.38 * bg);
		if (this.nebula) ctx.drawImage(this.nebula, ox, oy, span, span);
		ctx.globalAlpha = 1;
		const twinkle = this.moving;
		for (const star of this.stars) {
			const x = (((star.x * w + this.transform.x * 0.02) % w) + w) % w;
			const y = (((star.y * h + this.transform.y * 0.02) % h) + h) % h;
			ctx.globalAlpha = scaleAlpha(twinkle ? star.alpha * (0.7 + 0.3 * Math.sin(this.fxTime * 1.4 + star.phase * 6)) : star.alpha, bg);
			ctx.fillStyle = '#dfe8ff';
			ctx.fillRect(x, y, star.size, star.size);
		}
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	setPositions(positions: Float32Array): void {
		this.positions = positions;
		this.requestDraw();
	}

	setTransform(t: ViewTransform): void {
		this.transform = t;
		this.requestDraw();
	}

	setOptions(options: RenderOptions): void {
		this.options = options;
		this.updateAnimation();
		this.requestDraw();
	}

	/** Marks a node and its neighbours (1 = neighbour, 2 = the node itself). -1 clears. */
	setHighlight(id: number): void {
		const data = this.data;
		if (!data) return;
		if (this.marks.length !== data.capacity) this.marks = new Uint8Array(data.capacity);
		else this.marks.fill(0);
		this.highlight = id;
		if (id >= 0 && id < data.capacity) {
			const { offsets, neighbours } = data.adjacency;
			for (let i = offsets[id] as number; i < (offsets[id + 1] as number); i++) this.marks[neighbours[i] as number] = 1;
			this.marks[id] = 2;
		}
		this.requestDraw();
	}

	/** Nodes that can be hovered or clicked: visible, and not hidden inside a bubble. Valid after a draw. */
	getPickable(): Uint8Array {
		return this.clusterState ? this.pickable : this.visible;
	}

	/** The bubble under a screen point, as its node count and centre, or null. */
	bubbleAt(sx: number, sy: number): { count: number; x: number; y: number } | null {
		const cl = this.clusterState;
		if (!cl) return null;
		const c = hitCluster(cl, sx, sy, bubbleRadius, 3);
		return c < 0 ? null : { count: cl.count[c] as number, x: cl.cx[c] as number, y: cl.cy[c] as number };
	}

	/** Number of bubbles in the last draw (0 when clustering is off or nothing is crowded). */
	get bubbleCount(): number {
		return this.clusterState?.clusters ?? 0;
	}

	requestDraw(): void {
		if (this.frame) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = 0;
			this.draw();
		});
	}

	destroy(): void {
		window.clearTimeout(this.animTimer);
		this.animTimer = 0;
		if (this.frame) window.cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.data = null;
	}

	private project(count: number): void {
		const { x: tx, y: ty, k } = this.transform;
		const m = 20;
		const { positions, screen, codes } = this;
		const alive = this.visible;
		const drifting = this.drifting;
		let amp = 0;
		let omega = 0;
		let now = 0;
		if (drifting) {
			if (this.driftSeeds.length < count * 8) this.driftSeeds = makeDriftSeeds(Math.max(count, (this.data?.capacity ?? 0)));
			const d = this.options.drift as DriftSettings;
			amp = driftAmplitudePx(d.amount);
			omega = driftOmega(d.speed);
			now = performance.now();
			this.updateCalm(now);
			now /= 1000;
		}
		const tmp = this.driftTmp;
		const calm = this.calm;
		for (let i = 0; i < count; i++) {
			if (!alive[i]) {
				codes[i] = OUT_VIEW;
				continue;
			}
			let sx = (positions[2 * i] as number) * k + tx;
			let sy = (positions[2 * i + 1] as number) * k + ty;
			// Notes well off screen are not moved: nobody sees it and it saves the work.
			if (drifting && sx > -40 && sx < this.width + 40 && sy > -40 && sy < this.height + 40) {
				driftUnit(this.driftSeeds, i, now, omega, tmp);
				const free = calm.size === 0 ? 1 : 1 - (calm.get(i) ?? 0);
				sx += (tmp[0] as number) * amp * free;
				sy += (tmp[1] as number) * amp * free;
			}
			screen[2 * i] = sx;
			screen[2 * i + 1] = sy;
			codes[i] = (sx < -m ? 1 : 0) | (sx > this.width + m ? 2 : 0) | (sy < -m ? 4 : 0) | (sy > this.height + m ? 8 : 0);
		}
	}

	/** A whole-graph effect for this frame (a scale about the origin and a shake in pixels), see motion.ts. */
	setMotion(frame: MotionFrame): void {
		this.motion = frame;
		this.requestDraw();
	}

	/** Draws with the motion applied to the view for this frame only; the real view is put back afterwards. */
	private draw(): void {
		const real = this.transform;
		const m = this.motion;
		if (m.scale !== 1 || m.dx !== 0 || m.dy !== 0) this.transform = { x: real.x + m.dx, y: real.y + m.dy, k: real.k * m.scale };
		try {
			this.drawFrame();
		} finally {
			this.transform = real;
		}
	}

	private drawFrame(): void {
		const started = performance.now();
		const data = this.data;
		const ctx = this.ctx;
		this.time = started / 1000;
		this.fxTime = this.time * this.look.effectsSpeed;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.width, this.height);
		if (this.suspended) return;
		if (this.skin?.base || this.look.useBackgroundColour) this.paintBackground(this.skin);
		if (!data) return;
		const count = Math.min(data.capacity, this.positions.length / 2);
		if (count === 0) return;
		this.project(count);
		this.buildClusters(count);
		this.drawLinks(data);
		this.drawPulses(data);
		this.drawNodes(data, count);
		// On top of the nodes: in a dense graph the node discs would otherwise hide most of them.
		this.drawElectrons(data);
		this.drawBubbles();
		this.drawLabels(data, count);
		ctx.globalAlpha = 1;
		this.lastDrawMs = performance.now() - started;
	}

	private buildClusters(count: number): void {
		this.clusterState = null;
		if (!this.options.clusters) return;
		const { drawn, codes, visible } = this;
		let inView = 0;
		for (let i = 0; i < count; i++) {
			const on = visible[i] && codes[i] === 0 ? 1 : 0;
			drawn[i] = on;
			inView += on;
		}
		if (inView < CLUSTER_MIN * 4) return;
		const cl = clusterNodes(this.screen, drawn, count, this.groupOf, this.groupColours.length + 1, {
			width: this.width,
			height: this.height,
			cellPx: CLUSTER_CELL_PX,
			minCluster: CLUSTER_MIN,
			margin: 0,
		});
		if (cl.clusters === 0) return;
		this.clusterState = cl;
		for (let i = 0; i < count; i++) this.pickable[i] = visible[i] && (cl.cellOf[i] as number) < 0 ? 1 : 0;
	}

	private drawBubbles(): void {
		const cl = this.clusterState;
		if (!cl) return;
		const { ctx } = this;
		const dim = this.highlight >= 0;
		const groups = this.groupColours.length + 1;
		for (let group = 0; group < groups; group++) {
			const colour = group === 0 ? this.palette.node : (this.groupColours[group - 1] ?? this.palette.node);
			ctx.beginPath();
			let any = false;
			for (let c = 0; c < cl.clusters; c++) {
				if (cl.group[c] !== group) continue;
				any = true;
				const x = cl.cx[c] as number;
				const y = cl.cy[c] as number;
				ctx.moveTo(x + bubbleRadius(cl.count[c] as number), y);
				ctx.arc(x, y, bubbleRadius(cl.count[c] as number), 0, Math.PI * 2);
			}
			if (!any) continue;
			ctx.globalAlpha = dim ? 0.2 : 0.55;
			ctx.fillStyle = colour;
			ctx.fill();
			ctx.globalAlpha = dim ? 0.3 : 0.9;
			ctx.lineWidth = 1;
			ctx.strokeStyle = colour;
			ctx.stroke();
		}
		ctx.font = `${Math.max(8, this.look.labelSize - 1)}px ${this.font}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = this.palette.label;
		ctx.globalAlpha = dim ? 0.4 : 1;
		for (let c = 0; c < cl.clusters; c++) {
			if (bubbleRadius(cl.count[c] as number) < 9.5) continue;
			ctx.fillText(String(cl.count[c]), cl.cx[c] as number, cl.cy[c] as number);
		}
	}

	/** Segments between bubbles (merged, thicker for more links) and between a bubble and a lone node. */
	private drawBubbleLinks(data: RenderData): void {
		const cl = this.clusterState;
		if (!cl) return;
		const links = aggregateLinks(data.edges, cl, this.screen, this.drawn);
		const { ctx } = this;
		ctx.strokeStyle = this.colours.link;
		ctx.globalAlpha = this.highlight >= 0 ? 0.06 : 0.35;
		// One path per thickness class, so the cost stays a handful of strokes.
		for (let bucket = 0; bucket < 5; bucket++) {
			ctx.lineWidth = this.options.linkThickness * (1 + bucket * 0.8);
			ctx.beginPath();
			let any = false;
			for (let i = 0; i < links.weight.length; i++) {
				const w = links.weight[i] as number;
				const b = Math.min(4, Math.floor(Math.log2(w)));
				if (b !== bucket) continue;
				any = true;
				ctx.moveTo(links.x1[i] as number, links.y1[i] as number);
				ctx.lineTo(links.x2[i] as number, links.y2[i] as number);
			}
			if (any) ctx.stroke();
		}
	}

	private drawLinks(data: RenderData): void {
		const { ctx, screen, codes, marks } = this;
		const { edges } = data;
		const cellOf = this.clusterState?.cellOf;
		const k = this.transform.k;
		const dim = this.highlight >= 0;
		const width = Math.min(this.options.linkThickness, Math.max(0.5, this.options.linkThickness * k));
		const skin = this.skin;
		const curved = !!skin?.curvedLinks;
		ctx.lineWidth = width;
		ctx.lineCap = 'butt';
		ctx.strokeStyle = this.palette.link;
		const linkAlpha = skin ? (dim ? skin.linkAlpha * 0.3 : skin.linkAlpha) : dim ? 0.08 : 0.45;
		ctx.globalAlpha = scaleAlpha(linkAlpha, this.look.linkBrightness);
		if (skin?.glow) ctx.globalCompositeOperation = 'lighter';
		ctx.beginPath();
		for (let e = 0; e < edges.length; e += 2) {
			const a = edges[e] as number;
			const b = edges[e + 1] as number;
			if ((codes[a] as number) & OUT_VIEW || (codes[b] as number) & OUT_VIEW) continue;
			if ((codes[a] as number) & (codes[b] as number)) continue;
			if (cellOf && ((cellOf[a] as number) >= 0 || (cellOf[b] as number) >= 0)) continue;
			if (dim && (marks[a] === 2 || marks[b] === 2)) continue;
			const ax = screen[2 * a] as number;
			const ay = screen[2 * a + 1] as number;
			const bx = screen[2 * b] as number;
			const by = screen[2 * b + 1] as number;
			ctx.moveTo(ax, ay);
			if (curved && Math.abs(bx - ax) + Math.abs(by - ay) > 12) {
				const c = curveControl(ax, ay, bx, by, curveSide(e >> 1));
				ctx.quadraticCurveTo(c.x, c.y, bx, by);
			} else {
				ctx.lineTo(bx, by);
			}
		}
		ctx.stroke();
		ctx.globalCompositeOperation = 'source-over';

		if (dim) {
			ctx.strokeStyle = this.palette.accent;
			ctx.globalAlpha = 0.9;
			ctx.lineWidth = width + 0.5;
			ctx.beginPath();
			for (let e = 0; e < edges.length; e += 2) {
				const a = edges[e] as number;
				const b = edges[e + 1] as number;
				if (marks[a] !== 2 && marks[b] !== 2) continue;
				if ((codes[a] as number) & OUT_VIEW || (codes[b] as number) & OUT_VIEW) continue;
				if (cellOf && ((cellOf[a] as number) >= 0 || (cellOf[b] as number) >= 0)) continue;
				ctx.moveTo(screen[2 * a] as number, screen[2 * a + 1] as number);
				ctx.lineTo(screen[2 * b] as number, screen[2 * b + 1] as number);
			}
			ctx.stroke();
		}

		if (cellOf) this.drawBubbleLinks(data);
		if (this.options.showArrows) this.drawArrows(data, dim);
	}

	/** Small bright dots running along a fixed few hundred links (brain skin: signals firing). */
	private drawPulses(data: RenderData): void {
		const skin = this.skin;
		if (!skin?.pulses || !this.moving) return;
		const { ctx, screen, codes } = this;
		const cellOf = this.clusterState?.cellOf;
		const { edges } = data;
		ctx.globalCompositeOperation = 'lighter';
		ctx.fillStyle = this.palette.accent;
		for (const index of this.pulseEdges) {
			const e = index * 2;
			const a = edges[e] as number;
			const b = edges[e + 1] as number;
			if ((codes[a] as number) !== 0 || (codes[b] as number) !== 0) continue;
			if (cellOf && ((cellOf[a] as number) >= 0 || (cellOf[b] as number) >= 0)) continue;
			const ax = screen[2 * a] as number;
			const ay = screen[2 * a + 1] as number;
			const bx = screen[2 * b] as number;
			const by = screen[2 * b + 1] as number;
			const t = pulseT(this.fxTime, (index % 97) / 97);
			let x: number;
			let y: number;
			if (Math.abs(bx - ax) + Math.abs(by - ay) > 12) {
				const c = curveControl(ax, ay, bx, by, curveSide(index));
				({ x, y } = quadPoint(ax, ay, c.x, c.y, bx, by, t));
			} else {
				x = ax + (bx - ax) * t;
				y = ay + (by - ay) * t;
			}
			ctx.globalAlpha = 0.25;
			ctx.beginPath();
			ctx.arc(x, y, 4.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 0.95;
			ctx.beginPath();
			ctx.arc(x, y, 1.7, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	/** Bright dots with a fading tail running from each source note to its target, on a share of the links. */
	private drawElectrons(data: RenderData): void {
		const settings = this.options.electrons;
		if (!settings || !this.flowing) return;
		const { ctx, screen, codes } = this;
		const { edges } = data;
		const total = edges.length / 2;
		if (total === 0) return;
		const stride = electronStride(total, settings.amount);
		const now = performance.now() / 1000;
		const skin = this.skin;
		const curved = !!skin?.curvedLinks;
		const cellOf = this.clusterState?.cellOf;
		const hovering = this.highlight >= 0;
		const tails = ELECTRON_TAIL_PX.length;
		const xs: number[] = [];
		const ys: number[] = [];
		const kinds: number[] = [];
		const faint: boolean[] = [];
		for (let i = 0; i < total; i += stride) {
			const a = edges[2 * i] as number;
			const b = edges[2 * i + 1] as number;
			if (((codes[a] as number) & OUT_VIEW) !== 0 || ((codes[b] as number) & OUT_VIEW) !== 0) continue;
			if (((codes[a] as number) & (codes[b] as number)) !== 0) continue;
			if (cellOf && ((cellOf[a] as number) >= 0 || (cellOf[b] as number) >= 0)) continue;
			const ax = screen[2 * a] as number;
			const ay = screen[2 * a + 1] as number;
			const bx = screen[2 * b] as number;
			const by = screen[2 * b + 1] as number;
			const length = Math.hypot(bx - ax, by - ay);
			if (length < ELECTRON_MIN_LINK_PX) continue;
			const head = electronT(now, i, length, settings.speed);
			const control = curved ? curveControl(ax, ay, bx, by, curveSide(i)) : null;
			const dim = hovering && a !== this.highlight && b !== this.highlight;
			for (let k = 0; k < tails; k++) {
				const t = head - (ELECTRON_TAIL_PX[k] as number) / length;
				if (t < 0) continue;
				if (control) {
					const p = quadPoint(ax, ay, control.x, control.y, bx, by, t);
					xs.push(p.x);
					ys.push(p.y);
				} else {
					xs.push(ax + (bx - ax) * t);
					ys.push(ay + (by - ay) * t);
				}
				kinds.push(k);
				faint.push(dim);
			}
		}
		if (xs.length === 0) return;
		const accent = this.palette.accent;
		ctx.globalCompositeOperation = skin?.glow ? 'lighter' : 'source-over';
		// A soft halo under each head, then the tail dots and a white-hot core, in a few batched passes.
		const pass = (select: (k: number) => boolean, radius: number, colour: string, alpha: number): void => {
			ctx.fillStyle = colour;
			// While a note is hovered, electrons on links that do not touch it are drawn faint (a second pass).
			for (const faintPass of hovering ? [false, true] : [false]) {
				ctx.beginPath();
				for (let n = 0; n < xs.length; n++) {
					if (faint[n] !== faintPass || !select(kinds[n] as number)) continue;
					ctx.moveTo((xs[n] as number) + radius, ys[n] as number);
					ctx.arc(xs[n] as number, ys[n] as number, radius, 0, Math.PI * 2);
				}
				ctx.globalAlpha = faintPass ? alpha * 0.25 : alpha;
				ctx.fill();
			}
		};
		pass((k) => k === 0, 4.5, accent, document.body.classList.contains('theme-dark') || !!skin?.base ? 0.3 : 0.18);
		for (let k = 1; k < tails; k++) pass((kind) => kind === k, 1.9 - k * 0.3, accent, ELECTRON_TAIL_ALPHA[k] as number);
		// White-hot core on dark backgrounds; a solid dot in the accent colour on light ones (white on a light halo looks like an unresolved-link ring).
		const dark = !!skin?.base || document.body.classList.contains('theme-dark');
		pass((k) => k === 0, dark ? 1.7 : 2.3, dark ? '#ffffff' : accent, dark ? 0.95 : 1);
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	private drawArrows(data: RenderData, dim: boolean): void {
		const { ctx, screen, codes } = this;
		const { edges, radiusWorld } = data;
		const cellOf = this.clusterState?.cellOf;
		const k = this.transform.k;
		const size = 5;
		ctx.strokeStyle = this.colours.link;
		ctx.globalAlpha = dim ? 0.15 : 0.7;
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let e = 0; e < edges.length; e += 2) {
			const a = edges[e] as number;
			const b = edges[e + 1] as number;
			if ((codes[a] as number) & OUT_VIEW || (codes[b] as number) & OUT_VIEW) continue;
			if ((codes[a] as number) & (codes[b] as number)) continue;
			if (cellOf && ((cellOf[a] as number) >= 0 || (cellOf[b] as number) >= 0)) continue;
			const ax = screen[2 * a] as number;
			const ay = screen[2 * a + 1] as number;
			const bx = screen[2 * b] as number;
			const by = screen[2 * b + 1] as number;
			const dx = bx - ax;
			const dy = by - ay;
			const length = Math.hypot(dx, dy);
			if (length < size * 3) continue;
			const ux = dx / length;
			const uy = dy / length;
			const r = Math.max(1, (radiusWorld[b] as number) * k);
			const tipX = bx - ux * r;
			const tipY = by - uy * r;
			ctx.moveTo(tipX - ux * size - uy * size * 0.5, tipY - uy * size + ux * size * 0.5);
			ctx.lineTo(tipX, tipY);
			ctx.lineTo(tipX - ux * size + uy * size * 0.5, tipY - uy * size - ux * size * 0.5);
		}
		ctx.stroke();
	}

	private drawNodes(data: RenderData, count: number): void {
		const { ctx, screen, codes, marks, classOf } = this;
		const cellOf = this.clusterState?.cellOf;
		const skin = this.skin;
		const glow = !!skin?.glow;
		const twinkle = glow && this.moving;
		const look = this.look;
		const k = this.transform.k;
		const dim = this.highlight >= 0;
		const palette = this.palette;
		// While a node is hovered: everything else faded, its neighbours normal, the node itself in the accent colour.
		const specs: { mark: number; alpha: number; accent: boolean }[] = dim
			? [
					{ mark: 0, alpha: 0.15, accent: false },
					{ mark: 1, alpha: 0.9, accent: false },
					{ mark: 2, alpha: 1, accent: true },
				]
			: [{ mark: -1, alpha: 0.9, accent: false }];
		const glowing: number[] = [];
		for (const spec of specs) {
			for (let cls = 0; cls < this.classCounts.length; cls++) {
				if ((this.classCounts[cls] ?? 0) === 0) continue;
				const colour = spec.accent ? palette.accent : this.classColour(cls);
				ctx.fillStyle = colour;
				ctx.globalAlpha = scaleAlpha(spec.alpha, look.nodeOpacity);
				ctx.beginPath();
				glowing.length = 0;
				for (let i = 0; i < count; i++) {
					if ((codes[i] as number) & OUT_VIEW) continue;
					if (cellOf && (cellOf[i] as number) >= 0) continue;
					if (classOf[i] !== cls) continue;
					if (spec.mark >= 0 && marks[i] !== spec.mark) continue;
					const sx = screen[2 * i] as number;
					const sy = screen[2 * i + 1] as number;
					const r = this.nodeRadius(data.radiusWorld[i] as number, k);
					if (glow && r >= 2.2 && glowing.length < 5000) glowing.push(i);
					if (r < 1.6) {
						ctx.rect(sx - r, sy - r, r * 2, r * 2);
					} else {
						ctx.moveTo(sx + r, sy);
						ctx.arc(sx, sy, r, 0, Math.PI * 2);
					}
				}
				ctx.fill();
				// Soft halo around the bigger nodes; stars twinkle slowly.
				if (glow && glowing.length > 0) {
					ctx.globalCompositeOperation = 'lighter';
					const halo = this.sprite(colour);
					for (const i of glowing) {
						const r = this.nodeRadius(data.radiusWorld[i] as number, k);
						const size = r * 2.7;
						ctx.globalAlpha = scaleAlpha(spec.alpha * 0.26 * look.glowStrength * (twinkle ? 0.65 + 0.35 * Math.sin(this.fxTime * 1.8 + i * 12.9898) : 1), look.brightness);
						ctx.drawImage(halo, (screen[2 * i] as number) - size, (screen[2 * i + 1] as number) - size, size * 2, size * 2);
					}
				}
				ctx.globalCompositeOperation = 'source-over';
			}
		}
	}

	private drawLabels(data: RenderData, count: number): void {
		const { ctx, screen, codes, marks } = this;
		const cellOf = this.clusterState?.cellOf;
		const k = this.transform.k;
		const fade = Math.min(1, Math.max(0, (k - this.options.textFadeThreshold) / 0.5));
		const dim = this.highlight >= 0;
		if (fade <= 0 && !dim) return;
		ctx.font = `${this.look.labelSize}px ${this.font}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		ctx.fillStyle = this.palette.label;
		let drawn = 0;
		for (let i = 0; i < count && drawn < MAX_LABELS; i++) {
			if ((codes[i] as number) & OUT_VIEW || codes[i] !== 0) continue;
			if (cellOf && (cellOf[i] as number) >= 0) continue;
			const highlighted = dim && (marks[i] as number) > 0;
			if (dim ? !highlighted && fade <= 0 : fade <= 0) continue;
			ctx.globalAlpha = highlighted ? 1 : fade * (dim ? 0.3 : 1);
			const r = Math.max(1, (data.radiusWorld[i] as number) * k);
			let text = this.labelCache.get(i);
			if (text === undefined) {
				text = data.labelOf(i);
				this.labelCache.set(i, text);
			}
			ctx.fillText(text, screen[2 * i] as number, (screen[2 * i + 1] as number) + r + 2);
			drawn++;
		}
	}
}
