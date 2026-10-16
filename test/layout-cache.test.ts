import test from 'node:test';
import assert from 'node:assert/strict';
import { CACHE_FORMAT, applyCache, buildRecord, decodeCache, encodeCache, graphFingerprint, hashPath, hashText, planFromCache } from '../src/data/layout-cache';

const names = ['a.md', 'b.md', 'c.md', 'd.md'];
const hashes = (list: string[]) => {
	const a = new Uint32Array(list.length);
	const b = new Uint32Array(list.length);
	list.forEach((n, i) => { const [x, y] = hashPath(n); a[i] = x; b[i] = y; });
	return { a, b };
};

test('hashPath is deterministic, 64 bits wide and differs for different paths', () => {
	assert.deepEqual(hashPath('folder/note.md'), hashPath('folder/note.md'));
	assert.notDeepEqual(hashPath('folder/note.md'), hashPath('folder/note2.md'));
	const seen = new Set<string>();
	for (let i = 0; i < 30000; i++) seen.add(hashPath(`folder-${i % 25}/note-${i}.md`).join(':'));
	assert.equal(seen.size, 30000);
	assert.notEqual(hashText('a'), hashText('b'));
});

test('encode and decode round trip, including the settled flag', () => {
	const { a, b } = hashes(names);
	const alive = Uint8Array.from([1, 1, 1, 1]);
	const known = Uint8Array.from([1, 1, 0, 1]);
	const pos = Float32Array.from([1, 2, 3, 4, 99, 99, 7.5, -8.25]);
	const rec = buildRecord(a, b, alive, known, pos, [11, 22], 33, true);
	assert.equal(rec.hashA.length, 3);
	const back = decodeCache(encodeCache(rec))!;
	assert.deepEqual(back.fingerprint, [11, 22]);
	assert.equal(back.signature, 33);
	assert.equal(back.settled, true);
	assert.deepEqual([...back.positions], [1, 2, 3, 4, 7.5, -8.25]);
	assert.equal(decodeCache(encodeCache({ ...rec, settled: false }))!.settled, false);
});

test('decode rejects damaged, truncated, foreign and non-finite files', () => {
	const { a, b } = hashes(names);
	const rec = buildRecord(a, b, new Uint8Array(4).fill(1), new Uint8Array(4).fill(1), new Float32Array(8), [1, 2], 3, true);
	const good = encodeCache(rec);
	assert.ok(decodeCache(good));
	assert.equal(decodeCache(new ArrayBuffer(0)), null);
	assert.equal(decodeCache(good.slice(0, good.byteLength - 4)), null);
	assert.equal(decodeCache(good.slice(0, 31)), null);
	const wrongMagic = good.slice(0); new Uint32Array(wrongMagic)[0] = 123; assert.equal(decodeCache(wrongMagic), null);
	const wrongFormat = good.slice(0); new Uint32Array(wrongFormat)[1] = CACHE_FORMAT + 1; assert.equal(decodeCache(wrongFormat), null);
	const wrongCount = good.slice(0); new Uint32Array(wrongCount)[2] = 999; assert.equal(decodeCache(wrongCount), null);
	const nan = good.slice(0); new Float32Array(nan)[(32 + 4 * 8) / 4] = NaN; assert.equal(decodeCache(nan), null);
});

test('fingerprint ignores order but notices node and link changes', () => {
	const { a, b } = hashes(names);
	const alive = Uint8Array.from([1, 1, 1, 1]);
	const base = graphFingerprint(a, b, alive, Uint32Array.from([0, 1, 1, 2]));
	assert.deepEqual(graphFingerprint(a, b, alive, Uint32Array.from([1, 2, 0, 1])), base);
	assert.notDeepEqual(graphFingerprint(a, b, alive, Uint32Array.from([0, 1, 1, 2, 2, 3])), base);
	assert.notDeepEqual(graphFingerprint(a, b, alive, Uint32Array.from([1, 0, 1, 2])), base); // reversed link
	assert.notDeepEqual(graphFingerprint(a, b, Uint8Array.from([1, 1, 1, 0]), Uint32Array.from([0, 1, 1, 2])), base); // node gone
	const renamed = hashes(['a.md', 'b.md', 'c.md', 'z.md']);
	assert.notDeepEqual(graphFingerprint(renamed.a, renamed.b, alive, Uint32Array.from([0, 1, 1, 2])), base);
});

