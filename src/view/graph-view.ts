import { ItemView, Keymap, Notice, type TFile, type WorkspaceLeaf } from 'obsidian';
import { buildAdjacency, type Adjacency } from '../data/adjacency';
import { computeVisible, parseFolders } from '../data/filter';
import {
	applyCache,
	buildRecord,
	decodeCache,
	encodeCache,
	graphFingerprint,
	hashPath,
	hashText,
	planFromCache,
	type CacheRecord,
} from '../data/layout-cache';
import { displayName, kindOfPath, NODE_UNRESOLVED, type GraphModel } from '../data/graph-model';
import { assignGroups } from '../data/groups';
import { compileShape, layFlat, shapeExtent, type ShapeResult } from '../packs/shapes';
import { themeToSkin } from '../packs/pack';
import type { LayoutEntry, PackStore } from '../packs/store';
import { neighbourhood } from '../data/local-graph';
import { matchesSearch, parseSearch, type Clause, type NodeInfo } from '../data/search';
import { buildSubgraph, gatherPositions, scatterPositions, type Subgraph } from '../data/subgraph';
import type { VaultGraph } from '../data/vault-reader';
import { CanvasRenderer, type RenderData } from '../render/canvas-renderer';
import { Renderer3D } from '../render/renderer3d';
import { nearestNode } from '../render/hit-test';
import { computeBounds, fitBounds, screenToWorld, zoomAt, type ViewTransform } from '../render/transform';
import { BeatClock, effectiveBpm, motionFrame, NO_MOTION } from '../render/motion';
import { getSkin } from '../render/skins';
import { toLayoutParams, type GraphSettings } from '../settings/settings';
import { GraphWorker, type LayoutParams, type ShapeSpec } from '../worker/graph-worker';
import { buildControls, type ChangeKind } from './controls';
import { pointerAction } from './pointer-mode';
import { LayoutDriver } from './layout-driver';

export const VIEW_TYPE_GRAPH = 'fast-graph-view';

export interface GraphViewHost {
	getGraph(): VaultGraph;
	/** Reads and writes the saved layout file. Both must never throw. */
	cache: { load(dim: 2 | 3): Promise<ArrayBuffer | null>; save(dim: 2 | 3, data: ArrayBuffer): Promise<void> };
	settings: GraphSettings;
	/** Built-in and imported packs. */
	packs: PackStore;
	saveSettings(): void;
	/** Called when settings change outside the graph panel (the settings tab). Returns an unsubscribe function. */
	onSettingsChanged(callback: () => void): () => void;
}

type Drag =
	| { kind: 'node'; id: number; startX: number; startY: number; moved: boolean; depthPoint?: [number, number, number] }
	| { kind: 'pan'; lastX: number; lastY: number; startX: number; startY: number }
	/** 3D: dragging empty space turns the camera (or slides it, with `slide`). */
	| { kind: 'orbit'; lastX: number; lastY: number; startX: number; startY: number; slide: boolean };

const REFRESH_DELAY_MS = 400;
const FILTER_DELAY_MS = 200;
const CLICK_SLOP_PX = 4;
/** Share of outlying nodes ignored at each end when fitting the view. */
const FIT_TRIM = 0.02;
const FIT_EVERY_FRAMES = 8;
/** Fitting never zooms in further than this, so small graphs keep normal-sized nodes. */
const FIT_MAX_ZOOM = 1.5;
/** Wait this long after the layout settles before saving it. */
const CACHE_SAVE_DELAY_MS = 1500;

export class GraphView extends ItemView {
	private worker: GraphWorker | null = null;
	private driver: LayoutDriver | null = null;
	private renderer: CanvasRenderer | null = null;
	private renderer3d: Renderer3D | null = null;
	/** 2 or 3: which layout and renderer are in use. */
	private dim: 2 | 3 = 2;
	private renderData: RenderData | null = null;
	private groupAssignment: Uint8Array = new Uint8Array(0);
	private switching = false;
	/** The layout settings last sent to the worker, to notice changes made in the settings page. */
	private motionRaf = 0;
	private resizeRaf = 0;
	/** The graph settings panel is open (opened from the gear in the pane header). */
	private panelOpen = false;
	private gearEl: HTMLElement | null = null;
	private readonly beatClock = new BeatClock();
	/** Recent activity (opening and editing notes) from 0 to 1, fading over about eight seconds; and when the last one happened. */
	private activity = 0;
	private activityAt = 0;
	private lastEventAt = -Infinity;
	private layoutKey = '';
	private shapeKey = '';
	private shapeCache: { key: string; result: ShapeResult } | null = null;
	private shapeError = '';
	private foldersKey = '[]';
	private canvas!: HTMLCanvasElement;
	private statusEl!: HTMLElement;
	private hoverEl!: HTMLElement;
	private controlsEl: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private unsubscribe: (() => void) | null = null;
	private unsubscribeSettings: (() => void) | null = null;
	private refreshTimer = 0;
	private filterTimer = 0;
	private statusTimer = 0;
	private pendingRefresh = false;

	private transform: ViewTransform = { x: 0, y: 0, k: 1 };
	private autoFit = true;
	private width = 1;
	private height = 1;

