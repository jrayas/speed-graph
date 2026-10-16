import { Notice, Plugin, normalizePath } from 'obsidian';
import { VaultGraph } from './data/vault-reader';
import { builtinPacks } from './packs/builtin';
import { PackStore, type PackIO } from './packs/store';
import { mergeSettings, type GraphSettings } from './settings/settings';
import { SpeedGraphSettingTab } from './settings/settings-tab';
import { GraphView, VIEW_TYPE_GRAPH } from './view/graph-view';

export default class SpeedGraphPlugin extends Plugin {
	private vaultGraph: VaultGraph | null = null;
	private graphSettings: GraphSettings = mergeSettings(null);
	private saveTimer = 0;
	private readonly settingsListeners = new Set<() => void>();

	async onload(): Promise<void> {
		this.graphSettings = mergeSettings(await this.loadData());
		const packs = new PackStore(this.packIO(), builtinPacks());
		await packs.load();
		const vaultGraph = new VaultGraph(this.app);
		this.vaultGraph = vaultGraph;
		vaultGraph.attach(this);

		this.registerView(
			VIEW_TYPE_GRAPH,
			(leaf) =>
				new GraphView(leaf, {
					getGraph: () => vaultGraph,
					cache: {
						load: (dim) => this.loadLayoutCache(dim),
						save: (dim, data) => this.saveLayoutCache(dim, data),
					},
					settings: this.graphSettings,
					packs,
					saveSettings: () => this.scheduleSave(),
					onSettingsChanged: (callback) => {
						this.settingsListeners.add(callback);
						return () => this.settingsListeners.delete(callback);
					},
				}),
		);
		this.addSettingTab(
			new SpeedGraphSettingTab(this.app, this, {
				settings: this.graphSettings,
				packs,
				readVaultFile: (path) => this.readVaultFile(path),
				changed: () => {
					this.scheduleSave();
					for (const callback of this.settingsListeners) callback();
				},
				clearCache: () => this.clearLayoutCache(),
			}),
		);
		this.addRibbonIcon('git-fork', 'Open speed graph', () => void this.openGraph());
		this.addCommand({
			id: 'clear-layout-cache',
			name: 'Clear layout cache',
			callback: () => void this.clearLayoutCache(),
		});
		this.addCommand({
			id: 'open-graph',
			name: 'Open graph view',
			callback: () => void this.openGraph(),
		});
	}

	/** Imported packs live in the plugin's own folder, one file each. None of these methods throw. */
	private packIO(): PackIO {
		const dir = this.manifest.dir ? normalizePath(`${this.manifest.dir}/packs`) : null;
		const adapter = this.app.vault.adapter;
		const file = (name: string): string => normalizePath(`${dir ?? ''}/${name}`);
		return {
			list: async () => {
				try {
					if (!dir || !(await adapter.exists(dir))) return [];
					return (await adapter.list(dir)).files.map((f) => f.slice(f.lastIndexOf('/') + 1));
				} catch (error) {
					console.warn('[speed-graph] Could not list saved packs', error);
					return [];
				}
			},
			read: async (name) => {
				try {
					return dir ? await adapter.read(file(name)) : null;
				} catch (error) {
					console.warn('[speed-graph] Could not read a saved pack', error);
					return null;
				}
			},
			write: async (name, text) => {
				try {
					if (!dir) return false;
					if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
					await adapter.write(file(name), text);
					return true;
				} catch (error) {
					console.warn('[speed-graph] Could not save a pack', error);
					return false;
				}
			},
			remove: async (name) => {
				try {
					if (dir && (await adapter.exists(file(name)))) await adapter.remove(file(name));
				} catch (error) {
					console.warn('[speed-graph] Could not remove a saved pack', error);
				}
			},
		};
	}

	/** Reads a text file from the vault by path, for importing a pack that lives among the notes. Null if it is not there. */
	private async readVaultFile(path: string): Promise<string | null> {
		try {
			const p = normalizePath(path.trim());
			return (await this.app.vault.adapter.exists(p)) ? await this.app.vault.adapter.read(p) : null;
		} catch {
			return null;
		}
	}

	private cacheFile(dim: 2 | 3 = 2): string | null {
		const dir = this.manifest.dir;
		return dir ? normalizePath(`${dir}/${dim === 3 ? 'layout-cache-3d.bin' : 'layout-cache.bin'}`) : null;
	}

	/** Never throws: a missing or unreadable cache just means a normal first layout. */
	private async loadLayoutCache(dim: 2 | 3): Promise<ArrayBuffer | null> {
		const path = this.cacheFile(dim);
		if (!path) return null;
		try {
			const adapter = this.app.vault.adapter;
			return (await adapter.exists(path)) ? await adapter.readBinary(path) : null;
		} catch (error) {
			console.warn('[speed-graph] Could not read the layout cache', error);
			return null;
		}
	}

	private async saveLayoutCache(dim: 2 | 3, data: ArrayBuffer): Promise<void> {
		const path = this.cacheFile(dim);
		if (!path) return;
		try {
			await this.app.vault.adapter.writeBinary(path, data);
		} catch (error) {
			console.warn('[speed-graph] Could not save the layout cache', error);
		}
	}

	private async clearLayoutCache(): Promise<void> {
		try {
			for (const dim of [2, 3] as const) {
				const path = this.cacheFile(dim);
				if (path && (await this.app.vault.adapter.exists(path))) await this.app.vault.adapter.remove(path);
			}
			new Notice('Layout cache cleared. It will be saved again after the next layout settles.');
		} catch (error) {
			console.warn('[speed-graph] Could not clear the layout cache', error);
			new Notice('Could not clear the layout cache. See the console.');
		}
	}

	private scheduleSave(): void {
		window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.saveData(this.graphSettings), 500);
	}

	private async openGraph(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
		const leaf = existing ?? this.app.workspace.getLeaf('tab');
		if (!existing) await leaf.setViewState({ type: VIEW_TYPE_GRAPH, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	onunload(): void {
		window.clearTimeout(this.saveTimer);
	}
}
