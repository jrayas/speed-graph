import type { RenderData } from './canvas-renderer';
import { DEFAULT_LOOK, adjustRgb, fovRadians, scaleAlpha, type Look } from './appearance';
import { parseCssColour } from './css-colour';
import { OrbitCamera, computeBounds3, multiply, perspective, pickNode3D, pixelRadius } from './math3d';
import { degreeBuckets, makeStarfield, type Skin } from './skins';
import { NO_MOTION, type MotionFrame } from './motion';
import { driftAmplitudePx, driftOmega, driftUnit, makeDriftSeeds, type DriftSettings } from './drift';
import { ELECTRON_MIN_LINK_PX, ELECTRON_TAIL_ALPHA, ELECTRON_TAIL_PX, electronStride, electronT, type ElectronSettings } from './electrons';

/**
 * WebGL2 renderer for the 3D view. Nodes are GPU point sprites (sized by perspective, with a soft
 * halo for glow skins), links are GPU lines that fade with distance, and a 2D canvas on top draws
 * labels and the hover ring. No library: about a dozen draw calls per frame whatever the graph size.
 */

const NODE_VS = `#version 300 es
precision highp float;
in vec3 a_pos;
in vec4 a_color;
in float a_size;
in float a_state;
in vec4 a_seedA;
in vec4 a_seedB;
uniform float u_driftAmp;
uniform float u_driftT;
uniform mat4 u_vp;
uniform float u_heightPx;
uniform float u_tanHalf;
uniform float u_glow;
uniform float u_maxRadius;
uniform float u_maxPoint;
uniform float u_time;
uniform float u_twinkle;
uniform float u_dim;
uniform float u_dpr;
uniform vec3 u_accent;
out vec4 v_color;
out float v_core;
void main() {
	// Drift: the same formula as render/drift.ts, so links and notes move together.
	vec3 dp = u_driftAmp * (0.62 * sin(vec3(u_driftT * a_seedA.w) + a_seedA.xyz) + 0.38 * sin(vec3(u_driftT * 1.73 * a_seedB.w) + a_seedB.xyz));
	vec4 clip = u_vp * vec4(a_pos + dp, 1.0);
	if (a_size <= 0.0 || clip.w <= 0.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		gl_PointSize = 0.0;
		v_color = vec4(0.0);
		v_core = 1.0;
		return;
	}
	float r = a_size * u_heightPx / (2.0 * clip.w * u_tanHalf);
	r = clamp(r, 1.0 * u_dpr, u_maxRadius * u_dpr);
	float scale = mix(1.0, 2.6, u_glow);
	gl_PointSize = min(2.0 * r * scale, u_maxPoint);
	gl_Position = clip;
	vec4 c = a_color;
	float tw = 1.0;
	if (u_twinkle > 0.5) tw = 0.75 + 0.25 * sin(u_time * 1.8 + a_pos.x * 0.37 + a_pos.y * 0.73);
	if (u_dim > 0.5) {
		if (a_state < 0.5) c.a *= 0.15;
		else if (a_state > 1.5) c = vec4(u_accent, 1.0);
	}
	v_color = vec4(c.rgb, c.a * tw);
	v_core = 1.0 / scale;
}`;

const NODE_FS = `#version 300 es
precision highp float;
in vec4 v_color;
in float v_core;
uniform float u_glow;
uniform float u_glowStrength;
out vec4 outColor;
void main() {
	vec2 p = gl_PointCoord * 2.0 - 1.0;
	float d = length(p);
	if (d > 1.0) discard;
	float core = 1.0 - smoothstep(v_core * 0.8, v_core, d);
	float halo = u_glow > 0.5 ? pow(max(0.0, 1.0 - d), 2.0) * 0.45 * u_glowStrength : 0.0;
	float a = max(core, halo) * v_color.a;
	outColor = vec4(v_color.rgb * a, a);
}`;

const LINK_VS = `#version 300 es
precision highp float;
in vec3 a_pos;
in vec4 a_seedA;
in vec4 a_seedB;
uniform float u_driftAmp;
uniform float u_driftT;
uniform mat4 u_vp;
uniform float u_distance;
uniform float u_radius;
uniform float u_fade;
out float v_fade;
void main() {
	vec3 dp = u_driftAmp * (0.62 * sin(vec3(u_driftT * a_seedA.w) + a_seedA.xyz) + 0.38 * sin(vec3(u_driftT * 1.73 * a_seedB.w) + a_seedB.xyz));
	vec4 clip = u_vp * vec4(a_pos + dp, 1.0);
	gl_Position = clip;
	v_fade = 1.0 - 0.7 * u_fade * smoothstep(u_distance, u_distance + u_radius * 2.0, clip.w);
}`;

