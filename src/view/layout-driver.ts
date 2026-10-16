import type { GraphWorker, LayoutParams, ShapeSpec } from '../worker/graph-worker';

type FrameHandler = (positions: Float32Array, cooled: boolean) => void;

/**
 * Runs layout ticks in the worker, one batch at a time, and hands each frame
 * to the caller. Batch size adapts so each batch takes roughly one frame.
 */
export class LayoutDriver {
	private generation = 0;
	private running = false;
	private wanted = false;
	private animate = true;
	private msPerTick = 5;

	constructor(
		private readonly worker: GraphWorker,
		private readonly onFrame: FrameHandler,
	) {}

	/** `warmAlpha` below 1 cools from there when `warm` start positions are given. */
	async start(nodeCount: number, edges: Uint32Array, seed: number, params: LayoutParams, warm?: Float32Array, warmAlpha = 0.3, dim: 2 | 3 = 2, shape: ShapeSpec | null = null): Promise<void> {
		this.generation++;
		await this.worker.layoutInit(nodeCount, edges, seed, warm, dim);
		await this.worker.layoutParams(params);
		if (shape) await this.worker.layoutShape(shape);
		// A warm start is already near a good layout, so cool from a lower alpha.
		if (warm && warmAlpha < 1) await this.worker.layoutReheat(warmAlpha);
		this.kick();
	}

	setAnimate(animate: boolean): void {
		this.animate = animate;
	}

	async setParams(params: LayoutParams, reheat = 0.6): Promise<void> {
		await this.worker.layoutParams(params);
		await this.worker.layoutReheat(reheat);
		this.kick();
	}

	/** Pulls the layout into a shape (or removes it with null), then lets it settle again. */
	async setShape(shape: ShapeSpec | null, reheat = 0.8): Promise<void> {
		await this.worker.layoutShape(shape);
		await this.worker.layoutReheat(reheat);
		this.kick();
	}

	reheat(alpha: number): void {
		void this.worker.layoutReheat(alpha);
		this.kick();
	}

	fix(node: number, x: number, y: number, z = 0): void {
		void this.worker.layoutFix(node, x, y, z);
		void this.worker.layoutReheat(0.3);
		this.kick();
	}

	release(node: number): void {
		void this.worker.layoutRelease(node);
		this.kick();
	}

	stop(): void {
		this.generation++;
		this.wanted = false;
	}

	private kick(): void {
		this.wanted = true;
		if (!this.running) void this.run();
	}

	private async run(): Promise<void> {
		this.running = true;
		const generation = this.generation;
		try {
			while (this.wanted && generation === this.generation) {
				const ticks = this.animate ? Math.min(30, Math.max(1, Math.round(14 / this.msPerTick))) : 30;
				const started = performance.now();
				const frame = await this.worker.layoutTick(ticks);
				if (generation !== this.generation) break;
				this.msPerTick = 0.7 * this.msPerTick + 0.3 * ((performance.now() - started) / ticks);
				if (frame.cooled) this.wanted = false;
				if (this.animate || frame.cooled) this.onFrame(frame.positions, frame.cooled);
			}
		} catch (error) {
			console.error('[speed-graph] Layout loop failed', error);
		} finally {
			this.running = false;
			// A kick may have arrived between the last check and now.
			if (this.wanted && generation === this.generation) void this.run();
		}
	}
}