	// Full-vault arrays, indexed by node ID (length = capacity).
	private capacity = 0;
	private alive: Uint8Array = new Uint8Array(0);
	private degrees: Uint32Array = new Uint32Array(0);
	private radiusWorld: Float32Array = new Float32Array(0);
	private adjacency: Adjacency | null = null;
	private fullEdges: Uint32Array = new Uint32Array(0);
	/** Positions of every node ever laid out, one store per dimension; hidden nodes keep their last spot. */
	private readonly stores = {
		2: { positions: new Float32Array(0) as Float32Array, known: new Uint8Array(0) as Uint8Array },
		3: { positions: new Float32Array(0) as Float32Array, known: new Uint8Array(0) as Uint8Array },
	};
	private get positions(): Float32Array {
		return this.stores[this.dim].positions;
	}
	private get known(): Uint8Array {
		return this.stores[this.dim].known;
	}
	/** What is shown after filters and the local graph. */
	private visible: Uint8Array = new Uint8Array(0);
	private sub: Subgraph | null = null;
	private lastVersion = -1;
	private lastMetaVersion = -1;
	private localPath: string | null = null;
	private hashA: Uint32Array = new Uint32Array(0);
	private hashB: Uint32Array = new Uint32Array(0);
	private fingerprint: [number, number] = [0, 0];
	/** The saved layout, offered once to the first layout start after opening. */
	private cacheRecord: CacheRecord | null = null;
	private cacheOffered = false;
	private cacheTimer = 0;
	private lastSavedKey = '';
	/** What the cache did on the last start, for diagnostics: 'restore', 'warm' or 'none'. */
	cacheInfo: { mode: 'restore' | 'warm' | 'none'; matched: number; alpha: number } = { mode: 'none', matched: 0, alpha: 1 };

	private edgeCount = 0;
	private settled = false;
	private frameCount = 0;

