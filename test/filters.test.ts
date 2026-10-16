import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, parseSearch, type NodeInfo } from '../src/data/search';
import { computeVisible, isInExcludedFolder, parseFolders, type FilterInput } from '../src/data/filter';
import { assignGroups } from '../src/data/groups';
import { neighbourhood } from '../src/data/local-graph';
import { buildSubgraph, gatherPositions, scatterPositions } from '../src/data/subgraph';
import { buildAdjacency } from '../src/data/adjacency';

const info = (path: string, tags: string[] = []): NodeInfo => ({ path, name: path.replace(/^.*\//, '').replace(/\.md$/, ''), tags });
const m = (query: string, i: NodeInfo) => matchesSearch(parseSearch(query), i);

test('search: bare, quoted, field, negation and OR', () => {
	const a = info('Projects/Alpha plan.md', ['#work', '#work/urgent']);
	assert.ok(m('', a));
	assert.ok(m('alpha', a) && m('ALPHA PLAN', a)); // two bare terms must both match
	assert.ok(!m('alpha beta', a));
	assert.ok(m('"alpha plan"', a));
	assert.ok(m('path:projects', a) && !m('path:archive', a));
	assert.ok(m('file:plan', a) && !m('file:projects', a));
	assert.ok(m('tag:#work', a) && m('tag:work', a) && m('tag:#work/urgent', a) && !m('tag:#wor', a));
	assert.ok(!m('-alpha', a) && m('-beta', a));
	assert.ok(m('beta OR alpha', a) && !m('beta OR gamma', a));
	assert.ok(m('alpha tag:#work -path:archive', a));
});

test('search: a quoted OR is a literal word, and bad input is harmless', () => {
	assert.ok(m('"or"', info('Pros or cons.md')));
	assert.deepEqual(parseSearch('   '), []);
	assert.deepEqual(parseSearch('-'), []);
	assert.doesNotThrow(() => parseSearch('"unclosed tag:'));
});

function input(): FilterInput {
	// 0 note A (tag #x) <-> 1 note B ; 2 orphan note ; 3 image ; 4 unresolved link target; 0 -> 4 ; 1 -> 3
	const paths = ['A.md', 'B.md', 'C.md', 'pic.png', '\u0000ghost'];
	const kinds = [0, 0, 0, 1, 2];
	return {
		capacity: 5,
		alive: new Uint8Array(5).fill(1),
		edges: Uint32Array.from([0, 1, 0, 4, 1, 3]),
		kindOf: (i) => kinds[i]!,
		infoOf: (i) => info(paths[i]!, i === 0 ? ['#x'] : []),
	};
}
const all = { search: '', showAttachments: true, showOrphans: true, hideUnresolved: false };

test('filter: defaults show everything; attachments, unresolved and orphans toggles', () => {
	assert.deepEqual([...computeVisible(input(), all)], [1, 1, 1, 1, 1]);
	assert.deepEqual([...computeVisible(input(), { ...all, showAttachments: false })], [1, 1, 1, 0, 1]);
	assert.deepEqual([...computeVisible(input(), { ...all, hideUnresolved: true })], [1, 1, 1, 1, 0]);
	assert.deepEqual([...computeVisible(input(), { ...all, showOrphans: false })], [1, 1, 0, 1, 1]);
	// With the unresolved target and the image hidden, only A-B stay linked.
	assert.deepEqual([...computeVisible(input(), { ...all, showOrphans: false, showAttachments: false, hideUnresolved: true })], [1, 1, 0, 0, 0]);
});

test('filter: search by tag and path, and hidden slots stay hidden', () => {
	assert.deepEqual([...computeVisible(input(), { ...all, search: 'tag:#x' })], [1, 0, 0, 0, 0]);
	assert.deepEqual([...computeVisible(input(), { ...all, search: 'B' })], [0, 1, 0, 0, 0]);
	const dead = input();
	dead.alive[1] = 0;
	assert.equal(computeVisible(dead, all)[1], 0);
});

test('groups: first matching group wins, empty queries are ignored', () => {
	const i = input();
	const out = assignGroups(5, i.alive, i.infoOf, [{ query: '', color: '#000' }, { query: 'tag:#x', color: '#f00' }, { query: 'pic', color: '#0f0' }]);
	assert.equal(out[0], 2); // the tag group; the empty first group is ignored
	assert.equal(out[1], 0);
	assert.equal(out[3], 3); // pic.png matches the third group
});

test('local graph: depth, direction and allowed mask', () => {
	// chain 0-1-2-3, plus 4 attached to 1
	const adj = buildAdjacency(Uint32Array.from([0, 1, 1, 2, 2, 3, 4, 1]), 5);
	const allowed = new Uint8Array(5).fill(1);
	assert.deepEqual([...neighbourhood(adj, 5, 1, 0, allowed)], [0, 1, 0, 0, 0]);
	assert.deepEqual([...neighbourhood(adj, 5, 1, 1, allowed)], [1, 1, 1, 0, 1]);
	assert.deepEqual([...neighbourhood(adj, 5, 1, 2, allowed)], [1, 1, 1, 1, 1]);
	allowed[2] = 0; // a hidden node blocks the path to 3
	assert.deepEqual([...neighbourhood(adj, 5, 1, 5, allowed)], [1, 1, 0, 0, 1]);
	assert.deepEqual([...neighbourhood(adj, 5, 2, 5, allowed)], [0, 0, 0, 0, 0]);
	assert.deepEqual([...neighbourhood(adj, 5, -1, 3, allowed)], [0, 0, 0, 0, 0]);
});

test('subgraph: compact IDs, dropped edges, scatter and gather', () => {
	const visible = Uint8Array.from([1, 0, 1, 1]);
	const edges = Uint32Array.from([0, 2, 2, 3, 0, 1, 1, 3]);
	const sub = buildSubgraph(edges, visible);
	assert.deepEqual([...sub.ids], [0, 2, 3]);
	assert.deepEqual([...sub.edges], [0, 1, 1, 2]);
	const full = new Float32Array(8).fill(-1);
	const known = new Uint8Array(4);
	scatterPositions(full, known, sub.ids, Float32Array.from([10, 11, 20, 21, 30, 31]));
	assert.deepEqual([...full], [10, 11, -1, -1, 20, 21, 30, 31]);
	assert.deepEqual([...known], [1, 0, 1, 1]);
	assert.deepEqual([...gatherPositions(full, known, sub.ids)], [10, 11, 20, 21, 30, 31]);
	// A node that was never positioned gets a spiral spot, not (0, 0) or stale data.
	const withNew = gatherPositions(full, Uint8Array.from([1, 0, 0, 1]), Uint32Array.from([0, 1, 3]));
	assert.deepEqual([...withNew.slice(0, 2)], [10, 11]);
	assert.ok(Math.hypot(withNew[2]!, withNew[3]!) > 0);
	assert.deepEqual([...withNew.slice(4, 6)], [30, 31]);
});

test('subgraph positions in 3D: scatter and gather use three numbers, and new nodes spread through a sphere', () => {
	const full = new Float32Array(12).fill(-1);
	const known = new Uint8Array(4);
	scatterPositions(full, known, Uint32Array.from([1, 3]), Float32Array.from([1, 2, 3, 4, 5, 6]), 3);
	assert.deepEqual([...full], [-1, -1, -1, 1, 2, 3, -1, -1, -1, 4, 5, 6]);
	assert.deepEqual([...known], [0, 1, 0, 1]);
	const g = gatherPositions(full, known, Uint32Array.from([0, 1, 2, 3]), 3);
	assert.deepEqual([...g.slice(3, 6)], [1, 2, 3]);
	assert.deepEqual([...g.slice(9, 12)], [4, 5, 6]);
	// the two new nodes (0 and 2) get distinct points that use all three axes overall
	assert.notDeepEqual([...g.slice(0, 3)], [...g.slice(6, 9)]);
	const fresh = gatherPositions(new Float32Array(300), new Uint8Array(100), Uint32Array.from({ length: 100 }, (_, i) => i), 3);
	const spread = (axis: number) => { const v = Array.from({ length: 100 }, (_, i) => fresh[3 * i + axis] as number); const m = v.reduce((a, b) => a + b, 0) / 100; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / 100); };
	assert.ok(spread(0) > 1 && spread(1) > 1 && spread(2) > 1);
});

test('exclude folders: parsing, whole-folder matching and the filter', () => {
	assert.deepEqual(parseFolders(' Templates/ \n/Archive/Old\n\ntemplates, Notes '), ['templates', 'archive/old', 'notes']);
	assert.deepEqual(parseFolders(''), []);
	assert.ok(isInExcludedFolder('Templates/a.md', ['templates']));
	assert.ok(isInExcludedFolder('Archive/Old/x/y.md', ['archive/old']));
	assert.ok(!isInExcludedFolder('Archive/New/y.md', ['archive/old']));
	assert.ok(!isInExcludedFolder('Notes2/a.md', ['notes'])); // whole folder names only
	assert.ok(!isInExcludedFolder('a/Templates/b.md', ['templates'])); // matched from the vault root
	assert.ok(!isInExcludedFolder('Templates.md', ['templates']));
	assert.ok(!isInExcludedFolder('A.md', []));
	const i = input();
	const base = { search: '', showAttachments: true, showOrphans: true, hideUnresolved: false };
	assert.deepEqual([...computeVisible(i, { ...base, excludedFolders: [] })], [1, 1, 1, 1, 1]);
	const folderInput: FilterInput = { ...i, infoOf: (id) => (id === 3 ? info('Media/pic.png') : i.infoOf(id)) };
	assert.deepEqual([...computeVisible(folderInput, { ...base, excludedFolders: ['media'] })], [1, 1, 1, 0, 1]);
});
