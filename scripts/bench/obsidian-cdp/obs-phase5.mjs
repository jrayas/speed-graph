// Phase 5 check in a real Obsidian (isolated instance on a scratch copy of gen-1k).
// Compares what the view shows with an independent parse of the vault files on disk.
// Usage: node obs-phase5.mjs <scratch vault dir> <screenshot dir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [vaultDir, shotDir] = process.argv.slice(2);
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('app://'));
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;

// ---- independent parse of the vault on disk ----
const notes = new Map(); // path -> { tags:Set, links:Set<string> } ; targets are paths or "?name"
const attachments = new Set(); const byBase = new Map();
const walk = (dir, rel = '') => { for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(dir, p); else if (e.name.endsWith('.md')) { notes.set(p, null); byBase.set(e.name.slice(0, -3), p); } else { attachments.add(p); byBase.set(e.name, p); } } };
walk(vaultDir);
for (const p of notes.keys()) {
  const text = readFileSync(join(vaultDir, p), 'utf8'); const tags = new Set();
  const fm = text.match(/^---\ntags: \[(.*)\]\n---/); if (fm) for (const t of fm[1].split(', ')) tags.add('#' + t);
  for (const m of text.matchAll(/^((?:#tag-\d+ ?)+)$/gm)) for (const t of m[1].trim().split(' ')) tags.add(t);
  const links = new Set(); for (const m of text.matchAll(/!?\[\[([^\]]+)\]\]/g)) { const target = byBase.get(m[1]) ?? '?' + m[1]; if (target !== p) links.add(target); }
  notes.set(p, { tags, links });
}
const ghosts = new Set(); for (const { links } of notes.values()) for (const t of links) if (t.startsWith('?')) ghosts.add(t);
const allNodes = [...notes.keys(), ...attachments, ...ghosts];
const edges = []; for (const [p, { links }] of notes) for (const t of links) edges.push([p, t]);
const expected = ({ search = null, attachments: showAtt = false, orphans = true, hideUnresolved = false, local = null }) => {
  let vis = new Set(allNodes.filter((n) => (showAtt || !attachments.has(n)) && (!hideUnresolved || !n.startsWith('?'))));
  if (search) vis = new Set([...vis].filter((n) => notes.get(n)?.tags.has(search)));
  if (!orphans) { const linked = new Set(); for (const [a, b] of edges) if (vis.has(a) && vis.has(b)) { linked.add(a); linked.add(b); } vis = linked; }
  if (local) { const adj = new Map(); for (const [a, b] of edges) { if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); }
    const seen = new Set(vis.has(local.centre) ? [local.centre] : []); let frontier = [...seen];
    for (let d = 0; d < local.depth; d++) { const next = []; for (const n of frontier) for (const o of adj.get(n) ?? []) if (vis.has(o) && !seen.has(o)) { seen.add(o); next.push(o); } frontier = next; }
    vis = seen; }
  return vis;
};
// ---- helpers inside Obsidian ----
const visiblePaths = () => ev(`(() => { const v = ${V}; const m = v.model; const out = []; for (let i = 0; i < v.visible.length; i++) if (v.visible[i]) { const p = m.ids.pathOf(i); out.push(p.startsWith('\\u0000') ? '?' + p.slice(1) : p); } return out; })()`);
const settle = async () => { await sleep(900); for (let i = 0; i < 120 && !(await ev(`${V}.settled`)); i++) await sleep(250); };
const item = (name) => `[...document.querySelectorAll('.speed-graph-controls .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent === ${JSON.stringify(name)})`;
const setToggle = (name, on) => ev(`(() => { const c = ${item(name)}.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled') !== ${on}) c.click(); })()`);
const setText = (name, value) => ev(`(() => { const i = ${item(name)}.querySelector('input[type=text]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const setSlider = (name, value) => ev(`(() => { const s = ${item(name)}.querySelector('input[type=range]'); s.value = ${value}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const compare = async (label, config) => {
  await sleep(700);
  const got = new Set(await visiblePaths()); const want = expected(config);
  const missing = [...want].filter((n) => !got.has(n)); const extra = [...got].filter((n) => !want.has(n));
  return { label, shown: got.size, expected: want.size, match: missing.length === 0 && extra.length === 0, missing: missing.slice(0, 3), extra: extra.slice(0, 3) };
};
const results = [];
// ---- start ----
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
const wantEdges = edges.length;
for (let i = 0; i < 300; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === wantEdges) break; await sleep(1000); }
results.push({ label: 'model vs files', model: await ev(`(() => { const m = app.plugins.plugins['speed-graph'].vaultGraph.model; return { nodes: m.nodeCount, edges: m.edges }; })()`), files: { nodes: allNodes.length, edges: wantEdges } });
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`); await sleep(3000);
await ev(`document.querySelector('.speed-graph-controls-toggle').click()`); await settle();
results.push(await compare('defaults (attachments hidden, unresolved shown)', {}));
await shot('p5-1-defaults');
await setToggle('Attachments', true); results.push(await compare('attachments on', { attachments: true }));
await setToggle('Existing files only', true); results.push(await compare('attachments on + existing files only', { attachments: true, hideUnresolved: true }));
await setToggle('Attachments', false); await setToggle('Existing files only', false);
await setToggle('Orphans', false); results.push(await compare('orphans off', { orphans: false }));
await shot('p5-2-orphans-off');
await setToggle('Orphans', true);
await setText('Search', 'tag:#tag-0'); results.push(await compare('search tag:#tag-0', { search: '#tag-0' }));
await shot('p5-3-search');
// groups: colour the tag-1 notes (search cleared first)
await setText('Search', '');
await ev(`[...document.querySelectorAll('.speed-graph-controls button')].find((b) => b.textContent === 'New group').click()`); await sleep(300);
await ev(`(() => { const i = document.querySelector('.speed-graph-groups input[type=text]'); i.value = 'tag:#tag-1'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await settle();
const grp = await ev(`(() => { const r = ${V}.renderer; return { counts: r.groupCounts, colours: r.groupColours }; })()`);
const wantTag1 = [...notes].filter(([, n]) => n.tags.has('#tag-1')).length;
results.push({ label: 'colour group tag:#tag-1', inGroup: grp.counts[1], expected: wantTag1, match: grp.counts[1] === wantTag1, colours: grp.colours });
await shot('p5-4-group');
// local graph around note-100
await ev(`app.workspace.getLeaf('tab').openFile(app.vault.getFileByPath('folder-0/note-100.md'))`); await sleep(1500);
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('speed-graph-view')[0], { focus: true })`); await sleep(500);
await setToggle('Show only the active note and its neighbours', true);
results.push(await compare('local graph depth 1 around note-100', { local: { centre: 'folder-0/note-100.md', depth: 1 } }));
await shot('p5-5-local-1');
await setSlider('Depth', 2); results.push(await compare('local graph depth 2', { local: { centre: 'folder-0/note-100.md', depth: 2 } }));
await shot('p5-6-local-2');
await setToggle('Show only the active note and its neighbours', false); await settle();
// hover card
const hub = await ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); const t = v.transform; let best = -1, bd = -1; for (let i = 0; i < v.visible.length; i++) { if (!v.visible[i]) continue; const x = v.positions[2*i]*t.k+t.x, y = v.positions[2*i+1]*t.k+t.y; if (x < 60 || y < 60 || x > r.width - 60 || y > r.height - 60) continue; if (v.degrees[i] > bd) { bd = v.degrees[i]; best = i; } } return { id: best, sx: r.left + v.positions[2*best]*t.k+t.x, sy: r.top + v.positions[2*best]*0 + v.positions[2*best+1]*t.k+t.y, path: v.model.ids.pathOf(best), deg: bd }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hub.sx, y: hub.sy, button: 'none', buttons: 0 }); await sleep(500);
results.push({ label: 'hover card', card: await ev(`(() => { const c = document.querySelector('.speed-graph-hover'); return { hidden: c.classList.contains('is-hidden'), text: c.textContent }; })()`), hoveredNode: hub.path, links: hub.deg });
await shot('p5-7-hover');
// gravity: ratio of the 99th to the 50th percentile radius of visible nodes
results.push({ label: 'gravity (no outer ring)', ratio: await ev(`(() => { const v = ${V}; const r = []; for (let i = 0; i < v.visible.length; i++) if (v.visible[i]) r.push(Math.hypot(v.positions[2*i], v.positions[2*i+1])); r.sort((a, b) => a - b); return { median: Math.round(r[Math.floor(r.length*0.5)]), p99: Math.round(r[Math.floor(r.length*0.99)]), p99OverMedian: +(r[Math.floor(r.length*0.99)] / r[Math.floor(r.length*0.5)]).toFixed(2) }; })()`) });
console.log(JSON.stringify(results, null, 1));
ws.close();
