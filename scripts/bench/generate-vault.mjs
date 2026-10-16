// Seeded synthetic vault generator.
// Usage: node bench/generate-vault.mjs <notes> <outDir> [seed]
// Links use preferential attachment (a few hubs, many low-link notes) and
// about 5% of notes are orphans (no links in or out).
// Also written, from a separate random stream so the links never change for a seed:
//  - tags (12 of them): half in frontmatter, half inline (#tag-N)
//  - an attachment (attach-N.png, empty) embedded by every 100th note
//  - about 2% of notes link to one of 50 notes that do not exist (ghost-N)
import { mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [notesArg, outArg, seedArg] = process.argv.slice(2);
const notes = Number(notesArg);
if (!Number.isInteger(notes) || notes < 2 || !outArg) {
	console.error('Usage: node bench/generate-vault.mjs <notes> <outDir> [seed]');
	process.exit(1);
}
const makeRng = (start) => {
	let state = start >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};
const rnd = makeRng(Number(seedArg ?? 1));
const extra = makeRng((Number(seedArg ?? 1) ^ 0x9e3779b9) >>> 0);

const out = resolve(outArg);
rmSync(out, { recursive: true, force: true });
const nameOf = (i) => `note-${i}`;
const folderOf = (i) => `folder-${Math.floor(i / 1000)}`;

const orphan = new Uint8Array(notes);
for (let i = 0; i < notes; i++) orphan[i] = rnd() < 0.05 ? 1 : 0;

// Preferential attachment: `pool` holds one entry per link end, so busy notes get picked more.
const pool = [];
const links = Array.from({ length: notes }, () => new Set());
for (let i = 0; i < notes; i++) {
	if (orphan[i]) continue;
	const count = Math.min(12, Math.floor(-Math.log(1 - rnd()) * 2) + 1);
	for (let k = 0; k < count && pool.length > 0; k++) {
		const target = rnd() < 0.7 ? pool[Math.floor(rnd() * pool.length)] : Math.floor(rnd() * notes);
		if (target !== i && !orphan[target]) {
			links[i].add(target);
			pool.push(target);
		}
	}
	pool.push(i);
}

let edges = 0;
let embeds = 0;
let unresolved = 0;
const ghosts = new Set();
let tagged = 0;
const folders = new Set();
for (let i = 0; i < notes; i++) {
	const folder = folderOf(i);
	if (!folders.has(folder)) {
		mkdirSync(join(out, folder), { recursive: true });
		folders.add(folder);
	}
	const lines = [];
	const tags = [];
	if (extra() < 0.6) {
		const count = 1 + Math.floor(extra() * 3);
		for (let k = 0; k < count; k++) {
			const tag = `tag-${Math.floor(Math.pow(extra(), 2) * 12)}`;
			if (!tags.includes(tag)) tags.push(tag);
		}
	}
	const inline = extra() < 0.5;
	if (tags.length > 0 && !inline) lines.push('---', `tags: [${tags.join(', ')}]`, '---');
	lines.push(`# ${nameOf(i)}`, '');
	if (tags.length > 0 && inline) lines.push(tags.map((t) => `#${t}`).join(' '), '');
	if (tags.length > 0) tagged++;
	for (const t of links[i]) lines.push(`- [[${nameOf(t)}]]`);
	edges += links[i].size;
	if (i % 100 === 0) {
		const file = `attach-${i / 100}.png`;
		writeFileSync(join(out, folder, file), '');
		lines.push(`![[${file}]]`);
		embeds++;
	}
	if (extra() < 0.02) {
		const ghost = `ghost-${Math.floor(extra() * 50)}`;
		lines.push(`- [[${ghost}]]`);
		ghosts.add(ghost);
		unresolved++;
	}
	lines.push('');
	writeFileSync(join(out, folder, `${nameOf(i)}.md`), lines.join('\n'));
}
mkdirSync(join(out, '.obsidian', 'plugins'), { recursive: true });
writeFileSync(join(out, '.obsidian', 'community-plugins.json'), '["fast-graph"]\n');
const pluginDir = resolve(import.meta.dirname, '..', 'plugin');
if (!existsSync(join(out, '.obsidian', 'plugins', 'fast-graph'))) {
	symlinkSync(pluginDir, join(out, '.obsidian', 'plugins', 'fast-graph'));
}
const orphans = orphan.reduce((a, b) => a + b, 0);
const attachments = embeds;
const totalNodes = notes + attachments + ghosts.size;
const totalEdges = edges + embeds + unresolved;
console.log(`Generated ${notes} notes, ${edges} note links, ${orphans} orphans (seed ${seedArg ?? 1}) in ${out}`);
console.log(`  plus ${attachments} attachments (${embeds} embeds), ${ghosts.size} unresolved targets (${unresolved} links), ${tagged} tagged notes`);
console.log(`  expected in the plugin: ${totalNodes} nodes, ${totalEdges} links (${totalNodes - ghosts.size} nodes and ${totalEdges - unresolved} links with "Existing files only")`);
