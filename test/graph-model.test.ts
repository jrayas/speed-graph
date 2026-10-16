import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphModel } from '../src/data/graph-model';

function build(links: Record<string, string[]>, nodes: string[] = []): GraphModel {
	const m = new GraphModel();
	for (const n of nodes) m.addNode(n);
	for (const [s, ts] of Object.entries(links)) m.setLinks(s, ts);
	return m;
}

test('builds nodes, de-duplicates edges and ignores self-links', () => {
	const m = build({ 'a.md': ['b.md', 'b.md', 'a.md', 'c.md'] });
	assert.equal(m.nodeCount, 3);
	assert.equal(m.edges, 2);
	assert.deepEqual(m.edgePaths(), ['a.md -> b.md', 'a.md -> c.md']);
	assert.equal(m.edgeArray().length, 4);
});

test('setLinks replaces previous links and keeps counts right', () => {
	const m = build({ 'a.md': ['b.md', 'c.md'] });
	m.setLinks('a.md', ['c.md', 'd.md']);
	assert.equal(m.edges, 2);
	assert.deepEqual(m.edgePaths(), ['a.md -> c.md', 'a.md -> d.md']);
});

test('unchanged setLinks does not bump the version', () => {
	const m = build({ 'a.md': ['b.md'] });
	const v = m.version;
	m.setLinks('a.md', ['b.md']);
	assert.equal(m.version, v);
});

test('removeNode drops incoming and outgoing edges and reuses the ID', () => {
	const m = build({ 'a.md': ['b.md'], 'b.md': ['c.md'], 'c.md': ['a.md'] });
	const bId = m.ids.idOf('b.md');
	m.removeNode('b.md');
	assert.equal(m.edges, 1);
	assert.deepEqual(m.edgePaths(), ['c.md -> a.md']);
	assert.equal(m.addNode('z.md'), bId);
});

test('rename keeps ID and edges', () => {
	const m = build({ 'a.md': ['b.md'] });
	const id = m.ids.idOf('b.md');
	m.rename('b.md', 'folder/b2.md');
	assert.equal(m.ids.idOf('folder/b2.md'), id);
	assert.deepEqual(m.edgePaths(), ['a.md -> folder/b2.md']);
});

test('degrees count in and out links', () => {
	const m = build({ 'a.md': ['b.md', 'c.md'], 'b.md': ['c.md'] });
	const d = m.degrees();
	assert.equal(d[m.ids.idOf('a.md')!], 2);
	assert.equal(d[m.ids.idOf('b.md')!], 2);
	assert.equal(d[m.ids.idOf('c.md')!], 2);
});

test('incremental updates match a full rebuild (randomised, seeded)', () => {
	let seed = 12345;
	const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
	const names = Array.from({ length: 40 }, (_, i) => `n${i}.md`);
	const truth = new Map<string, string[]>();
	const live = new GraphModel();
	for (const n of names) { live.addNode(n); truth.set(n, []); }
	for (let step = 0; step < 600; step++) {
		const op = rnd();
		const name = names[Math.floor(rnd() * names.length)]!;
		if (op < 0.7) {
			// Like resolvedLinks, only link to notes that exist.
			const targets = Array.from({ length: Math.floor(rnd() * 5) }, () => names[Math.floor(rnd() * names.length)]!).filter((t) => truth.has(t));
			if (truth.has(name)) { truth.set(name, targets); live.setLinks(name, targets); }
		} else if (op < 0.85) {
			if (truth.delete(name)) {
				for (const [k, v] of truth) truth.set(k, v.filter((t) => t !== name));
				live.removeNode(name);
			}
		} else if (!truth.has(name)) {
			truth.set(name, []);
			live.addNode(name);
		}
	}
	const fresh = new GraphModel();
	for (const k of truth.keys()) fresh.addNode(k);
	for (const [k, v] of truth) fresh.setLinks(k, v.filter((t) => truth.has(t)));
	assert.deepEqual(live.edgePaths(), fresh.edgePaths());
	assert.equal(live.edges, fresh.edges);
	assert.equal(live.nodeCount, fresh.nodeCount);
});

import { NODE_ATTACHMENT, NODE_NOTE, NODE_UNRESOLVED, displayName, unresolvedKey } from '../src/data/graph-model';

test('node kinds and display names', () => {
	const m = new GraphModel();
	const note = m.addNode('Folder/My note.md');
	const image = m.addNode('Folder/pic.png');
	m.setLinks('Folder/My note.md', [unresolvedKey('ghost')]);
	const ghost = m.ids.idOf(unresolvedKey('ghost'))!;
	assert.equal(m.kindOf(note), NODE_NOTE);
	assert.equal(m.kindOf(image), NODE_ATTACHMENT);
	assert.equal(m.kindOf(ghost), NODE_UNRESOLVED);
	assert.equal(displayName('Folder/My note.md'), 'My note');
	assert.equal(displayName(unresolvedKey('ghost')), 'ghost');
	assert.equal(displayName('Folder/pic.png'), 'pic.png');
});

test('an unresolved node lives while something links to it, then goes', () => {
	const m = new GraphModel();
	m.setLinks('a.md', [unresolvedKey('x'), 'b.md']);
	m.setLinks('b.md', [unresolvedKey('x')]);
	assert.equal(m.nodeCount, 3);
	m.setLinks('a.md', ['b.md']); // a drops its link to x; b still has one
	assert.equal(m.nodeCount, 3);
	m.setLinks('b.md', []); // nothing links to x any more
	assert.equal(m.nodeCount, 2);
	assert.equal(m.ids.idOf(unresolvedKey('x')), undefined);
	assert.equal(m.edges, 1);
});

test('removing a note releases its unresolved links', () => {
	const m = new GraphModel();
	m.setLinks('a.md', [unresolvedKey('x')]);
	m.removeNode('a.md');
	assert.equal(m.nodeCount, 0);
	assert.equal(m.edges, 0);
});

test('tags are stored per note, bump only the meta version, and go with the note', () => {
	const m = new GraphModel();
	m.addNode('a.md');
	m.addNode('b.md');
	const v = m.version;
	m.setTags('a.md', ['#x', '#y']);
	m.setTags('b.md', ['#x']);
	assert.equal(m.version, v);
	assert.equal(m.metaVersion, 2);
	m.setTags('a.md', ['#x', '#y']); // unchanged
	assert.equal(m.metaVersion, 2);
	assert.deepEqual(m.tagCounts(), [['#x', 2], ['#y', 1]]);
	m.removeNode('a.md');
	assert.deepEqual(m.tagCounts(), [['#x', 1]]);
	assert.deepEqual(m.tagsOf(m.ids.idOf('b.md')!), ['#x']);
});
