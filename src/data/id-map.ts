/** Maps note paths to compact numeric IDs. IDs of deleted notes are reused. */
export class IdMap {
	private readonly idByPath = new Map<string, number>();
	private readonly pathById: (string | undefined)[] = [];
	private readonly freeIds: number[] = [];

	get size(): number {
		return this.idByPath.size;
	}

	/** One more than the highest ID ever issued; the length to use for per-node arrays. */
	get capacity(): number {
		return this.pathById.length;
	}

	idOf(path: string): number | undefined {
		return this.idByPath.get(path);
	}

	pathOf(id: number): string | undefined {
		return this.pathById[id];
	}

	getOrCreate(path: string): number {
		const existing = this.idByPath.get(path);
		if (existing !== undefined) return existing;
		const id = this.freeIds.pop() ?? this.pathById.length;
		this.idByPath.set(path, id);
		this.pathById[id] = path;
		return id;
	}

	/** Removes a path and returns its freed ID, or undefined if unknown. */
	remove(path: string): number | undefined {
		const id = this.idByPath.get(path);
		if (id === undefined) return undefined;
		this.idByPath.delete(path);
		this.pathById[id] = undefined;
		this.freeIds.push(id);
		return id;
	}

	/** Keeps the ID and changes the path. Returns the ID, or undefined if oldPath is unknown. */
	rename(oldPath: string, newPath: string): number | undefined {
		const id = this.idByPath.get(oldPath);
		if (id === undefined) return undefined;
		const clash = this.idByPath.get(newPath);
		if (clash !== undefined && clash !== id) throw new Error(`Path already mapped: ${newPath}`);
		this.idByPath.delete(oldPath);
		this.idByPath.set(newPath, id);
		this.pathById[id] = newPath;
		return id;
	}
}