	private readonly pointers = new Map<number, { x: number; y: number }>();
	private drag: Drag | null = null;
	private pinchDistance = 0;
	private hovered = -1;
	private bubbleHover = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly host: GraphViewHost,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_GRAPH;
	}

	getDisplayText(): string {
		return 'Fast graph';
	}

	getIcon(): string {
		return 'git-fork';
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('fast-graph-view');
		this.canvas = root.createEl('canvas', { cls: 'fast-graph-canvas' });
		this.statusEl = root.createDiv({ cls: 'fast-graph-status', text: 'Loading graph…' });
		this.hoverEl = root.createDiv({ cls: 'fast-graph-hover is-hidden' });
		// The settings gear lives in the pane header, left of the "more options" dots, like other views' actions.
		this.gearEl = this.addAction('settings', 'Graph settings', () => this.togglePanel());
		this.renderer = new CanvasRenderer(this.canvas);
		this.renderer.setOptions(this.displayOptions());
		this.dim = 2;
		if (this.host.settings.view3d) this.enter3d();
		this.applySkin();
		this.syncMotion();
		this.buildPanel();
		this.unsubscribeSettings = this.host.onSettingsChanged(() => this.onExternalSettingsChanged());
		this.localPath = this.app.workspace.getActiveFile()?.path ?? null;

		this.registerDomEvent(this.canvas, 'pointerdown', (e) => this.onPointerDown(e));
		this.registerDomEvent(this.canvas, 'pointermove', (e) => this.onPointerMove(e));
		this.registerDomEvent(this.canvas, 'pointerup', (e) => this.onPointerUp(e, true));
		this.registerDomEvent(this.canvas, 'pointercancel', (e) => this.onPointerUp(e, false));
		this.registerDomEvent(this.canvas, 'pointerleave', () => this.setHover(-1));
		this.registerDomEvent(this.canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
		this.registerDomEvent(this.canvas, 'dblclick', (e) => this.onDoubleClick(e));
		this.registerDomEvent(this.canvas, 'contextmenu', (e) => {
			// The right button drags the view (and turns the 3D camera), so it must not open a menu.
			if (this.dim === 3 || this.host.settings.rightButtonPan) e.preventDefault();
		});
		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				this.renderer?.refreshColours();
				this.renderer3d?.refreshColours();
			}),
		);
		this.registerEvent(this.app.workspace.on('file-open', (file) => this.onFileOpen(file)));
		this.registerEvent(this.app.workspace.on('file-open', () => this.noteActivity()));
		this.registerEvent(this.app.vault.on('modify', () => this.noteActivity()));

		// Resize once per frame, outside the observer callback (resizing inside it makes the browser log a harmless but noisy warning).
		this.resizeObserver = new ResizeObserver(() => {
			if (this.resizeRaf !== 0) return;
			this.resizeRaf = window.requestAnimationFrame(() => {
				this.resizeRaf = 0;
				this.handleResize();
			});
		});
		this.resizeObserver.observe(this.canvas);
		this.handleResize();

		try {
			this.worker = new GraphWorker();
			await this.worker.start();
		} catch (error) {
			console.error('[fast-graph] Could not start the layout worker', error);
			this.statusEl.setText('Could not start the layout worker. See the console.');
			return;
		}
		this.driver = new LayoutDriver(this.worker, (positions, cooled) => this.onFrame(positions, cooled));
		this.driver.setAnimate(this.host.settings.animate);
		this.unsubscribe = this.host.getGraph().onChange(() => this.scheduleRefresh());
		const saved = await this.host.cache.load(this.dim);
		this.cacheRecord = saved ? decodeCache(saved) : null;
		if (this.cacheRecord && this.cacheRecord.dim !== this.dim) this.cacheRecord = null;
		this.cacheOffered = this.cacheRecord !== null;
		await this.refresh();
	}

	async onClose(): Promise<void> {
		window.clearTimeout(this.refreshTimer);
		window.clearTimeout(this.filterTimer);
		window.clearTimeout(this.statusTimer);
		window.clearTimeout(this.cacheTimer);
		window.cancelAnimationFrame(this.motionRaf);
		this.motionRaf = 0;
		window.cancelAnimationFrame(this.resizeRaf);
		this.resizeRaf = 0;
		this.unsubscribe?.();
		this.unsubscribeSettings?.();
		this.resizeObserver?.disconnect();
		this.driver?.stop();
		this.worker?.terminate();
		this.renderer?.destroy();
		this.renderer3d?.destroy();
		this.worker = null;
		this.driver = null;
		this.renderer = null;
		this.renderer3d = null;
		await Promise.resolve();
	}

	// --- data pipeline -------------------------------------------------------
	// model change -> loadFull (arrays) -> applyFilters (visible, groups) -> restartLayout (subgraph)

	private scheduleRefresh(): void {
		window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => void this.refresh(), REFRESH_DELAY_MS);
	}

	private scheduleFilter(): void {
		window.clearTimeout(this.filterTimer);
		this.filterTimer = window.setTimeout(() => void this.applyFilters(false), FILTER_DELAY_MS);
	}

	private get model(): GraphModel {
		return this.host.getGraph().model;
	}

	private async refresh(): Promise<void> {
		if (!this.driver || !this.renderer) return;
		if (this.drag?.kind === 'node') {
			// Restarting the layout would drop the pinned node; try again shortly.
			this.scheduleRefresh();
			return;
		}
		const model = this.model;
		const graphChanged = model.version !== this.lastVersion;
		const metaChanged = model.metaVersion !== this.lastMetaVersion;
		if (!graphChanged && !metaChanged) return;
		this.lastVersion = model.version;
		this.lastMetaVersion = model.metaVersion;
		if (model.nodeCount === 0) {
			this.statusEl.setText('No notes yet.');
			return;
		}
		if (graphChanged) this.loadFull(model);
		await this.applyFilters(graphChanged);
	}

	/** Re-reads the whole model into arrays indexed by node ID. */
	private loadFull(model: GraphModel): void {
		const capacity = model.ids.capacity;
		if (capacity !== this.capacity) {
			for (const d of [2, 3] as const) {
				const store = this.stores[d];
				const positions = new Float32Array(capacity * d);
				positions.set(store.positions.subarray(0, Math.min(store.positions.length, positions.length)));
				const known = new Uint8Array(capacity);
				known.set(store.known.subarray(0, Math.min(store.known.length, capacity)));
				store.positions = positions;
				store.known = known;
			}
			this.capacity = capacity;
		}
		this.fullEdges = model.edgeArray();
		this.edgeCount = model.edges;
		this.degrees = model.degrees();
		this.alive = new Uint8Array(capacity);
		for (let i = 0; i < capacity; i++) this.alive[i] = model.ids.pathOf(i) === undefined ? 0 : 1;
		this.hashA = new Uint32Array(capacity);
		this.hashB = new Uint32Array(capacity);
		for (let i = 0; i < capacity; i++) {
			const path = model.ids.pathOf(i);
			if (path === undefined) continue;
			const [a, b] = hashPath(path);
			this.hashA[i] = a;
			this.hashB[i] = b;
		}
		this.fingerprint = graphFingerprint(this.hashA, this.hashB, this.alive, this.fullEdges);
		if (this.cacheOffered && this.cacheRecord) {
			this.cacheInfo.matched = applyCache(this.cacheRecord, this.hashA, this.hashB, this.alive, this.positions, this.known);
		}
		this.adjacency = buildAdjacency(this.fullEdges, capacity);
		this.radiusWorld = new Float32Array(capacity);
		this.updateRadii();
		const renderData: RenderData = {
			capacity,
			alive: this.alive,
			edges: this.fullEdges,
			adjacency: this.adjacency,
			degree: this.degrees,
			radiusWorld: this.radiusWorld,
			labelOf: (id) => {
				const path = model.ids.pathOf(id);
				return path === undefined ? '' : displayName(path);
			},
		};
		this.renderData = renderData;
		this.renderer?.setData(renderData);
		this.renderer3d?.setData(renderData);
		this.hovered = -1;
		this.hoverEl.addClass('is-hidden');
	}

	private infoOf = (id: number): NodeInfo | undefined => {
		const model = this.model;
		const path = model.ids.pathOf(id);
		if (path === undefined) return undefined;
		const name = displayName(path);
		return { path: kindOfPath(path) === NODE_UNRESOLVED ? name : path, name, tags: model.tagsOf(id) };
	};

	/** Works out what is visible and which colour group each node is in; restarts the layout if the visible set changed. */
	private async applyFilters(force: boolean): Promise<void> {
		const renderer = this.renderer;
		if (!renderer || !this.adjacency) return;
		const s = this.host.settings;
		const model = this.model;
		let visible = computeVisible(
			{ capacity: this.capacity, alive: this.alive, edges: this.fullEdges, kindOf: (id) => model.kindOf(id), infoOf: this.infoOf },
			{ search: s.search, showAttachments: s.showAttachments, showOrphans: s.showOrphans, hideUnresolved: s.hideUnresolved, excludedFolders: parseFolders(s.excludedFolders) },
		);
		let message = '';
		if (s.localGraph) {
			const centre = this.localPath === null ? undefined : model.ids.idOf(this.localPath);
			if (centre === undefined) {
				// Nothing chosen yet: show everything and say how to choose.
				message = 'Click a note to see it and its neighbours.';
			} else if (!visible[centre]) {
				message = 'The chosen note is hidden by the filters.';
				visible = new Uint8Array(this.capacity);
			} else {
				visible = neighbourhood(this.adjacency, this.capacity, centre, s.localDepth, visible);
				message = `${displayName(this.localPath ?? '')} and its neighbours. Click a note to move there, double-click to open it.`;
			}
		}
		const changed = force || !sameMask(visible, this.visible);
		this.visible = visible;
		this.groupAssignment = assignGroups(this.capacity, visible, this.infoOf, s.groups);
		const groupColours = s.groups.map((g) => g.color);
		renderer.setVisible(visible);
		renderer.setGroups(groupColours, this.groupAssignment);
		this.renderer3d?.setVisible(visible);
		this.renderer3d?.setGroups(groupColours, this.groupAssignment);
		this.hovered = -1;
		this.hoverEl.addClass('is-hidden');
		renderer.setHighlight(-1);
		this.renderer3d?.setHighlight(-1);
		this.statusMessage = message;
		this.scheduleStatus();
		if (changed) await this.restartLayout();
	}

	private statusMessage = '';

	/** Layout settings and filters that change the picture. If these differ, a saved layout is only a starting point. */
	private layoutSignature(): number {
		const s = this.host.settings;
		return hashText(JSON.stringify([s.centerForce, s.repelForce, s.linkForce, s.linkDistance, s.search, s.showAttachments, s.showOrphans, s.hideUnresolved, s.localGraph, s.excludedFolders, s.activeLayout, s.shapeStrength]));
	}

	private async restartLayout(): Promise<void> {
		const driver = this.driver;
		if (!driver) return;
		const sub = buildSubgraph(this.fullEdges, this.visible);
		this.sub = sub;
		let knownCount = 0;
		for (const id of sub.ids) knownCount += this.known[id] ?? 0;
		let alpha = knownCount > 0 && knownCount >= sub.ids.length / 2 ? 0.3 : 1;
		let restore = false;
		if (this.cacheOffered) {
			// The saved layout is offered to the first start only; later restarts use the current positions.
			this.cacheOffered = false;
			const plan = planFromCache(this.cacheRecord, this.fingerprint, this.layoutSignature(), knownCount, sub.ids.length);
			restore = plan.mode === 'restore' && !this.host.settings.localGraph;
			alpha = restore ? 0 : plan.alpha;
			this.cacheInfo = { mode: this.cacheRecord && this.cacheInfo.matched > 0 ? plan.mode : 'none', matched: this.cacheInfo.matched, alpha };
			this.cacheRecord = null;
		}
		const warm = knownCount > 0 ? gatherPositions(this.positions, this.known, sub.ids, this.dim) : undefined;
		this.settled = restore;
		this.frameCount = 0;
		this.autoFit = true;
		if (restore) {
			// Show the saved layout at once; the worker still gets it so dragging works.
			this.showPositions();
			this.fit(false);
			this.scheduleStatus();
		}
		this.layoutKey = JSON.stringify(this.layoutParams());
		this.shapeKey = this.currentShapeKey();
		await driver.start(sub.ids.length, sub.edges.slice(), 1, this.layoutParams(), warm, alpha, this.dim, this.buildShape());
	}

	// --- pack layouts (shape, forces, theme) ---------------------------------

	private activeLayout(): LayoutEntry | undefined {
		const key = this.host.settings.activeLayout;
		return key === '' ? undefined : this.host.packs.find(key);
	}

	/** Layout forces: the user's own, or the active pack layout's while one is in use. */
	private layoutParams(): LayoutParams {
		const s = this.host.settings;
		const entry = this.activeLayout();
		if (!entry) return toLayoutParams(s);
		const f = entry.layout.forces;
		return toLayoutParams({ ...s, centerForce: f.centre, repelForce: f.repel, linkForce: f.link, linkDistance: f.linkDistance }, f.gravity);
	}

	private currentShapeKey(): string {
		const s = this.host.settings;
		return JSON.stringify([s.activeLayout, s.shapeStrength, this.host.packs.version]);
	}

	/** The shape for the nodes now in the layout, or null when no pack layout with a shape is active. */
	private buildShape(): ShapeSpec | null {
		const entry = this.activeLayout();
		const sub = this.sub;
		const s = this.host.settings;
		if (!entry || !sub || !entry.layout.shape || s.shapeStrength <= 0) return null;
		const shape = entry.pack.shapes.find((x) => x.id === entry.layout.shape);
		if (!shape) return null;
		const n = sub.ids.length;
		if (n === 0) return null;
		const count = Math.min(8000, Math.max(1500, Math.round(n * 1.5)));
		const cacheKey = `${entry.key}|${this.host.packs.version}|${count}`;
		let result = this.shapeCache?.key === cacheKey ? this.shapeCache.result : null;
		if (!result) {
			result = compileShape(entry.pack, shape, {}, count);
			this.shapeCache = { key: cacheKey, result };
		}
		if (!result.ok) {
			if (this.shapeError !== result.error) new Notice(`The shape could not be made: ${result.error}`);
			this.shapeError = result.error;
			return null;
		}
		this.shapeError = '';
		// Size of the shape in layout units. It must be a little SMALLER than the graph's natural spread:
		// the pull only acts on notes outside the shape's points, so its edge squeezes the graph in and the
		// repel force then fills the inside. (A shape larger than the graph does nothing.)
		const spacing = entry.layout.forces.linkDistance;
		// Shapes differ in size (a galaxy reaches further out than a heart), so each is first brought to the heart's reach.
		const reach = 0.9 / shapeExtent(this.dim === 3 && shape.kind === 'spiral' ? layFlat(result.points) : result.points, this.dim);
		const scale = (this.dim === 3 ? spacing * Math.cbrt(n) * 0.8 : spacing * Math.sqrt(n) * 0.28) * reach;
		const nodeRegions = new Uint8Array(n).fill(255);
		if (result.regionOf && shape.kind === 'volume') {
			const queries: (Clause[][] | null)[] = shape.regions.map((r) => (r.match.trim() === '' ? null : parseSearch(r.match)));
			for (let i = 0; i < n; i++) {
				const info = this.infoOf(sub.ids[i] as number);
				if (!info) continue;
				for (let r = 0; r < queries.length; r++) {
					const q = queries[r];
					if (q && matchesSearch(q, info)) {
						nodeRegions[i] = r;
						break;
					}
				}
			}
		}
		let targets = result.points;
		if (this.dim === 3 && shape.kind === 'spiral') targets = layFlat(targets); // a disc lies flat in 3D
		if (this.dim === 2) {
			// Shapes are drawn with y pointing up; the flat view's y points down the screen.
			targets = new Float32Array(result.points);
			for (let i = 1; i < targets.length; i += 3) targets[i] = -(targets[i] as number);
		}
		return { targets, scale, targetRegions: result.regionOf ?? new Uint8Array(0), nodeRegions, strength: s.shapeStrength };
	}

	private scheduleCacheSave(): void {
		window.clearTimeout(this.cacheTimer);
		this.cacheTimer = window.setTimeout(() => void this.saveCache(), CACHE_SAVE_DELAY_MS);
	}

	private async saveCache(): Promise<void> {
		if (!this.settled || this.host.settings.localGraph || this.drag !== null) return;
		const signature = this.layoutSignature();
		const key = `${this.dim}:${this.fingerprint[0]}:${this.fingerprint[1]}:${signature}`;
		if (key === this.lastSavedKey) return;
		const record = buildRecord(this.hashA, this.hashB, this.alive, this.known, this.positions, this.fingerprint, signature, true, this.dim);
		await this.host.cache.save(this.dim, encodeCache(record));
		this.lastSavedKey = key;
	}

	private updateRadii(): void {
		const size = this.host.settings.nodeSize;
		for (let i = 0; i < this.radiusWorld.length; i++) {
			this.radiusWorld[i] = (3 + 1.4 * Math.sqrt(this.degrees[i] ?? 0)) * size;
		}
	}

	private onFileOpen(file: TFile | null): void {
		if (!file || file.extension !== 'md') return;
		this.localPath = file.path;
		if (this.host.settings.localGraph) this.scheduleFilter();
	}

	// --- frames, layout, display -------------------------------------------

	private onFrame(compact: Float32Array, cooled: boolean): void {
		if (!this.sub) return;
		scatterPositions(this.positions, this.known, this.sub.ids, compact, this.dim);
		this.settled = cooled;
		this.showPositions();
		// Trimmed bounds cost about 10 ms at 25,000 nodes, so refit every few frames, and when settled.
		if (this.autoFit && (cooled || this.frameCount++ % FIT_EVERY_FRAMES === 0)) this.fit(false);
		if (cooled) this.scheduleCacheSave();
		else window.clearTimeout(this.cacheTimer);
		this.scheduleStatus();
	}

	/** Sends the current positions to whichever renderer is showing. */
	private showPositions(): void {
		if (this.dim === 3) this.renderer3d?.setPositions(this.positions);
		else this.renderer?.setPositions(this.positions);
	}

	private fit(force: boolean): void {
		if (force) this.autoFit = true;
		if (this.dim === 3) {
			this.renderer3d?.fit();
			return;
		}
		const bounds = computeBounds(this.positions, this.visible, FIT_TRIM);
		if (!bounds) return;
		this.setTransform(fitBounds(bounds, this.width, this.height, 40, FIT_MAX_ZOOM));
	}

	private setTransform(t: ViewTransform): void {
		this.transform = t;
		this.renderer?.setTransform(t);
	}

	private displayOptions() {
		const s = this.host.settings;
		return { clusters: s.clusters, linkThickness: s.linkThickness, showArrows: s.showArrows, textFadeThreshold: s.textFadeThreshold, electrons: s.electrons, drift: s.drift };
	}

	private applySkin(): void {
		const s = this.host.settings;
		this.renderer?.setLook(s.look);
		this.renderer3d?.setLook(s.look);
		const entry = this.activeLayout();
		const theme = entry?.layout.theme ? entry.pack.themes.find((t) => t.id === entry.layout.theme) : undefined;
		const skin = theme ? themeToSkin(theme) : getSkin(s.skin);
		this.renderer?.setSkin(skin);
		this.renderer?.setEffects(s.skinEffects);
		this.renderer3d?.setSkin(skin);
		this.renderer3d?.setEffects(s.skinEffects);
		this.renderer3d?.setAutoRotate(s.autoRotate);
	}

	private options3d() {
		const s = this.host.settings;
		return { linkThickness: s.linkThickness, textFadeThreshold: s.textFadeThreshold, electrons: s.electrons, drift: s.drift };
	}

	/** The settings tab changed something: refresh the panel, the look and, if the forces changed, the layout. */
	private onExternalSettingsChanged(): void {
		const s = this.host.settings;
		this.driver?.setAnimate(s.animate);
		this.updateRadii();
		this.renderer?.setOptions(this.displayOptions());
		this.renderer3d?.setOptions(this.options3d());
		this.renderer3d?.refreshSizes();
		this.applySkin();
		this.syncMotion();
		this.buildPanel();
		this.syncDimension();
		const folders = JSON.stringify(parseFolders(s.excludedFolders));
		if (folders !== this.foldersKey) {
			this.foldersKey = folders;
			this.scheduleFilter();
		}
		const key = JSON.stringify(this.layoutParams());
		if (key !== this.layoutKey) {
			this.layoutKey = key;
			void this.driver?.setParams(this.layoutParams());
		}
		const shapeKey = this.currentShapeKey();
		if (shapeKey !== this.shapeKey) {
			this.shapeKey = shapeKey;
			this.autoFit = true;
			this.settled = false;
			void this.driver?.setShape(this.buildShape(), 1);
		}
	}

	/** Opening or editing a note: speeds the heartbeat up for a while and fires the shockwave. */
	private noteActivity(): void {
		const now = performance.now() / 1000;
		this.activity = Math.min(1, this.currentActivity(now) + 0.35);
		this.activityAt = now;
		this.lastEventAt = now;
	}

	private currentActivity(now: number): number {
		return this.activity * Math.exp(-(now - this.activityAt) / 8);
	}

	/** Starts or stops the whole-graph motion effect to match the settings (and the system's reduced-motion choice). */
	private syncMotion(): void {
		const motion = this.host.settings.motion;
		const wanted = motion.kind !== 'off' && motion.strength > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!wanted) {
			window.cancelAnimationFrame(this.motionRaf);
			this.motionRaf = 0;
			this.renderer?.setMotion(NO_MOTION);
			this.renderer3d?.setMotion(NO_MOTION);
			return;
		}
		if (this.motionRaf !== 0) return;
		const tick = (): void => {
			const now = performance.now() / 1000;
			const motion = this.host.settings.motion;
			const frame = motionFrame(motion, now, {
				beatPhase: this.beatClock.advance(now, effectiveBpm(motion, this.currentActivity(now))),
				impulseAge: now - this.lastEventAt,
			});
			// Only the renderer that is showing needs the frame; the flat canvas is just an event surface in 3D.
			if (this.renderer3d) this.renderer3d.setMotion(frame);
			else this.renderer?.setMotion(frame);
			this.motionRaf = window.requestAnimationFrame(tick);
		};
		this.motionRaf = window.requestAnimationFrame(tick);
	}

	/** Switches between 2D and 3D when the setting no longer matches what is showing. */
	private syncDimension(): void {
		const want = this.host.settings.view3d ? 3 : 2;
		if (want !== this.dim && !this.switching) void this.switchDimension(want);
	}

	/** Creates the WebGL renderer and puts the 2D canvas into "event surface" mode. Returns false if WebGL2 is missing. */
	private enter3d(): boolean {
		try {
			const r3 = new Renderer3D(this.contentEl);
			r3.resize(this.width, this.height, window.devicePixelRatio || 1);
			r3.setOptions(this.options3d());
			this.renderer3d = r3;
			this.syncMotion();
		} catch (error) {
			console.error('[fast-graph] Could not start the 3D renderer', error);
			new Notice('Three-dimensional mode is not available on this device, so the graph stays flat.');
			this.host.settings.view3d = false;
			this.host.saveSettings();
			return false;
		}
		this.renderer?.setSuspended(true);
		this.contentEl.addClass('is-3d');
		this.dim = 3;
		return true;
	}

	private async switchDimension(dim: 2 | 3): Promise<void> {
		if (this.switching || dim === this.dim) return;
		this.switching = true;
		try {
			this.driver?.stop();
			window.clearTimeout(this.cacheTimer);
			if (dim === 3) {
				if (!this.enter3d()) {
					this.buildPanel();
					return;
				}
			} else {
				this.renderer3d?.destroy();
				this.renderer3d = null;
				this.renderer?.setSuspended(false);
				this.contentEl.removeClass('is-3d');
				this.dim = 2;
			}
			this.hoverEl.addClass('is-hidden');
			this.hovered = -1;
			this.drag = null;
			this.sub = null;
			this.settled = false;
			this.autoFit = true;
			this.lastSavedKey = '';
			// A saved layout for this dimension, if there is one.
			const saved = await this.host.cache.load(this.dim);
			this.cacheRecord = saved ? decodeCache(saved) : null;
			if (this.cacheRecord && this.cacheRecord.dim !== this.dim) this.cacheRecord = null;
			this.cacheOffered = this.cacheRecord !== null;
			this.cacheInfo = { mode: 'none', matched: 0, alpha: 1 };
			if (this.cacheOffered && this.cacheRecord && this.capacity > 0) {
				this.cacheInfo.matched = applyCache(this.cacheRecord, this.hashA, this.hashB, this.alive, this.positions, this.known);
			}
			this.applySkin();
			if (this.dim === 3 && this.renderer3d && this.renderData) {
				this.renderer3d.setData(this.renderData);
				this.renderer3d.setVisible(this.visible);
				this.renderer3d.setGroups(this.host.settings.groups.map((g) => g.color), this.groupAssignment);
			}
			this.buildPanel();
			this.handleResize();
			await this.applyFilters(true);
		} finally {
			this.switching = false;
			// The setting may have changed again while switching.
			this.syncDimension();
		}
	}

	private buildPanel(): void {
		this.controlsEl?.remove();
		this.controlsEl = buildControls(this.contentEl, this.host.settings, (kind) => this.onSettingsChanged(kind));
		this.controlsEl.toggleClass('is-collapsed', !this.panelOpen);
	}

	private togglePanel(): void {
		this.panelOpen = !this.panelOpen;
		this.controlsEl?.toggleClass('is-collapsed', !this.panelOpen);
		this.gearEl?.toggleClass('is-active', this.panelOpen);
	}

	private onSettingsChanged(kind: ChangeKind): void {
		const s = this.host.settings;
		this.host.saveSettings();
		this.driver?.setAnimate(s.animate);
		this.updateRadii();
		this.renderer?.setOptions(this.displayOptions());
		this.renderer3d?.setOptions(this.options3d());
		this.renderer3d?.refreshSizes();
		this.applySkin();
		this.syncDimension();
		if (kind === 'reset') this.buildPanel();
		// Every time the focus toggle is switched (on or off) the chosen note is forgotten, so it always starts fresh.
		if (kind === 'local') this.localPath = null;
		if (kind === 'layout' || kind === 'reset') void this.driver?.setParams(this.layoutParams());
		if (kind === 'filter' || kind === 'groups' || kind === 'local' || kind === 'reset') this.scheduleFilter();
	}

	private scheduleStatus(): void {
		if (this.statusTimer) return;
		this.statusTimer = window.setTimeout(() => {
			this.statusTimer = 0;
			let shown = 0;
			let total = 0;
			for (let i = 0; i < this.alive.length; i++) {
				total += this.alive[i] ?? 0;
				shown += this.visible[i] ?? 0;
			}
			const ms = (this.dim === 3 ? this.renderer3d?.lastDrawMs : this.renderer?.lastDrawMs)?.toFixed(1) ?? '0';
			const notes = shown === total ? `${total} nodes` : `${shown} of ${total} nodes`;
			const links = this.sub ? this.sub.edges.length / 2 : this.edgeCount;
			const state = this.settled ? 'settled' : 'settling…';
			const bubbles = this.dim === 2 ? (this.renderer?.bubbleCount ?? 0) : 0;
			const mode = this.dim === 3 ? ' · 3D' : '';
			this.statusEl.setText(`${this.statusMessage || `${notes} · ${links} links`}${mode}${bubbles > 0 ? ` · ${bubbles} bubbles` : ''} · ${state} · draw ${ms} ms`);
		}, 250);
	}

	private handleResize(): void {
		const rect = this.canvas.getBoundingClientRect();
		this.width = Math.max(1, Math.round(rect.width));
		this.height = Math.max(1, Math.round(rect.height));
		this.renderer?.resize(this.width, this.height, window.devicePixelRatio || 1);
		this.renderer3d?.resize(this.width, this.height, window.devicePixelRatio || 1);
		if (this.autoFit) this.fit(false);
		else if (this.dim === 2 && this.transform.k === 1 && this.transform.x === 0) this.setTransform({ x: this.width / 2, y: this.height / 2, k: 1 });
	}

	// --- hover card ------------------------------------------------------------

	private showHoverCard(id: number, sx: number, sy: number): void {
		const model = this.model;
		const path = model.ids.pathOf(id);
		if (path === undefined) return;
		this.hoverEl.empty();
		this.hoverEl.createDiv({ cls: 'fast-graph-hover-title', text: displayName(path) });
		if (kindOfPath(path) !== NODE_UNRESOLVED) this.hoverEl.createDiv({ cls: 'fast-graph-hover-path', text: path });
		else this.hoverEl.createDiv({ cls: 'fast-graph-hover-path', text: 'Note does not exist yet' });
		const links = this.degrees[id] ?? 0;
		this.hoverEl.createDiv({ cls: 'fast-graph-hover-meta', text: `${links} ${links === 1 ? 'link' : 'links'}` });
		const tags = model.tagsOf(id);
		if (tags.length > 0) this.hoverEl.createDiv({ cls: 'fast-graph-hover-meta', text: tags.join(' ') });
		this.positionHoverCard(sx, sy);
		this.hoverEl.removeClass('is-hidden');
	}

	private showBubbleCard(count: number, sx: number, sy: number): void {
		this.hoverEl.empty();
		this.hoverEl.createDiv({ cls: 'fast-graph-hover-title', text: `${count} notes` });
		this.hoverEl.createDiv({ cls: 'fast-graph-hover-meta', text: 'Click to zoom in' });
		this.positionHoverCard(sx, sy);
		this.hoverEl.removeClass('is-hidden');
		this.canvas.addClass('is-hovering');
		this.bubbleHover = true;
	}

	private hideBubbleCard(): void {
		if (!this.bubbleHover) return;
		this.bubbleHover = false;
		this.hoverEl.addClass('is-hidden');
		this.canvas.removeClass('is-hovering');
	}

	private positionHoverCard(sx: number, sy: number): void {
		const x = Math.min(sx + 14, this.width - 240);
		const y = Math.min(sy + 14, this.height - 90);
		this.hoverEl.setCssProps({ '--fg-x': `${Math.max(0, x)}px`, '--fg-y': `${Math.max(0, y)}px` });
	}

	// --- interaction ---------------------------------------------------------

	private local(e: MouseEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	private hitTest(sx: number, sy: number): number {
		if (this.dim === 3) return this.renderer3d?.pick(sx, sy) ?? -1;
		const w = screenToWorld(this.transform, sx, sy);
		return nearestNode(this.positions, this.renderer?.getPickable() ?? this.visible, this.radiusWorld, w.x, w.y, 4 / this.transform.k);
	}

	private setHover(id: number, sx = 0, sy = 0): void {
		if (id === this.hovered) {
			if (id >= 0) {
				// A drag or zoom may have hidden the card while the node stayed hovered: show it again.
				if (this.hoverEl.hasClass('is-hidden')) this.showHoverCard(id, sx, sy);
				else this.positionHoverCard(sx, sy);
			}
			return;
		}
		this.hovered = id;
		if (this.dim === 3) this.renderer3d?.setHighlight(id);
		else this.renderer?.setHighlight(id);
		this.canvas.toggleClass('is-hovering', id >= 0);
		if (id >= 0) this.showHoverCard(id, sx, sy);
		else this.hoverEl.addClass('is-hidden');
	}

	private onPointerDown(e: PointerEvent): void {
		const p = this.local(e);
		const mouse = e.pointerType === 'mouse';
		// Only the left button (or a finger) can grab a note; the other buttons never do.
		const id = !mouse || e.button === 0 ? this.hitTest(p.x, p.y) : -1;
		const action = pointerAction({
			dim: this.dim,
			pointerType: e.pointerType,
			button: e.button,
			rightButtonPans: this.host.settings.rightButtonPan,
			onNode: id >= 0,
			modifier: e.shiftKey || e.altKey || e.ctrlKey || e.metaKey,
		});
		if (action === 'ignore') return;
		this.canvas.setPointerCapture(e.pointerId);
		this.pointers.set(e.pointerId, p);
		if (this.pointers.size === 2) {
			this.endNodeDrag();
			this.drag = null;
			this.pinchDistance = this.currentPinchDistance();
			return;
		}
		if (action === 'node') {
			this.drag = { kind: 'node', id, startX: p.x, startY: p.y, moved: false };
			this.setHover(id, p.x, p.y);
		} else if (action === 'orbit' || action === 'slide') {
			this.drag = { kind: 'orbit', lastX: p.x, lastY: p.y, startX: p.x, startY: p.y, slide: action === 'slide' };
			this.canvas.addClass('is-panning');
		} else {
			this.drag = { kind: 'pan', lastX: p.x, lastY: p.y, startX: p.x, startY: p.y };
			this.canvas.addClass('is-panning');
		}
	}

	private onPointerMove(e: PointerEvent): void {
		const p = this.local(e);
		if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
		if (this.pointers.size === 2) {
			this.onPinch();
			return;
		}
		const drag = this.drag;
		if (drag?.kind === 'node') {
			if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > CLICK_SLOP_PX) {
				drag.moved = true;
				// Stop refitting so the view does not shift under the pointer.
				this.autoFit = false;
				this.hoverEl.addClass('is-hidden');
			}
			if (drag.moved) {
				const compact = this.sub ? this.compactIndex(drag.id) : -1;
				const r3 = this.dim === 3 ? this.renderer3d : null;
				if (r3) {
					// Move the node in the plane that faces the camera, through where it was grabbed.
					drag.depthPoint ??= r3.nodePosition(drag.id);
					const size = r3.size;
					const w = r3.camera.pointOnViewPlane(p.x, p.y, size.width, size.height, drag.depthPoint);
					if (compact >= 0) this.driver?.fix(compact, w[0], w[1], w[2]);
				} else {
					const w = screenToWorld(this.transform, p.x, p.y);
					if (compact >= 0) this.driver?.fix(compact, w.x, w.y);
				}
			}
		} else if (drag?.kind === 'orbit') {
			const r3 = this.renderer3d;
			if (r3) {
				const dx = p.x - drag.lastX;
				const dy = p.y - drag.lastY;
				if (drag.slide) r3.camera.pan(dx, dy, this.height);
				else r3.camera.orbit(dx, dy);
				r3.touch();
			}
			this.autoFit = false;
			this.hoverEl.addClass('is-hidden');
			drag.lastX = p.x;
			drag.lastY = p.y;
		} else if (drag?.kind === 'pan') {
			this.autoFit = false;
			this.setTransform({ ...this.transform, x: this.transform.x + p.x - drag.lastX, y: this.transform.y + p.y - drag.lastY });
			drag.lastX = p.x;
			drag.lastY = p.y;
		} else if (e.pointerType !== 'touch') {
			const id = this.hitTest(p.x, p.y);
			if (id >= 0) {
				this.hideBubbleCard();
				this.setHover(id, p.x, p.y);
			} else {
				this.setHover(-1);
				const bubble = this.dim === 2 ? this.renderer?.bubbleAt(p.x, p.y) : null;
				if (bubble) this.showBubbleCard(bubble.count, bubble.x, bubble.y);
				else this.hideBubbleCard();
			}
		}
	}

	private onPointerUp(e: PointerEvent, allowClick: boolean): void {
		this.pointers.delete(e.pointerId);
		this.canvas.removeClass('is-panning');
		const drag = this.drag;
		this.drag = null;
		this.pinchDistance = 0;
		if (drag?.kind === 'pan' && allowClick && (e.pointerType !== 'mouse' || e.button === 0)) {
			// A click (not a drag) on a bubble zooms in on it.
			const p = this.local(e);
			if (Math.hypot(p.x - drag.startX, p.y - drag.startY) <= CLICK_SLOP_PX) {
				const bubble = this.renderer?.bubbleAt(p.x, p.y);
				if (bubble) {
					this.autoFit = false;
					this.hideBubbleCard();
					this.setTransform(zoomAt(this.transform, bubble.x, bubble.y, 2.5));
				}
			}
		}
		if (drag?.kind !== 'node') return;
		if (allowClick && !drag.moved) this.clickNode(drag.id, e);
		else this.releaseNode(drag.id);
	}

	/** Index of a full-vault ID inside the visible subgraph, or -1. */
	private compactIndex(id: number): number {
		const ids = this.sub?.ids;
		if (!ids) return -1;
		let lo = 0;
		let hi = ids.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const value = ids[mid] as number;
			if (value === id) return mid;
			if (value < id) lo = mid + 1;
			else hi = mid - 1;
		}
		return -1;
	}

	private releaseNode(id: number): void {
		const compact = this.compactIndex(id);
		if (compact >= 0) this.driver?.release(compact);
	}

	private endNodeDrag(): void {
		if (this.drag?.kind === 'node' && this.drag.moved) this.releaseNode(this.drag.id);
	}

	private currentPinchDistance(): number {
		const [a, b] = [...this.pointers.values()];
		return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
	}

	private onPinch(): void {
		const [a, b] = [...this.pointers.values()];
		const distance = this.currentPinchDistance();
		if (!a || !b || this.pinchDistance <= 0 || distance <= 0) return;
		this.autoFit = false;
		if (this.dim === 3 && this.renderer3d) {
			this.renderer3d.camera.dolly(distance / this.pinchDistance);
			this.renderer3d.touch();
		} else {
			this.setTransform(zoomAt(this.transform, (a.x + b.x) / 2, (a.y + b.y) / 2, distance / this.pinchDistance));
		}
		this.pinchDistance = distance;
	}

	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		const p = this.local(e);
		this.autoFit = false;
		this.hoverEl.addClass('is-hidden');
		if (this.dim === 3 && this.renderer3d) {
			this.renderer3d.camera.dolly(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)));
			this.renderer3d.touch();
			return;
		}
		this.setTransform(zoomAt(this.transform, p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
	}

	/**
	 * A click on a note. Normally it opens the note. With the local graph on, it instead makes that note the
	 * centre (its neighbours are shown); Cmd/Ctrl-click, or a double-click, opens it.
	 */
	private clickNode(id: number, e: MouseEvent): void {
		if (this.host.settings.localGraph && !Keymap.isModEvent(e)) {
			this.focusNode(id);
			return;
		}
		this.openNode(id, e);
	}

	/** Makes a note the centre of the local graph. */
	private focusNode(id: number): void {
		const path = this.model.ids.pathOf(id);
		if (path === undefined || path === this.localPath) return;
		this.localPath = path;
		this.scheduleFilter();
	}

	private onDoubleClick(e: MouseEvent): void {
		if (this.host.settings.localGraph) {
			const p = this.local(e);
			const id = this.hitTest(p.x, p.y);
			if (id >= 0) {
				this.openNode(id, e);
				return;
			}
		}
		this.fit(true);
	}

	private openNode(id: number, e: MouseEvent): void {
		const path = this.model.ids.pathOf(id);
		if (path === undefined || kindOfPath(path) === NODE_UNRESOLVED) return;
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;
		// Opens in a new tab so the graph stays visible; Cmd/Ctrl-click variants are honoured.
		const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e) || 'tab');
		void leaf.openFile(file);
	}
}

function sameMask(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
