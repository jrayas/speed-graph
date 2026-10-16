import { IdMap } from './id-map';

export const NODE_NOTE = 0;
export const NODE_ATTACHMENT = 1;
export const NODE_UNRESOLVED = 2;

/** Unresolved links (to notes that do not exist) get a key no real path can have. */
const UNRESOLVED_PREFIX = '\u0000';

export function unresolvedKey(linkText: string): string {
	return UNRESOLVED_PREFIX + linkText;
}

export function kindOfPath(path: string): number {
	if (path.startsWith(UNRESOLVED_PREFIX)) return NODE_UNRESOLVED;
	return path.endsWith('.md') ? NODE_NOTE : NODE_ATTACHMENT;
}

/** Text shown for a node: the note name without folders or extension, or the unresolved link text. */
export function displayName(path: string): string {
	if (path.startsWith(UNRESOLVED_PREFIX)) return path.slice(1);
	const name = path.slice(path.lastIndexOf('/') + 1);
	return name.endsWith('.md') ? name.slice(0, -3) : name;
}

/**
 * The link graph as numbers only: no Obsidian types. Edges are directed
 * (source links to target), de-duplicated, and self-links are ignored.
 */
export class GraphModel {
	readonly ids = new IdMap();
	private readonly outgoing = new Map<number, Set<number>>();
	private edgeCount = 0;
	private cached: Uint32Array | null = null;
	private readonly unresolvedRefs = new Map<number, number>();
	private readonly tags = new Map<number, readonly string[]>();
	/** Bumped when nodes or links change, so consumers can tell when to re-fetch. */
	version = 0;
	/** Bumped when only per-note data (tags) changes. */
	metaVersion = 0;

	get nodeCount(): number {
		return this.ids.size;
	}

	get edges(): number {
		return this.edgeCount;
	}

	addNode(path: string): number {
		const had = this.ids.idOf(path) !== undefined;
		const id = this.ids.getOrCreate(path);
		if (!had) this.touch();
		return id;
	}

	/** 0 note, 1 attachment, 2 unresolved link. Unknown IDs count as notes. */
	kindOf(id: number): number {
		const path = this.ids.pathOf(id);
		return path === undefined ? NODE_NOTE : kindOfPath(path);
	}

	/**
	 * Replaces all outgoing links of one note. Targets may include unresolved-link keys
	 * (see unresolvedKey). Creates nodes for unknown targets; an unresolved node is
	 * removed again once nothing links to it.
	 */
	setLinks(sourcePath: string, targetPaths: Iterable<string>): void {
		const source = this.addNode(sourcePath);
		const next = new Set<number>();
		for (const path of targetPaths) {
			const target = this.addNode(path);
			if (target !== source) next.add(target);
		}
		const previous = this.outgoing.get(source);
		if (previous && previous.size === next.size && [...next].every((t) => previous.has(t))) return;
		const dropped: number[] = [];
		if (previous) for (const t of previous) if (!next.has(t)) dropped.push(t);
		for (const t of next) if (!previous?.has(t)) this.countUnresolved(t, 1);
		this.edgeCount += next.size - (previous?.size ?? 0);
		if (next.size > 0) this.outgoing.set(source, next);
		else this.outgoing.delete(source);
		for (const t of dropped) this.countUnresolved(t, -1);
		this.touch();
	}

	/** Tags of one note, lower-case and with the leading #. Replaces the previous list. */
	setTags(path: string, tags: readonly string[]): void {
		const id = this.ids.idOf(path);
		if (id === undefined) return;
		const old = this.tags.get(id);
		if (old && old.length === tags.length && old.every((t, i) => t === tags[i])) return;
		if (tags.length > 0) this.tags.set(id, [...tags]);
		else this.tags.delete(id);
		this.metaVersion++;
	}

	tagsOf(id: number): readonly string[] {
		return this.tags.get(id) ?? [];
	}

	/** Every tag in the vault with the number of notes using it, most used first. */
	tagCounts(): [string, number][] {
		const counts = new Map<string, number>();
		for (const tags of this.tags.values()) for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
		return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	}

	private countUnresolved(id: number, delta: number): void {
		const path = this.ids.pathOf(id);
		if (path === undefined || kindOfPath(path) !== NODE_UNRESOLVED) return;
		const count = (this.unresolvedRefs.get(id) ?? 0) + delta;
		if (count > 0) {
			this.unresolvedRefs.set(id, count);
		} else {
			this.unresolvedRefs.delete(id);
			this.removeNode(path);
		}
	}

	removeNode(path: string): void {
		const id = this.ids.remove(path);
		if (id === undefined) return;
		this.tags.delete(id);
		this.unresolvedRefs.delete(id);
		const own = this.outgoing.get(id);
		if (own) {
			this.edgeCount -= own.size;
			this.outgoing.delete(id);
			for (const t of own) this.countUnresolved(t, -1);
		}
		for (const [source, targets] of this.outgoing) {
			if (targets.delete(id)) {
				this.edgeCount--;
				if (targets.size === 0) this.outgoing.delete(source);
			}
		}
		this.touch();
	}

	rename(oldPath: string, newPath: string): void {
		if (this.ids.rename(oldPath, newPath) !== undefined) this.touch();
	}

	/** Flat [source0, target0, source1, target1, ...]. Cached until the graph changes. */
	edgeArray(): Uint32Array {
		if (this.cached) return this.cached;
		const out = new Uint32Array(this.edgeCount * 2);
		let i = 0;
		for (const [source, targets] of this.outgoing) {
			for (const target of targets) {
				out[i++] = source;
				out[i++] = target;
			}
		}
		this.cached = out;
		return out;
	}

	/** Link count per ID (in + out), length = ids.capacity. Free IDs have 0. */
	degrees(): Uint32Array {
		const out = new Uint32Array(this.ids.capacity);
		for (const [source, targets] of this.outgoing) {
			out[source] = (out[source] ?? 0) + targets.size;
			for (const target of targets) out[target] = (out[target] ?? 0) + 1;
		}
		return out;
	}

	/** Canonical "path -> path" edge list, sorted. For tests and debugging only. */
	edgePaths(): string[] {
		const result: string[] = [];
		for (const [source, targets] of this.outgoing) {
			for (const target of targets) {
				result.push(`${this.ids.pathOf(source)} -> ${this.ids.pathOf(target)}`);
			}
		}
		return result.sort();
	}

	private touch(): void {
		this.cached = null;
		this.version++;
	}
}
