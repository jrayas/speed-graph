/**
 * A small search language for the graph filters and colour groups. It is our own
 * subset: Obsidian exposes no search API, and ours matches names, paths and tags
 * only (not note content).
 *
 *   word            path contains "word" (case-insensitive)
 *   "two words"     path contains the phrase
 *   path:folder     path contains
 *   file:name       note name (without folder and .md) contains
 *   tag:#x          has tag #x, or a nested tag such as #x/y
 *   -term           NOT: any term above, negated
 *   a OR b          either side (each side is terms that must all match)
 */
export interface Clause {
	negate: boolean;
	field: 'any' | 'path' | 'file' | 'tag';
	value: string;
}

/** What a clause can look at for one node. */
export interface NodeInfo {
	path: string;
	name: string;
	tags: readonly string[];
}

const TOKEN = /(-?)(?:(path|file|tag):)?(?:"([^"]*)"|(\S+))/gi;

export function parseSearch(query: string): Clause[][] {
	const alternatives: Clause[][] = [[]];
	for (const match of query.matchAll(TOKEN)) {
		const [, minus = '', field, quoted, bare] = match;
		const value = (quoted ?? bare ?? '').toLowerCase();
		if (!field && !minus && value === 'or' && quoted === undefined) {
			alternatives.push([]);
			continue;
		}
		// A lone "-" is someone still typing a negation, not a search for dashes.
		if (value === '' || (!minus && !field && value === '-')) continue;
		alternatives[alternatives.length - 1]?.push({
			negate: minus === '-',
			field: (field?.toLowerCase() as Clause['field'] | undefined) ?? 'any',
			value: field?.toLowerCase() === 'tag' ? normaliseTag(value) : value,
		});
	}
	return alternatives.filter((a) => a.length > 0);
}

function normaliseTag(value: string): string {
	return value.startsWith('#') ? value : `#${value}`;
}

function clauseMatches(clause: Clause, info: NodeInfo, lowerPath: string, lowerName: string): boolean {
	switch (clause.field) {
		case 'any':
		case 'path':
			return lowerPath.includes(clause.value);
		case 'file':
			return lowerName.includes(clause.value);
		case 'tag':
			return info.tags.some((t) => t === clause.value || t.startsWith(`${clause.value}/`));
	}
}

/** True if the node matches the parsed query. An empty query matches everything. */
export function matchesSearch(alternatives: Clause[][], info: NodeInfo): boolean {
	if (alternatives.length === 0) return true;
	const lowerPath = info.path.toLowerCase();
	const lowerName = info.name.toLowerCase();
	return alternatives.some((all) => all.every((c) => clauseMatches(c, info, lowerPath, lowerName) !== c.negate));
}
