// Layout cache check in a real Obsidian (isolated instance, scratch vault copy).
// Usage: node obs-cache.mjs <scratch vault dir> <expected link count> <screenshot dir>
import { existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const [vaultDir, expectedEdges, shotDir] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const cacheFile = join(vaultDir, '.obsidian/plugins/speed-graph/layout-cache.bin');
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('app://'));
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
for (let i = 0; i < 900; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === expectedEdges) break; await sleep(1000); }
await sleep(5000);
// Open the view, time until settled and visible; returns details.
const openAndTime = async () => {
  const t0 = Date.now(); await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
  let settledAt = null, firstKnownAt = null;
  for (let i = 0; i < 4000 && settledAt === null; i++) {
    await sleep(25);
    const s = await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; if (!l) return null; const v = l.view; return { settled: v.settled, known: v.known.some((x) => x), hasFrame: v.sub !== null }; })()`);
    if (s && s.known && firstKnownAt === null) firstKnownAt = Date.now() - t0;
    if (s && s.settled && s.hasFrame) settledAt = Date.now() - t0;
  }
  const info = await ev(`(() => { const v = ${V}; let sum = 0, n = 0; for (let i = 0; i < v.visible.length; i++) if (v.visible[i]) { sum += v.positions[2*i] * 31 + v.positions[2*i+1] * 17; n++; } return { cache: v.cacheInfo, visible: n, positionChecksum: +sum.toFixed(3), status: document.querySelector('.speed-graph-status').textContent }; })()`);
  return { settledMs: settledAt, positionsAvailableMs: firstKnownAt, ...info };
};
const closeView = async () => { await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500); };
const fileInfo = () => existsSync(cacheFile) ? { bytes: statSync(cacheFile).size } : null;
// 0. Obsidian may restore a saved graph tab at startup, which would write a cache before we start:
//    close any such view and delete the cache so the first open below is a true cold start.
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(1000);
if (existsSync(cacheFile)) unlinkSync(cacheFile);
// 1. first open: no cache file yet
out.cacheBeforeFirstOpen = fileInfo();
out.firstOpen = await openAndTime();
await sleep(4000); // save delay is 1.5 s
out.cacheAfterSettle = fileInfo();
out.expectedBytes = 32 + out.firstOpen.visible * 0 + 16 * (await ev(`${V}.known.reduce((a, b) => a + b, 0)`));
// 2. close and reopen: should restore exactly
await closeView(); out.reopen = await openAndTime();
out.reopenIdentical = out.reopen.positionChecksum === out.firstOpen.positionChecksum;
// 3. change a layout setting (link distance) and reopen: warm start, not restore
await ev(`(() => { const s = app.plugins.plugins['speed-graph'].graphSettings; s.linkDistance = 60; })()`);
await closeView(); out.reopenAfterSettingChange = await openAndTime(); await sleep(4000);
// 4. corrupt cache: garbage bytes -> ignored, normal layout, no crash
writeFileSync(cacheFile, Buffer.from('this is not a cache file at all, just garbage bytes ......'));
await closeView(); out.reopenWithCorruptCache = await openAndTime();
out.corruptCacheOverwrittenWithValid = fileInfo();
await sleep(4000);
out.afterCorruptRecovery = fileInfo();
// 5. clear command removes the file
await ev(`app.commands.executeCommandById('speed-graph:clear-layout-cache')`); await sleep(1500);
out.afterClearCommand = fileInfo();
const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(shotDir, 'cache-final.png'), Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify(out, null, 1));
ws.close();
