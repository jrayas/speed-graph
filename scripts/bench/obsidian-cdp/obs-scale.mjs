// Scale check in a real Obsidian (isolated instance, scratch vault copy).
// Usage: node obs-scale.mjs <expected file count> <expected link count> <screenshot out.png>
import { writeFileSync } from 'node:fs';
const [expected, expectedEdges, shotPath] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('app://'));
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const out = { expected };
// 1. enable plugins in this throwaway instance and dismiss the trust dialog with Escape
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
// 2. wait until the plugin's model has converged on the expected link count (Obsidian's cold index is still running before that)
const t0 = Date.now(); const trail = [];
for (let i = 0; i < 900; i++) { const e = await ev(`app.plugins.plugins['fast-graph'].vaultGraph.model.edges`); if (i % 15 === 0) trail.push(e); if (e === expectedEdges) break; await sleep(1000); }
out.secondsUntilModelMatchesGenerator = Math.round((Date.now() - t0) / 1000);
out.edgeCountTrail = trail;
out.files = await ev(`app.vault.getFiles().length`);
out.graphStats = await ev(`(async () => { const p = app.plugins.plugins['fast-graph']; const m = p.vaultGraph.model; return { nodes: m.nodeCount, edges: m.edges, matchesGenerator: m.edges === ${expectedEdges}, fullBuildMs: +p.vaultGraph.lastBuildMs.toFixed(1) }; })()`);
await sleep(5000);
// 3. main-thread stall monitor, then open the graph
await ev(`(() => { clearInterval(window.__iv); window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); window.__gaps = []; let prev = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__gaps.push(n - prev); prev = n; }, 20); return 0; })()`);
await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 250 }); await send('Profiler.start');
const tOpen = Date.now();
await ev(`app.commands.executeCommandById('fast-graph:open-graph')`);
let settled = false, firstFrame = null;
for (let i = 0; i < 600 && !settled; i++) {
  await sleep(250);
  const s = await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return l ? { settled: l.view.settled, frames: l.view.known.some((x) => x) ? 1 : 0 } : null; })()`);
  if (s && s.frames > 0 && firstFrame === null) firstFrame = Date.now() - tOpen;
  settled = !!(s && s.settled);
}
const prof = (await send('Profiler.stop')).result.profile;
const self = new Map(); const byId = new Map(prof.nodes.map((n) => [n.id, n]));
for (let i = 0; i < prof.samples.length; i++) { const n = byId.get(prof.samples[i]); const f = n.callFrame; const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(key, (self.get(key) ?? 0) + (prof.timeDeltas[i] ?? 0) / 1000); }
out.profileTopSelfMs = [...self].filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(program)')).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v.toFixed(0)} ms  ${k}`);
out.firstFrameMs = firstFrame; await sleep(3000); out.stillSettledAfter3s = await ev(`${V}.settled`); out.settledSeconds = +((Date.now() - tOpen) / 1000).toFixed(1);
const stalls = await ev(`({ longTasks: window.__long, maxGapMs: Math.round(Math.max(...window.__gaps)), gapsOver100ms: window.__gaps.filter(g => g > 100).length, samples: window.__gaps.length })`);
out.mainThreadWhileLayoutRan = stalls;
// 4. steady state: status line and draw cost
out.status = await ev(`document.querySelector('.fast-graph-status').textContent`);
await sleep(600);
out.drawMs = await ev(`(() => { const r = ${V}.renderer; const t = []; for (let i = 0; i < 20; i++) { r.draw(); t.push(r.lastDrawMs); } t.sort((a, b) => a - b); return { median: +t[10].toFixed(2), max: +t[19].toFixed(2) }; })()`);
// 5. controlled slider test: link distance 30 -> 150 (spread should grow), measured when settled
const spread = () => ev(`(() => { const v = ${V}; let s = 0, n = 0; for (let i = 0; i < v.visible.length; i++) if (v.visible[i]) { s += Math.hypot(v.positions[2*i], v.positions[2*i+1]); n++; } return +(s / n).toFixed(1); })()`);
const waitSettled = async () => { await sleep(1500); for (let i = 0; i < 480 && !(await ev(`${V}.settled`)); i++) await sleep(250); };
const setSlider = (label, value) => ev(`(() => { const sl = [...document.querySelectorAll('.fast-graph-controls .setting-item')].find((e) => e.textContent.includes('${label}')).querySelector('input[type=range]'); sl.value = ${value}; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const base = await spread();
await setSlider('Link distance', 150); await waitSettled(); const longLinks = await spread();
await setSlider('Link distance', 30); await setSlider('Repel force', 0); await waitSettled(); const noRepel = await spread();
out.sliders = { meanRadiusDefault: base, linkDistance150: longLinks, repelForce0: noRepel };
await setSlider('Repel force', 10); await waitSettled();
const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify(out, null, 1));
ws.close();
