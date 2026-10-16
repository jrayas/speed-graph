import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinPacks } from '../src/packs/builtin';
import { PackStore, type PackIO } from '../src/packs/store';
import { parsePackText } from '../src/packs/pack';

function memory(initial: Record<string, string> = {}): PackIO & { files: Record<string, string> } {
	const files = { ...initial };
	return {
		files,
		list: async () => Object.keys(files),
		read: async (n) => files[n] ?? null,
		write: async (n, t) => {
			files[n] = t;
			return true;
		},
		remove: async (n) => void delete files[n],
	};
}
const pack = (id: string, extra: Record<string, unknown> = {}) => JSON.stringify({ format: 'fast-graph-pack', version: 1, id, name: id.toUpperCase(), layouts: [{ id: 'l', name: 'Mine' }], ...extra });

test('built-in packs: the four examples load and give layouts with stable keys', async () => {
	const store = new PackStore(memory(), builtinPacks());
	await store.load();
	assert.deepEqual(store.all().map((p) => p.pack.id).sort(), ['brain-stylised', 'galaxy', 'heart', 'trefoil-knot']);
	assert.ok(store.all().every((p) => p.builtin));
	const keys = store.layouts().map((l) => l.key);
	assert.ok(keys.includes('heart/heart-3d') && keys.includes('galaxy/galaxy-3d') && keys.includes('brain-stylised/brain-3d'));
	assert.equal(store.find('heart/heart-flat')?.layout.dimensions, 2);
	assert.equal(store.find('nope/none'), undefined);
});

test('import: a good pack is saved, listed, replaced on re-import and can be removed', async () => {
	const io = memory();
	const store = new PackStore(io, builtinPacks());
	await store.load();
	const v0 = store.version;
	const r = await store.importText(pack('mine'));
	assert.ok(r.ok && !r.replaced && r.saved);
	assert.ok(store.version > v0);
	assert.deepEqual(Object.keys(io.files), ['mine.fgpack.json']);
	assert.equal(store.find('mine/l')?.label, 'Mine (MINE)');
	assert.equal(store.find('mine/l')?.builtin, false);
	const again = await store.importText(pack('mine', { name: 'Newer' }));
	assert.ok(again.ok && again.replaced);
	assert.equal(store.all().filter((p) => p.pack.id === 'mine').length, 1);
	assert.equal(store.all().find((p) => p.pack.id === 'mine')?.pack.name, 'Newer');
	assert.equal(await store.remove('mine'), true);
	assert.deepEqual(io.files, {});
	assert.equal(await store.remove('mine'), false);
});

test('import: bad packs are refused with their problems and nothing is saved', async () => {
	const io = memory();
	const store = new PackStore(io, builtinPacks());
	const bad = await store.importText('{ nope');
	assert.ok(!bad.ok && /Not valid JSON/.test(bad.errors[0]!.message));
	const wrong = await store.importText(JSON.stringify({ format: 'x' }));
	assert.ok(!wrong.ok && wrong.errors.length >= 2);
	const clash = await store.importText(pack('heart'));
	assert.ok(!clash.ok && /comes with the plugin/.test(clash.errors[0]!.message));
	assert.deepEqual(io.files, {});
});

test('built-in packs cannot be removed', async () => {
	const store = new PackStore(memory(), builtinPacks());
	await store.load();
	assert.equal(await store.remove('heart'), false);
	assert.ok(store.find('heart/heart-3d'));
});

test('saved packs come back on the next start; broken or clashing files are skipped, not fatal', async () => {
	const io = memory({
		'good.fgpack.json': pack('good'),
		'broken.fgpack.json': '{ not json',
		'heart.fgpack.json': pack('heart'),
		'notes.txt': 'ignored',
	});
	const store = new PackStore(io, builtinPacks());
	await store.load();
	assert.ok(store.find('good/l'));
	assert.deepEqual(store.skipped.sort(), ['broken.fgpack.json', 'heart.fgpack.json']);
	assert.equal(store.all().filter((p) => p.pack.id === 'heart').length, 1);
});

test('export gives text that imports back to the same pack', async () => {
	const store = new PackStore(memory(), builtinPacks());
	await store.load();
	const text = store.exportText('heart');
	assert.ok(text);
	const back = parsePackText(text as string);
	assert.ok(back.ok);
	assert.equal(store.exportText('missing'), null);
	// a built-in exported and re-imported under a new id becomes a user pack (how developers start their own)
	const copy = JSON.parse(text as string) as { id: string };
	copy.id = 'my-heart';
	const r = await store.importText(JSON.stringify(copy));
	assert.ok(r.ok);
	assert.ok(store.find('my-heart/heart-3d'));
});