const LINK_FS = `#version 300 es
precision highp float;
in float v_fade;
uniform vec4 u_color;
out vec4 outColor;
void main() {
	float a = u_color.a * v_fade;
	outColor = vec4(u_color.rgb * a, a);
}`;

const STAR_VS = `#version 300 es
precision highp float;
in vec3 a_dir;
in float a_seed;
uniform mat4 u_rot;
uniform float u_time;
uniform float u_dpr;
uniform float u_bright;
out float v_alpha;
void main() {
	gl_Position = u_rot * vec4(a_dir, 1.0);
	gl_PointSize = (1.0 + 1.4 * fract(a_seed * 7.13)) * u_dpr;
	v_alpha = (0.35 + 0.5 * fract(a_seed * 3.71)) * (0.75 + 0.25 * sin(u_time * 1.2 + a_seed * 40.0)) * u_bright;
}`;

const STAR_FS = `#version 300 es
precision highp float;
in float v_alpha;
out vec4 outColor;
void main() {
	vec2 p = gl_PointCoord * 2.0 - 1.0;
	float a = (1.0 - smoothstep(0.3, 1.0, length(p))) * v_alpha;
	outColor = vec4(0.87 * a, 0.91 * a, 1.0 * a, a);
}`;

const MAX_LABELS = 220;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('Could not create a shader');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(shader) ?? ''}`);
	return shader;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
	const p = gl.createProgram();
	if (!p) throw new Error('Could not create a program');
	gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
	gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program error: ${gl.getProgramInfoLog(p) ?? ''}`);
	return p;
}

export interface Options3D {
	linkThickness: number;
	textFadeThreshold: number;
	/** Moving dots along the links. */
	electrons?: ElectronSettings;
	/** A gentle wandering of every note while drawing. */
	drift?: DriftSettings;
}

export class Renderer3D {
	readonly canvas: HTMLCanvasElement;
	readonly overlay: HTMLCanvasElement;
	readonly camera = new OrbitCamera();
	private motion: MotionFrame = NO_MOTION;
	/** Duration of the last frame's CPU work, for the status line. */
	lastDrawMs = 0;
	autoRotate = false;

	private readonly gl: WebGL2RenderingContext;
	private readonly octx: CanvasRenderingContext2D;
	private readonly nodeProg: WebGLProgram;
	private readonly linkProg: WebGLProgram;
	private readonly starProg: WebGLProgram;
	private readonly vao: WebGLVertexArrayObject;
	private readonly linkVao: WebGLVertexArrayObject;
	private readonly starVao: WebGLVertexArrayObject;
	private readonly posBuf: WebGLBuffer;
	private readonly seedBuf: WebGLBuffer;
	private driftSeeds: Float32Array = new Float32Array(0);
	private readonly driftTmp = [0, 0, 0];
	/** This frame's drift size in world units and clock, shared by the shaders and the labels. */
	private driftAmpNow = 0;
	private driftSeconds = 0;
	private readonly colourBuf: WebGLBuffer;
	private readonly sizeBuf: WebGLBuffer;
	private readonly stateBuf: WebGLBuffer;
	private readonly edgeBuf: WebGLBuffer;
	private readonly hoverEdgeBuf: WebGLBuffer;
	private readonly starBuf: WebGLBuffer;
	private readonly maxPoint: number;
	private starCount = 0;

	private data: RenderData | null = null;
	private positions: Float32Array = new Float32Array(0);
	private visible: Uint8Array = new Uint8Array(0);
	private groupOf: Uint8Array = new Uint8Array(0);
	private groupColours: string[] = [];
	private edgeCount = 0;
	private hoverEdgeCount = 0;
	private highlight = -1;
	private skin: Skin | null = null;
	private effects = true;
	private options: Options3D = { linkThickness: 1, textFadeThreshold: 1 };
	private colours = { node: '#888', accent: '#7b6cd9', link: '#888', label: '#ddd' };
	private font = 'sans-serif';
	private width = 1;
	private height = 1;
	private dpr = 1;
	private frame = 0;
	private animTimer = 0;
	private time = 0;
	private lastInteraction = 0;
	private radius = 100;
	private look: Look = DEFAULT_LOOK;
	private fxTime = 0;

