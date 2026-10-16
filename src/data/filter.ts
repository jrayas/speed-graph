import { NODE_ATTACHMENT, NODE_UNRESOLVED } from './graph-model';
import { matchesSearch, parseSearch, type NodeInfo } from './search';

export interface FilterOptions {
	search: string;
	showAttachments: boolean;
	showOrphans: boolean;
	/** "Existing files only": hide links to notes that do not exist. */
	hideUnresolved: boolean;
	/** Folders to leave out, as written by the user (see parseFolders). Optional so older callers keep working. */
	excludedFolders?: readonly string[];
}

/** One folder per line (or comma), trimmed, slashes removed from the ends, lower-cased, empty and duplicate lines dropped. */
export function parseFolders(text: string): string[] {
	const out = new Set<string>();
	for (const part of text.split(/[\n,]/)) {
		const folder = part.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
		if (folder !== '') out.add(folder);
	}
	return [...out];
}

/** True when `path` is inside one of the folders (at any depth). Matches whole folder names only: "Notes" does not exclude "Notes2/a.md". */
export function isInExcludedFolder(path: string, folders: readonly string[]): boolean {
	if (folders.length === 0) return false;
	const lower = path.toLowerCase();
	for (const folder of folders) {
		if (lower.startsWith(folder + '/')) return true;
	}
	return false;
}

/** Everything the filters need, as plain functions and arrays (no Obsidian types). */
export interface FilterInput {
	capacity: number;
	alive: Uint8Array;
	edges: Uint32Array;
	kindOf(id: number): number;
	infoOf(id: number): NodeInfo | undefined;
}

/**
 * Which nodes to show. Search, attachments and unresolved links are applied first;
 * then, if orphans are hidden, any node left with no visible link is dropped.
 */
export function computeVisible(input: FilterInput, options: FilterOptions): Uint8Array {
	const { capacity, alive, edges } = input;
	const query = parseSearch(options.search);
	const folders = options.excludedFolders ?? [];
	const visible = new Uint8Array(capacity);
	for (let id = 0; id < capacity; id++) {
		if (!alive[id]) continue;
		const kind = input.kindOf(id);
		if (kind === NODE_ATTACHMENT && !options.showAttachments) continue;
		if (kind === NODE_UNRESOLVED && options.hideUnresolved) continue;
		const info = input.infoOf(id);
		if (info && kind !== NODE_UNRESOLVED && isInExcludedFolder(info.path, folders)) continue;
		if (info && !matchesSearch(query, info)) continue;
		visible[id] = 1;
	}
	if (!options.showOrphans) {
		const linked = new Uint8Array(capacity);
		for (let e = 0; e < edges.length; e += 2) {
			const a = edges[e] as number;
			const b = edges[e + 1] as number;
			if (visible[a] && visible[b]) {
				linked[a] = 1;
				linked[b] = 1;
			}
		}
		for (let id = 0; id < capacity; id++) if (!linked[id]) visible[id] = 0;
	}
	return visible;
}
