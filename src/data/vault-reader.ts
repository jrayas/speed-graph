import { TFile, getAllTags, type App, type Plugin } from 'obsidian';
import { GraphModel, unresolvedKey } from './graph-model';

export interface ChangeInfo {
	/** Nodes or links changed. */
	graph: boolean;
	/** Only per-note data (tags) changed. */
	meta: boolean;
}

/**
 * The only module that reads the vault through the Obsidian API.
 * Builds the model once, then keeps it up to date from file events.
 */
export class VaultGraph {
	readonly model = new GraphModel();
	/** Duration of the most recent full build, in milliseconds. */
	lastBuildMs = 0;
	private readonly listeners = new Set<(change: ChangeInfo) => void>();
	private lastVersion = -1;
	private lastMetaVersion = -1;

	constructor(private readonly app: App) {}

	/** Calls `callback` after a real change to the model. Returns an unsubscribe function. */
	onChange(callback: (change: ChangeInfo) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/** Tells listeners about a change, but only if the model really changed. */
	private notify(): void {
		const graph = this.model.version !== this.lastVersion;
		const meta = this.model.metaVersion !== this.lastMetaVersion;
		if (!graph && !meta) return;
		this.lastVersion = this.model.version;
		this.lastMetaVersion = this.model.metaVersion;
		for (const callback of this.listeners) callback({ graph, meta });
	}

	/** Full build from the metadata cache. Returns the time taken in milliseconds. */
	build(): number {
		const started = performance.now();
		const { vault, metadataCache } = this.app;
		const files = vault.getFiles();
		for (const file of files) this.model.addNode(file.path);
		const { resolvedLinks, unresolvedLinks } = metadataCache;
		for (const source of new Set([...Object.keys(resolvedLinks), ...Object.keys(unresolvedLinks)])) {
			this.model.setLinks(source, this.targetsOf(source));
		}
		for (const file of files) if (file.extension === 'md') this.readTags(file);
		this.lastBuildMs = performance.now() - started;
		this.notify();
		return this.lastBuildMs;
	}

	private targetsOf(path: string): string[] {
		const { resolvedLinks, unresolvedLinks } = this.app.metadataCache;
		const targets = Object.keys(resolvedLinks[path] ?? {});
		for (const text of Object.keys(unresolvedLinks[path] ?? {})) targets.push(unresolvedKey(text));
		return targets;
	}

	private readTags(file: TFile): void {
		const cache = this.app.metadataCache.getFileCache(file);
		const tags = cache ? (getAllTags(cache) ?? []) : [];
		this.model.setTags(file.path, [...new Set(tags.map((t) => t.toLowerCase()))]);
	}

	/**
	 * Builds once the workspace layout is ready, then follows file events.
	 * Listeners are registered after layout-ready so Obsidian's per-file
	 * `create` events at vault load do not flood us.
	 */
	attach(plugin: Plugin): void {
		this.app.workspace.onLayoutReady(() => {
			this.build();
			const { vault, metadataCache } = this.app;
			plugin.registerEvent(
				metadataCache.on('resolve', (file) => {
					this.model.setLinks(file.path, this.targetsOf(file.path));
					if (file.extension === 'md') this.readTags(file);
					this.notify();
				}),
			);
			plugin.registerEvent(
				metadataCache.on('changed', (file) => {
					if (file.extension === 'md') this.readTags(file);
					this.notify();
				}),
			);
			plugin.registerEvent(
				vault.on('create', (file) => {
					if (file instanceof TFile) {
						this.model.addNode(file.path);
						this.notify();
					}
				}),
			);
			plugin.registerEvent(
				vault.on('delete', (file) => {
					if (file instanceof TFile) {
						this.model.removeNode(file.path);
						this.notify();
					}
				}),
			);
			plugin.registerEvent(
				vault.on('rename', (file, oldPath) => {
					if (file instanceof TFile) {
						this.model.rename(oldPath, file.path);
						this.notify();
					}
				}),
			);
		});
	}
}
