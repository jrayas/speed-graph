import { validatePack, type LayoutDef, type Pack, type ValidationIssue, parsePackText } from './pack';

/** Where user packs are kept. The plugin supplies one backed by its folder; tests use memory. Methods must not throw. */
export interface PackIO {
	list(): Promise<string[]>;
	read(name: string): Promise<string | null>;
	/** Returns false when the file could not be saved. */
	write(name: string, text: string): Promise<boolean>;
	remove(name: string): Promise<void>;
}

export interface LoadedPack {
	pack: Pack;
	builtin: boolean;
}

export interface LayoutEntry {
	/** "packId/layoutId": what the settings store. */
	key: string;
	label: string;
	pack: Pack;
	layout: LayoutDef;
	builtin: boolean;
}

export type ImportResult = { ok: true; pack: Pack; replaced: boolean; saved: boolean; warnings: ValidationIssue[] } | { ok: false; errors: ValidationIssue[] };

const SUFFIX = '.fgpack.json';

/** The packs that ship with the plugin plus the ones the user imported. */
export class PackStore {
	/** Goes up whenever the packs change, so users of the store know to look again. */
	version = 0;
	/** Saved packs that could not be read, for the settings page to mention. */
	skipped: string[] = [];
	private user: Pack[] = [];

	constructor(
		private readonly io: PackIO,
		private readonly builtins: readonly Pack[],
	) {}

	async load(): Promise<void> {
		this.user = [];
		this.skipped = [];
		const taken = new Set(this.builtins.map((p) => p.id));
		for (const name of (await this.io.list()).filter((n) => n.endsWith(SUFFIX)).sort()) {
			const text = await this.io.read(name);
			const result = text === null ? null : parsePackText(text);
			if (result?.ok && !taken.has(result.pack.id)) {
				this.user.push(result.pack);
				taken.add(result.pack.id);
			} else {
				this.skipped.push(name);
			}
		}
		this.version++;
	}

	all(): LoadedPack[] {
		return [...this.builtins.map((pack) => ({ pack, builtin: true })), ...this.user.map((pack) => ({ pack, builtin: false }))];
	}

	layouts(): LayoutEntry[] {
		const out: LayoutEntry[] = [];
		for (const { pack, builtin } of this.all()) {
			for (const layout of pack.layouts) {
				out.push({ key: `${pack.id}/${layout.id}`, label: builtin ? layout.name : `${layout.name} (${pack.name})`, pack, layout, builtin });
			}
		}
		return out;
	}

	find(key: string): LayoutEntry | undefined {
		return this.layouts().find((e) => e.key === key);
	}

	/** Checks the text and, if it is a good pack, saves it. A pack with the id of a built-in one is refused; one with the id of an earlier import replaces it. */
	async importText(text: string): Promise<ImportResult> {
		const result = parsePackText(text);
		if (!result.ok) return result;
		const { pack } = result;
		if (this.builtins.some((b) => b.id === pack.id)) {
			return { ok: false, errors: [{ path: 'id', message: `'${pack.id}' is the id of a pack that comes with the plugin. Choose another id.` }] };
		}
		const replaced = this.user.some((p) => p.id === pack.id);
		const saved = await this.io.write(`${pack.id}${SUFFIX}`, JSON.stringify(pack, null, 2));
		this.user = [...this.user.filter((p) => p.id !== pack.id), pack];
		this.version++;
		return { ok: true, pack, replaced, saved, warnings: result.warnings };
	}

	/** Removes an imported pack. Built-in packs cannot be removed. */
	async remove(id: string): Promise<boolean> {
		if (!this.user.some((p) => p.id === id)) return false;
		await this.io.remove(`${id}${SUFFIX}`);
		this.user = this.user.filter((p) => p.id !== id);
		this.version++;
		return true;
	}

	/** The pack as text to share or to start your own from. */
	exportText(id: string): string | null {
		const found = this.all().find((p) => p.pack.id === id);
		return found ? JSON.stringify(found.pack, null, 2) : null;
	}
}

export { validatePack };
