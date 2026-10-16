import { initSync, sum_f64, Layout, Layout3 } from '../../core/pkg/fastgraph_core.js';

// Minimal worker scope typing (the project uses the DOM lib, not the webworker lib).
interface WorkerScope {
	onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
	postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

export interface LayoutParams {
	centerStrength: number;
	repelStrength: number;
	linkStrength: number;
	linkDistance: number;
	theta: number;
	velocityDecay: number;
	/** Pull towards the centre, 0 = off. */
	gravity: number;
	/** How far the repel force reaches, in world units. */
	repelMaxDistance: number;
}

/** A shape for the layout to be pulled into: target points in the shape's own units, multiplied by `scale`. */
export interface ShapeSpec {
	/** [x, y, z, ...] */
	targets: Float32Array;
	scale: number;
	/** One region number per target (255 = none), or empty. */
	targetRegions: Uint8Array;
	/** One region number per layout node (255 = free), or empty. */
	nodeRegions: Uint8Array;
	/** 0 to 1. */
	strength: number;
	/** x, y, z per layout node: a spot of its own to be pulled straight to (used where `anchored` is 1). */
	anchors: Float32Array;
	/** One per layout node: 1 if the note has its own spot. */
	anchored: Uint8Array;
}

export type WorkerRequest =
	| { type: 'init'; id: number; wasm: Uint8Array }
	| { type: 'sum'; id: number; values: Float64Array }
	| { type: 'layout-init'; id: number; nodeCount: number; edges: Uint32Array; seed: number; warm?: Float32Array; dim: 2 | 3 }
	| { type: 'layout-fix'; id: number; node: number; x: number; y: number; z: number }
	| { type: 'layout-release'; id: number; node: number }
	| { type: 'layout-params'; id: number; params: LayoutParams }
	| { type: 'layout-reheat'; id: number; alpha: number }
	| { type: 'layout-shape'; id: number; shape: ShapeSpec | null }
	| { type: 'layout-tick'; id: number; ticks: number };

export type WorkerResponse =
	| { type: 'ready'; id: number }
	| { type: 'sum'; id: number; result: number }
	| { type: 'layout-ok'; id: number }
	| { type: 'layout'; id: number; alpha: number; cooled: boolean; positions: Float32Array }
	| { type: 'error'; id: number; message: string };

/** Both layout engines have the same methods; they differ in how many numbers a position has. */
interface Engine {
	set_params(c: number, r: number, l: number, d: number, theta: number, decay: number, gravity: number, range: number): void;
	reheat(alpha: number): void;
	tick(ticks: number): number;
	is_cooled(): boolean;
	positions(): Float32Array;
	set_positions(p: Float32Array): void;
	release_node(id: number): void;
	set_shape(targets: Float32Array, scale: number, regions: Uint8Array, strength: number): void;
	set_node_regions(regions: Uint8Array): void;
	set_anchors(anchors: Float32Array, flags: Uint8Array): void;
	clear_shape(): void;
	free(): void;
}
let layout: Engine | null = null;
let fixNode: (id: number, x: number, y: number, z: number) => void = () => undefined;

function requireLayout(): Engine {
	if (!layout) throw new Error('Layout not initialised');
	return layout;
}

scope.onmessage = (event) => {
	const request = event.data;
	try {
		switch (request.type) {
			case 'init':
				initSync({ module: request.wasm });
				scope.postMessage({ type: 'ready', id: request.id });
				break;
			case 'sum':
				scope.postMessage({ type: 'sum', id: request.id, result: sum_f64(request.values) });
				break;
			case 'layout-init':
				layout?.free();
				if (request.dim === 3) {
					const l3 = new Layout3(request.nodeCount, request.edges, request.seed);
					layout = l3;
					fixNode = (id, x, y, z) => l3.fix_node(id, x, y, z);
				} else {
					const l2 = new Layout(request.nodeCount, request.edges, request.seed);
					layout = l2;
					fixNode = (id, x, y) => l2.fix_node(id, x, y);
				}
				if (request.warm) layout.set_positions(request.warm);
				scope.postMessage({ type: 'layout-ok', id: request.id });
				break;
			case 'layout-params': {
				const p = request.params;
				requireLayout().set_params(p.centerStrength, p.repelStrength, p.linkStrength, p.linkDistance, p.theta, p.velocityDecay, p.gravity, p.repelMaxDistance);
				scope.postMessage({ type: 'layout-ok', id: request.id });
				break;
			}
			case 'layout-fix':
				requireLayout();
				fixNode(request.node, request.x, request.y, request.z);
				scope.postMessage({ type: 'layout-ok', id: request.id });
				break;
			case 'layout-release':
				requireLayout().release_node(request.node);
				scope.postMessage({ type: 'layout-ok', id: request.id });
				break;
			case 'layout-shape': {
				const l = requireLayout();
				const shape = request.shape;
				if (shape === null) l.clear_shape();
				else {
					l.set_shape(shape.targets, shape.scale, shape.targetRegions, shape.strength);
					l.set_node_regions(shape.nodeRegions);
					l.set_anchors(shape.anchors, shape.anchored);
				}
				scope.postMessage({ type: 'layout-ok', id: request.id });
				break;
			}
			case 'layout-reheat':
				requireLayout().reheat(request.alpha);
				scope.postMessage({ type: 'layout-ok', id: request.id });
				break;
			case 'layout-tick': {
				const l = requireLayout();
				const alpha = l.tick(request.ticks);
				const positions = l.positions();
				scope.postMessage({ type: 'layout', id: request.id, alpha, cooled: l.is_cooled(), positions }, [positions.buffer]);
				break;
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		scope.postMessage({ type: 'error', id: request.id, message });
	}
};