	constructor(container: HTMLElement) {
		this.canvas = container.createEl('canvas', { cls: 'speed-graph-gl' });
		this.overlay = container.createEl('canvas', { cls: 'speed-graph-overlay' });
		const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
		const octx = this.overlay.getContext('2d');
		if (!gl || !octx) {
			this.canvas.remove();
			this.overlay.remove();
			throw new Error('WebGL2 is not available');
		}
		this.gl = gl;
		this.octx = octx;
		this.nodeProg = program(gl, NODE_VS, NODE_FS);
		this.linkProg = program(gl, LINK_VS, LINK_FS);
		this.starProg = program(gl, STAR_VS, STAR_FS);
		const buf = (): WebGLBuffer => {
			const b = gl.createBuffer();
			if (!b) throw new Error('Could not create a buffer');
			return b;
		};
		const vao = (): WebGLVertexArrayObject => {
			const v = gl.createVertexArray();
			if (!v) throw new Error('Could not create a vertex array');
			return v;
		};
		this.posBuf = buf();
		this.seedBuf = buf();
		this.colourBuf = buf();
		this.sizeBuf = buf();
		this.stateBuf = buf();
		this.edgeBuf = buf();
		this.hoverEdgeBuf = buf();
		this.starBuf = buf();
		this.vao = vao();
		this.linkVao = vao();
		this.starVao = vao();
		const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
		this.maxPoint = Math.min(256, (range[1] as number) || 64);
		this.setupVertexArrays();
		this.setupStars();
		this.refreshColours();
	}