test('applyCache matches by path hash, not by ID, and leaves the rest alone', () => {
	const old = hashes(['a.md', 'b.md', 'c.md']);
	const rec = buildRecord(old.a, old.b, new Uint8Array(3).fill(1), new Uint8Array(3).fill(1), Float32Array.from([1, 1, 2, 2, 3, 3]), [0, 0], 0, true);
	// New vault: IDs shuffled, one note renamed, one new, slot 3 dead.
	const now = hashes(['c.md', 'new.md', 'a.md', 'gone.md']);
	const alive = Uint8Array.from([1, 1, 1, 0]);
	const pos = new Float32Array(8).fill(-1);
	const known = new Uint8Array(4);
	assert.equal(applyCache(rec, now.a, now.b, alive, pos, known), 2);
	assert.deepEqual([...known], [1, 0, 1, 0]);
	assert.deepEqual([...pos], [3, 3, -1, -1, 1, 1, -1, -1]);
});

test('plan: exact restore only when everything is unchanged, else a warm start scaled by the match', () => {
	const { a, b } = hashes(names);
	const rec = buildRecord(a, b, new Uint8Array(4).fill(1), new Uint8Array(4).fill(1), new Float32Array(8), [5, 6], 7, true);
	assert.deepEqual(planFromCache(rec, [5, 6], 7, 4, 4), { mode: 'restore', alpha: 0 });
	assert.equal(planFromCache(rec, [5, 7], 7, 4, 4).mode, 'warm'); // graph changed
	assert.equal(planFromCache(rec, [5, 6], 8, 4, 4).mode, 'warm'); // settings changed
	assert.equal(planFromCache({ ...rec, settled: false }, [5, 6], 7, 4, 4).mode, 'warm'); // saved mid-simulation
	assert.equal(planFromCache(rec, [5, 6], 7, 3, 4).mode, 'warm'); // a visible node has no position
	assert.equal(planFromCache(rec, [5, 7], 7, 95, 100).alpha, 0.1);
	assert.equal(planFromCache(rec, [5, 7], 7, 60, 100).alpha, 0.3);
	assert.equal(planFromCache(rec, [5, 7], 7, 10, 100).alpha, 1);
	assert.deepEqual(planFromCache(null, [0, 0], 0, 0, 0), { mode: 'warm', alpha: 1 });
});

test('3D caches carry z, are told apart from 2D caches, and a bad dimension is rejected', () => {
	const { a, b } = hashes(names);
	const alive = Uint8Array.from([1, 1, 1, 1]);
	const known = Uint8Array.from([1, 1, 0, 1]);
	const pos = Float32Array.from([1, 2, 3, 4, 5, 6, 99, 99, 99, 7, 8, 9]);
	const rec = buildRecord(a, b, alive, known, pos, [1, 2], 3, true, 3);
	assert.equal(rec.dim, 3);
	assert.deepEqual([...rec.positions], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
	const back = decodeCache(encodeCache(rec))!;
	assert.equal(back.dim, 3);
	assert.deepEqual([...back.positions], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
	assert.equal(encodeCache(rec).byteLength, 32 + 3 * 8 + 3 * 12);
	// applying a 3D cache writes three numbers per node
	const out = new Float32Array(12).fill(-1);
	const k = new Uint8Array(4);
	assert.equal(applyCache(back, a, b, alive, out, k), 3);
	assert.deepEqual([...out], [1, 2, 3, 4, 5, 6, -1, -1, -1, 7, 8, 9]);
	const bad = encodeCache(rec).slice(0); new Uint32Array(bad)[7] = 4; assert.equal(decodeCache(bad), null);
	const oldFormat = encodeCache(rec).slice(0); new Uint32Array(oldFormat)[1] = 1; assert.equal(decodeCache(oldFormat), null);
});
