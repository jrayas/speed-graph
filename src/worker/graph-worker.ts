import wasmBytes from '../generated/core.wasm';
import type { LayoutParams, ShapeSpec, WorkerRequest, WorkerResponse } from './worker';

export type { LayoutParams, ShapeSpec };

export interface LayoutFrame {
	alpha: number;
	cooled: boolean;
	/** Interleaved x, y per node ID. */
	positions: Float32Array;
}

declare const __WORKER_SOURCE__: string;

type Pending = { resolve: (response: WorkerResponse) => void; reject: (error: Error) => void };

/** Owns the layout Web Worker. The worker code and the .wasm are embedded in main.js. */
export class GraphWorker {
	private worker: Worker | null = null;
	private nextId = 1;
	private readonly pending = new Map<number, Pending>();

	async start(): Promise<void> {
		const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' }));
		this.worker = new Worker(url);
		URL.revokeObjectURL(url);
		this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
		this.worker.onerror = (event) => this.failAll(new Error(event.message));
		await this.request({ type: 'init', wasm: wasmBytes });
	}

	async sum(values: Float64Array): Promise<number> {
		const response = await this.request({ type: 'sum', values }, [values.buffer]);
		if (response.type !== 'sum') throw new Error('Unexpected worker response');
		return response.result;
	}

	/** Starts a new layout. The edge array is transferred (the caller's copy is emptied). */
	async layoutInit(nodeCount: number, edges: Uint32Array, seed: number, warm?: Float32Array, dim: 2 | 3 = 2): Promise<void> {
		const transfer: Transferable[] = [edges.buffer];
		if (warm) transfer.push(warm.buffer);
		await this.request({ type: 'layout-init', nodeCount, edges, seed, warm, dim }, transfer);
	}

	async layoutFix(node: number, x: number, y: number, z = 0): Promise<void> {
		await this.request({ type: 'layout-fix', node, x, y, z });
	}

	async layoutRelease(node: number): Promise<void> {
		await this.request({ type: 'layout-release', node });
	}

	async layoutParams(params: LayoutParams): Promise<void> {
		await this.request({ type: 'layout-params', params });
	}

	async layoutShape(shape: ShapeSpec | null): Promise<void> {
		await this.request({ type: 'layout-shape', shape });
	}

	async layoutReheat(alpha: number): Promise<void> {
		await this.request({ type: 'layout-reheat', alpha });
	}

	async layoutTick(ticks: number): Promise<LayoutFrame> {
		const response = await this.request({ type: 'layout-tick', ticks });
		if (response.type !== 'layout') throw new Error('Unexpected worker response');
		return { alpha: response.alpha, cooled: response.cooled, positions: response.positions };
	}

	terminate(): void {
		this.worker?.terminate();
		this.worker = null;
		this.failAll(new Error('Worker terminated'));
	}

	private request(
		message: DistributiveOmit<WorkerRequest, 'id'>,
		transfer: Transferable[] = [],
	): Promise<WorkerResponse> {
		const worker = this.worker;
		if (!worker) return Promise.reject(new Error('Worker not started'));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			worker.postMessage({ ...message, id }, transfer);
		});
	}

	private handle(response: WorkerResponse): void {
		const entry = this.pending.get(response.id);
		if (!entry) return;
		this.pending.delete(response.id);
		if (response.type === 'error') entry.reject(new Error(response.message));
		else entry.resolve(response);
	}

	private failAll(error: Error): void {
		for (const entry of this.pending.values()) entry.reject(error);
		this.pending.clear();
	}
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