	private attrib(prog: WebGLProgram, name: string, buffer: WebGLBuffer, size: number, type: number, normalised = false): void {
		const gl = this.gl;
		const loc = gl.getAttribLocation(prog, name);
		if (loc < 0) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, size, type, normalised, 0, 0);
	}

	/** The two vec4 drift seeds of each note, read from one buffer of eight floats per note. */
	private seedAttribs(prog: WebGLProgram): void {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuf);
		for (const [name, offset] of [['a_seedA', 0], ['a_seedB', 16]] as const) {
			const loc = gl.getAttribLocation(prog, name);
			if (loc < 0) continue;
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, offset);
		}
	}

	private setupVertexArrays(): void {
		const gl = this.gl;
		gl.bindVertexArray(this.vao);
		this.attrib(this.nodeProg, 'a_pos', this.posBuf, 3, gl.FLOAT);
		this.attrib(this.nodeProg, 'a_color', this.colourBuf, 4, gl.UNSIGNED_BYTE, true);
		this.attrib(this.nodeProg, 'a_size', this.sizeBuf, 1, gl.FLOAT);
		this.attrib(this.nodeProg, 'a_state', this.stateBuf, 1, gl.FLOAT);
		this.seedAttribs(this.nodeProg);
		gl.bindVertexArray(this.linkVao);
		this.attrib(this.linkProg, 'a_pos', this.posBuf, 3, gl.FLOAT);
		this.seedAttribs(this.linkProg);
		gl.bindVertexArray(null);
	}

	private setupStars(): void {
		const gl = this.gl;
		const stars = makeStarfield(11, 1600);
		const data = new Float32Array(stars.length * 4);
		stars.forEach((s, i) => {
			// Unit direction from two uniform numbers.
			const cosT = 1 - 2 * s.x;
			const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
			const phi = 2 * Math.PI * s.y;
			data[4 * i] = sinT * Math.cos(phi);
			data[4 * i + 1] = sinT * Math.sin(phi);
			data[4 * i + 2] = cosT;
			data[4 * i + 3] = s.phase;
		});
		gl.bindVertexArray(this.starVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		const dir = gl.getAttribLocation(this.starProg, 'a_dir');
		const seed = gl.getAttribLocation(this.starProg, 'a_seed');
		gl.enableVertexAttribArray(dir);
		gl.vertexAttribPointer(dir, 3, gl.FLOAT, false, 16, 0);
		gl.enableVertexAttribArray(seed);
		gl.vertexAttribPointer(seed, 1, gl.FLOAT, false, 16, 12);
		gl.bindVertexArray(null);
		this.starCount = stars.length;
	}

	// --- inputs from the view ----------------------------------------------------------------

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
		this.applyBackground();
		if (this.data) this.uploadColours();
		this.requestDraw();
	}

	resize(width: number, height: number, dpr: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.dpr = dpr;
		for (const c of [this.canvas, this.overlay]) {
			c.width = Math.round(this.width * dpr);
			c.height = Math.round(this.height * dpr);
		}
		this.requestDraw();
	}

	setData(data: RenderData): void {
		const gl = this.gl;
		this.data = data;
		this.visible = data.alive;
		this.groupOf = new Uint8Array(data.capacity);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.capacity * 3), gl.DYNAMIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.capacity), gl.DYNAMIC_DRAW);
		this.driftSeeds = makeDriftSeeds(data.capacity);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuf);
		gl.bufferData(gl.ARRAY_BUFFER, this.driftSeeds, gl.STATIC_DRAW);
		this.positions = new Float32Array(data.capacity * 3);
		this.highlight = -1;
		this.uploadColours();
		this.uploadSizes();
		this.uploadEdges();
		this.requestDraw();
	}

	setPositions(positions: Float32Array): void {
		const gl = this.gl;
		this.positions = positions;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions.subarray(0, Math.min(positions.length, (this.data?.capacity ?? 0) * 3)));
		this.requestDraw();
	}

	setVisible(mask: Uint8Array): void {
		this.visible = mask;
		this.uploadSizes();
		this.uploadEdges();
		this.requestDraw();
	}

	setGroups(colours: string[], assignment: Uint8Array): void {
		this.groupColours = colours;
		this.groupOf = assignment;
		this.uploadColours();
		this.requestDraw();
	}

	setOptions(options: Options3D): void {
		this.options = options;
		this.updateAnimation();
		this.requestDraw();
	}

	/** Brightness, colour, glow, field of view and label settings. Neutral values draw as before. */
	setLook(look: Look): void {
		this.look = look;
		this.camera.fovY = fovRadians(look);
		this.applyBackground();
		if (this.data) this.uploadColours();
		this.updateAnimation();
		this.requestDraw();
	}

	/** A colour with saturation and brightness applied, as 0..255 RGBA. */
	private toneRgba(css: string, brightness: number): [number, number, number, number] {
		const p = parseCssColour(css);
		const rgb = adjustRgb(p.rgb, brightness, this.look.saturation);
		return [rgb[0], rgb[1], rgb[2], Math.round(p.alpha * 255)];
	}

	private toneCss(css: string, brightness: number): string {
		const [r, g, b, a] = this.toneRgba(css, brightness);
		return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
	}

	/** The page behind the graph: skin colours (or a custom colour), scaled by the backdrop brightness. */
	private applyBackground(): void {
		const skin = this.skin;
		const look = this.look;
		const bg = look.backgroundBrightness * look.brightness;
		const soft = (c: string | undefined) => (c ? this.toneCss(c, bg) : 'transparent');
		const base = look.useBackgroundColour ? this.toneCss(look.backgroundColour, bg) : skin?.base ? this.toneCss(skin.base, bg) : 'transparent';
		this.canvas.setCssProps(
			skin
				? { '--fg3d-bg-a': soft(skin.backdrop.colours[0]), '--fg3d-bg-b': soft(skin.backdrop.colours[1]), '--fg3d-bg-c': soft(skin.backdrop.colours[2]), '--fg3d-bg-base': base }
				: { '--fg3d-bg-a': 'transparent', '--fg3d-bg-b': 'transparent', '--fg3d-bg-c': 'transparent', '--fg3d-bg-base': base },
		);
	}

	setSkin(skin: Skin | null): void {
		this.skin = skin;
		this.applyBackground();
		this.canvas.toggleClass('has-skin', skin !== null);
		if (this.data) this.uploadColours();
		this.updateAnimation();
		this.requestDraw();
	}

	setEffects(on: boolean): void {
		this.effects = on;
		this.updateAnimation();
		this.requestDraw();
	}

	setAutoRotate(on: boolean): void {
		this.autoRotate = on;
		this.updateAnimation();
	}

	/** Marks a node and its neighbours (1 = neighbour, 2 = the node itself). -1 clears. */
	setHighlight(id: number): void {
		const data = this.data;
		if (!data) return;
		const gl = this.gl;
		const state = new Float32Array(data.capacity);
		this.highlight = id;
		if (id >= 0 && id < data.capacity) {
			const { offsets, neighbours } = data.adjacency;
			for (let i = offsets[id] as number; i < (offsets[id + 1] as number); i++) state[neighbours[i] as number] = 1;
			state[id] = 2;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.stateBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, state);
		// Links touching the hovered node, to draw in the accent colour.
		const mine: number[] = [];
		if (id >= 0) {
			const edges = data.edges;
			for (let e = 0; e < edges.length; e += 2) {
				const a = edges[e] as number;
				const b = edges[e + 1] as number;
				if ((a === id || b === id) && this.visible[a] && this.visible[b]) mine.push(a, b);
			}
		}
		this.hoverEdgeCount = mine.length;
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.hoverEdgeBuf);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(mine), gl.DYNAMIC_DRAW);
		this.requestDraw();
	}

	// --- camera and picking --------------------------------------------------------------

	/** Centres the camera on the shown nodes. */
	fit(): void {
		const bounds = computeBounds3(this.positions, this.visible, 0.02);
		if (!bounds) return;
		this.camera.fit(bounds, this.width / this.height);
		this.radius = Math.max(10, 0.5 * Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]));
		this.touch();
	}

	touch(): void {
		this.lastInteraction = performance.now();
		this.requestDraw();
	}

	pick(sx: number, sy: number): number {
		if (!this.data) return -1;
		return pickNode3D(this.camera, this.positions, this.visible, this.data.radiusWorld, this.width, this.height, sx, sy, 3);
	}

	/** Screen position and depth of a node, or null if it is behind the camera or unknown. */
	nodeScreen(id: number): { x: number; y: number; depth: number } | null {
		if (!this.data || id < 0 || id >= this.data.capacity) return null;
		const p = this.camera.project(this.positions[3 * id] as number, this.positions[3 * id + 1] as number, this.positions[3 * id + 2] as number, this.width, this.height);
		return p.inFront ? { x: p.x, y: p.y, depth: p.depth } : null;
	}

	nodePosition(id: number): [number, number, number] {
		return [this.positions[3 * id] as number, this.positions[3 * id + 1] as number, this.positions[3 * id + 2] as number];
	}

	get size(): { width: number; height: number } {
		return { width: this.width, height: this.height };
	}

	// --- GPU uploads -----------------------------------------------------------------------

	private uploadColours(): void {
		const data = this.data;
		if (!data) return;
		const gl = this.gl;
		const skin = this.skin;
		const look = this.look;
		const mult = look.brightness * look.nodeBrightness;
		const buckets = skin ? degreeBuckets(data.degree, data.alive, skin.buckets.length) : null;
		const out = new Uint8Array(data.capacity * 4);
		const baseNode = look.useNodeColour ? look.nodeColour : this.colours.node;
		const alpha = Math.round((skin ? 235 : 230) * look.nodeOpacity);
		const cache = new Map<string, [number, number, number, number]>();
		const toned = (css: string): [number, number, number, number] => {
			let t = cache.get(css);
			if (!t) {
				t = this.toneRgba(css, mult);
				cache.set(css, t);
			}
			return t;
		};
		for (let i = 0; i < data.capacity; i++) {
			const g = this.groupOf[i] ?? 0;
			let css = baseNode;
			if (g > 0) css = this.groupColours[g - 1] ?? baseNode;
			else if (skin && buckets && !look.useNodeColour) css = skin.buckets[buckets[i] as number] ?? baseNode;
			const rgba = toned(css);
			out[4 * i] = rgba[0];
			out[4 * i + 1] = rgba[1];
			out[4 * i + 2] = rgba[2];
			out[4 * i + 3] = alpha;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.colourBuf);
		gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
	}

	/** Re-reads node sizes after the node-size setting changed. */
	refreshSizes(): void {
		this.uploadSizes();
		this.requestDraw();
	}

	/** Per node size in world units; 0 hides the node. */
	private uploadSizes(): void {
		const data = this.data;
		if (!data) return;
		const gl = this.gl;
		const out = new Float32Array(data.capacity);
		for (let i = 0; i < data.capacity; i++) out[i] = this.visible[i] ? (data.radiusWorld[i] as number) : 0;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuf);
		gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
	}

	/** Index buffer of links whose both ends are shown. */
	private uploadEdges(): void {
		const data = this.data;
		if (!data) return;
		const gl = this.gl;
		const kept: number[] = [];
		const edges = data.edges;
		for (let e = 0; e < edges.length; e += 2) {
			const a = edges[e] as number;
			const b = edges[e + 1] as number;
			if (this.visible[a] && this.visible[b]) kept.push(a, b);
		}
		this.edgeCount = kept.length;
		gl.bindVertexArray(this.linkVao);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeBuf);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(kept), gl.DYNAMIC_DRAW);
		gl.bindVertexArray(null);
	}

	// --- drawing -----------------------------------------------------------------------------

	private get moving(): boolean {
		return !!this.skin?.animated && this.effects && this.look.effectsSpeed > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/** Drift is on, and the system has not asked for reduced motion. */
	private get drifting(): boolean {
		const d = this.options.drift;
		return !!d?.enabled && d.amount > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/** How far a note moves from its place, in world units, for the current camera distance (the setting is in pixels on screen). */
	private driftWorld(): number {
		const d = this.options.drift;
		if (!d || !this.drifting) return 0;
		return driftAmplitudePx(d.amount) * ((2 * this.camera.distance * Math.tan(this.camera.fovY / 2)) / Math.max(1, this.height));
	}

	/** A note's drift offset in world units (same as the shader), or zeros when drift is off. */
	private driftOffset(id: number, amp: number, seconds: number, out: number[]): void {
		if (amp === 0) {
			out[0] = 0;
			out[1] = 0;
			out[2] = 0;
			return;
		}
		driftUnit(this.driftSeeds, id, seconds, driftOmega(this.options.drift?.speed ?? 0), out);
		out[0] = (out[0] as number) * amp;
		out[1] = (out[1] as number) * amp;
		out[2] = (out[2] as number) * amp;
	}

	/** Electrons are on, and the system has not asked for reduced motion. */
	private get flowing(): boolean {
		return !!this.options.electrons?.enabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	/** A gentle redraw loop (about 30 frames a second) while something moves: skin effects or auto-rotation. */
	private updateAnimation(): void {
		window.clearTimeout(this.animTimer);
		this.animTimer = 0;
		if (!this.moving && !this.flowing && !this.drifting && !(this.autoRotate && this.look.effectsSpeed > 0)) return;
		const step = () => {
			this.animTimer = window.setTimeout(step, 33);
			if (!this.canvas.isConnected || document.visibilityState !== 'visible') return;
			if (this.autoRotate && performance.now() - this.lastInteraction > 1500) this.camera.yaw += 0.0035 * this.look.effectsSpeed;
			this.requestDraw();
		};
		step();
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
		if (this.frame) window.cancelAnimationFrame(this.frame);
		this.frame = 0;
		const gl = this.gl;
		for (const b of [this.posBuf, this.seedBuf, this.colourBuf, this.sizeBuf, this.stateBuf, this.edgeBuf, this.hoverEdgeBuf, this.starBuf]) gl.deleteBuffer(b);
		for (const p of [this.nodeProg, this.linkProg, this.starProg]) gl.deleteProgram(p);
		for (const v of [this.vao, this.linkVao, this.starVao]) gl.deleteVertexArray(v);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		this.canvas.remove();
		this.overlay.remove();
		this.data = null;
	}

	private uniform(prog: WebGLProgram, name: string): WebGLUniformLocation | null {
		return this.gl.getUniformLocation(prog, name);
	}

	/** A whole-graph effect for this frame (a scale about the target and a shake), see motion.ts. */
	setMotion(frame: MotionFrame): void {
		this.motion = frame;
		this.requestDraw();
	}

	/** Draws with the motion applied to the camera for this frame only; the real camera is put back afterwards. */
	private draw(): void {
		const cam = this.camera;
		const m = this.motion;
		const { distance, yaw, pitch } = cam;
		if (m.scale !== 1) cam.distance = distance / m.scale;
		cam.yaw = yaw + m.dx * 0.0009;
		cam.pitch = pitch + m.dy * 0.0009;
		try {
			this.drawFrame();
		} finally {
			cam.distance = distance;
			cam.yaw = yaw;
			cam.pitch = pitch;
		}
	}

	private drawFrame(): void {
		const started = performance.now();
		const gl = this.gl;
		const data = this.data;
		if (!data) return;
		this.time = started / 1000;
		this.fxTime = this.time * this.look.effectsSpeed;
		const look = this.look;
		const skin = this.skin;
		const aspect = this.width / this.height;
		const cam = this.camera;
		const vp = cam.viewProjection(aspect);
		this.driftAmpNow = this.driftWorld();
		this.driftSeconds = this.time;
		const driftT = this.time * driftOmega(this.options.drift?.speed ?? 0);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		const additive = !!skin?.glow;
		const dim = this.highlight >= 0;
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
		gl.disable(gl.DEPTH_TEST);

		// 1. Distant stars (galaxy skin): follow the camera's rotation only.
		if (skin?.starfield) {
			const view = cam.view();
			view[12] = 0;
			view[13] = 0;
			view[14] = 0;
			const rot = multiply(perspective(cam.fovY, aspect, 0.1, 10), view);
			gl.useProgram(this.starProg);
			gl.uniformMatrix4fv(this.uniform(this.starProg, 'u_rot'), false, rot);
			gl.uniform1f(this.uniform(this.starProg, 'u_time'), this.moving ? this.fxTime : 0);
			gl.uniform1f(this.uniform(this.starProg, 'u_dpr'), this.dpr);
			gl.uniform1f(this.uniform(this.starProg, 'u_bright'), look.backgroundBrightness * look.brightness);
			gl.bindVertexArray(this.starVao);
			gl.drawArrays(gl.POINTS, 0, this.starCount);
		}

		// 2. Links.
		if (this.edgeCount > 0) {
			const link = this.toneRgba(look.useLinkColour ? look.linkColour : skin ? skin.linkColour : this.colours.link, look.brightness);
			const alpha = scaleAlpha(skin ? skin.linkAlpha * 1.4 : 0.5, look.linkBrightness);
			gl.useProgram(this.linkProg);
			gl.uniformMatrix4fv(this.uniform(this.linkProg, 'u_vp'), false, vp);
			gl.uniform1f(this.uniform(this.linkProg, 'u_distance'), cam.distance);
			gl.uniform1f(this.uniform(this.linkProg, 'u_radius'), this.radius);
			gl.uniform1f(this.uniform(this.linkProg, 'u_fade'), look.depthFade);
			gl.uniform1f(this.uniform(this.linkProg, 'u_driftAmp'), this.driftAmpNow);
			gl.uniform1f(this.uniform(this.linkProg, 'u_driftT'), driftT);
			gl.uniform4f(this.uniform(this.linkProg, 'u_color'), link[0] / 255, link[1] / 255, link[2] / 255, dim ? alpha * 0.2 : alpha);
			gl.bindVertexArray(this.linkVao);
			gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_INT, 0);
			if (dim && this.hoverEdgeCount > 0) {
				const accent = this.toneRgba(skin ? skin.accent : this.colours.accent, look.brightness);
				gl.uniform4f(this.uniform(this.linkProg, 'u_color'), accent[0] / 255, accent[1] / 255, accent[2] / 255, 0.95);
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.hoverEdgeBuf);
				gl.drawElements(gl.LINES, this.hoverEdgeCount, gl.UNSIGNED_INT, 0);
			}
		}

		// 3. Nodes. Opaque discs use the depth buffer; glowing stars are additive.
		if (!additive) {
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.LEQUAL);
		}
		const accent = this.toneRgba(skin ? skin.accent : this.colours.accent, look.brightness);
		gl.useProgram(this.nodeProg);
		gl.uniformMatrix4fv(this.uniform(this.nodeProg, 'u_vp'), false, vp);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_heightPx'), this.canvas.height);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_tanHalf'), Math.tan(cam.fovY / 2));
		gl.uniform1f(this.uniform(this.nodeProg, 'u_glow'), additive ? 1 : 0);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_maxRadius'), skin ? 15 : 22);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_maxPoint'), this.maxPoint);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_time'), this.fxTime);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_glowStrength'), look.glowStrength * Math.min(1.5, look.brightness));
		gl.uniform1f(this.uniform(this.nodeProg, 'u_twinkle'), additive && this.moving ? 1 : 0);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_dim'), dim ? 1 : 0);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_driftAmp'), this.driftAmpNow);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_driftT'), driftT);
		gl.uniform1f(this.uniform(this.nodeProg, 'u_dpr'), this.dpr);
		gl.uniform3f(this.uniform(this.nodeProg, 'u_accent'), accent[0] / 255, accent[1] / 255, accent[2] / 255);
		gl.bindVertexArray(this.vao);
		gl.drawArrays(gl.POINTS, 0, data.capacity);
		gl.bindVertexArray(null);
		gl.disable(gl.DEPTH_TEST);

		this.drawOverlay(data, vp);
		this.lastDrawMs = performance.now() - started;
	}

	/** Electrons on a share of the links, placed in 3D and drawn on the overlay with a fade by distance. */
	private drawElectrons(data: RenderData, vp: Float32Array): void {
		const settings = this.options.electrons;
		if (!settings || !this.flowing) return;
		const ctx = this.octx;
		const cam = this.camera;
		const { edges } = data;
		const total = edges.length / 2;
		if (total === 0) return;
		const stride = electronStride(total, settings.amount);
		const now = performance.now() / 1000;
		const p = this.positions;
		const offA = [0, 0, 0];
		const offB = [0, 0, 0];
		const accent = this.toneCss(this.skin ? this.skin.accent : this.colours.accent, this.look.brightness);
		const dark = !!this.skin?.base || document.body.classList.contains('theme-dark');
		ctx.globalCompositeOperation = this.skin?.glow ? 'lighter' : 'source-over';
		for (let i = 0; i < total; i += stride) {
			const a = edges[2 * i] as number;
			const b = edges[2 * i + 1] as number;
			if (!this.visible[a] || !this.visible[b]) continue;
			this.driftOffset(a, this.driftAmpNow, this.driftSeconds, offA);
			this.driftOffset(b, this.driftAmpNow, this.driftSeconds, offB);
			const ax = (p[3 * a] as number) + (offA[0] as number);
			const ay = (p[3 * a + 1] as number) + (offA[1] as number);
			const az = (p[3 * a + 2] as number) + (offA[2] as number);
			const dx = (p[3 * b] as number) + (offB[0] as number) - ax;
			const dy = (p[3 * b + 1] as number) + (offB[1] as number) - ay;
			const dz = (p[3 * b + 2] as number) + (offB[2] as number) - az;
			const pa = cam.project(ax, ay, az, this.width, this.height, vp);
			const pb = cam.project(ax + dx, ay + dy, az + dz, this.width, this.height, vp);
			if (!pa.inFront || !pb.inFront) continue;
			const lengthPx = Math.hypot(pb.x - pa.x, pb.y - pa.y);
			if (lengthPx < ELECTRON_MIN_LINK_PX) continue;
			const head = electronT(now, i, lengthPx, settings.speed);
			for (let k = 0; k < ELECTRON_TAIL_PX.length; k++) {
				const t = head - (ELECTRON_TAIL_PX[k] as number) / lengthPx;
				if (t < 0) continue;
				const q = cam.project(ax + dx * t, ay + dy * t, az + dz * t, this.width, this.height, vp);
				if (!q.inFront || q.x < 0 || q.y < 0 || q.x > this.width || q.y > this.height) continue;
				// nearer ones are bigger and brighter
				const near = Math.max(0.35, Math.min(1.15, (cam.distance * 1.1) / q.depth));
				ctx.globalAlpha = Math.min(1, near * (ELECTRON_TAIL_ALPHA[k] as number) * (k === 0 ? 0.55 : 1));
				ctx.fillStyle = accent;
				ctx.beginPath();
				ctx.arc(q.x, q.y, (k === 0 ? 2.4 : 1.25 - k * 0.22) * near, 0, Math.PI * 2);
				ctx.fill();
				if (k === 0) {
					ctx.fillStyle = dark ? '#ffffff' : accent;
					ctx.globalAlpha = Math.min(1, near * 0.95);
					ctx.beginPath();
					ctx.arc(q.x, q.y, 1.1 * near, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	/** Labels for the nearest big-enough nodes, and a ring on the hovered one. */
	private drawOverlay(data: RenderData, vp: Float32Array): void {
		const ctx = this.octx;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.width, this.height);
		const cam = this.camera;
		this.drawElectrons(data, vp);
		const minPx = 5 + this.options.textFadeThreshold * 4;
		const candidates: { id: number; x: number; y: number; depth: number; r: number }[] = [];
		const off = this.driftTmp;
		const count = Math.min(data.capacity, Math.floor(this.positions.length / 3));
		for (let i = 0; i < count; i++) {
			if (!this.visible[i]) continue;
			this.driftOffset(i, this.driftAmpNow, this.driftSeconds, off);
			const p = cam.project((this.positions[3 * i] as number) + (off[0] as number), (this.positions[3 * i + 1] as number) + (off[1] as number), (this.positions[3 * i + 2] as number) + (off[2] as number), this.width, this.height, vp);
			if (!p.inFront || p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) continue;
			const r = pixelRadius(data.radiusWorld[i] as number, p.depth, this.height, cam.fovY);
			const hot = this.highlight >= 0 && (i === this.highlight || this.isNeighbour(i));
			if (r >= minPx || hot) candidates.push({ id: i, x: p.x, y: p.y, depth: p.depth, r });
		}
		candidates.sort((a, b) => a.depth - b.depth);
		const skin = this.skin;
		ctx.font = `${this.look.labelSize}px ${this.font}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		ctx.fillStyle = this.toneCss(skin ? skin.label : this.colours.label, this.look.brightness * this.look.labelBrightness);
		const nearest = candidates[0]?.depth ?? 1;
		for (const c of candidates.slice(0, MAX_LABELS)) {
			const hot = c.id === this.highlight || (this.highlight >= 0 && this.isNeighbour(c.id));
			ctx.globalAlpha = hot ? 1 : Math.max(0.25, Math.min(1, (nearest * 1.8) / c.depth));
			const path = data.labelOf(c.id);
			ctx.fillText(path, c.x, c.y + c.r + 3);
		}
		if (this.highlight >= 0) {
			this.driftOffset(this.highlight, this.driftAmpNow, this.driftSeconds, off);
			const hp = this.positions;
			const proj = cam.project((hp[3 * this.highlight] as number) + (off[0] as number), (hp[3 * this.highlight + 1] as number) + (off[1] as number), (hp[3 * this.highlight + 2] as number) + (off[2] as number), this.width, this.height, vp);
			const p = proj.inFront ? { x: proj.x, y: proj.y, depth: proj.depth } : null;
			if (p) {
				const r = pixelRadius(data.radiusWorld[this.highlight] as number, p.depth, this.height, cam.fovY) + 4;
				ctx.globalAlpha = 0.9;
				ctx.strokeStyle = this.toneCss(skin ? skin.accent : this.colours.accent, this.look.brightness);
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
				ctx.stroke();
			}
		}
		ctx.globalAlpha = 1;
	}

	private isNeighbour(id: number): boolean {
		const data = this.data;
		if (!data || this.highlight < 0) return false;
		const { offsets, neighbours } = data.adjacency;
		for (let i = offsets[this.highlight] as number; i < (offsets[this.highlight + 1] as number); i++) if (neighbours[i] === id) return true;
		return false;
	}
}
