// 3D at scale in a real Obsidian (isolated instance, scratch vault copy).
// Usage: node obs-3d-scale.mjs <expected link count> <screenshot dir> <label>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const [expectedEdges, shotDir, label] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const { send, ev, sleep, close } = await connect();
await send('Performance.enable'); await send('HeapProfiler.enable');
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const metric = async (n) => (await send('Performance.getMetrics')).result.metrics.find((m) => m.name === n)?.value ?? 0;
const gc = async () => { await send('HeapProfiler.collectGarbage'); await sleep(300); };
const mb = (b) => +(b / 1048576).toFixed(1);
const out = { label };
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
for (let i = 0; i < 1200; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === expectedEdges) break; await sleep(1000); }
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:clear-layout-cache')`); await sleep(1000);
// open straight into 3D
await ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.view3d = true; p.graphSettings.skin = 'default'; })()`);
const monitor = () => ev(`(() => { clearInterval(window.__iv); window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); window.__gaps = []; let prev = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__gaps.push(n - prev); prev = n; }, 20); return 0; })()`);
const stalls = () => ev(`({ longTasks: window.__long.length, longTaskMaxMs: Math.max(0, ...window.__long), maxTimerGapMs: Math.round(Math.max(...window.__gaps)), samples: window.__gaps.length })`);
const openAndTime = async (which) => {
  await gc(); const heap0 = await metric('JSHeapUsedSize');
  await monitor(); const task0 = await metric('TaskDuration'); const script0 = await metric('ScriptDuration');
  const t0 = Date.now(); await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
  let firstPositions = null, settled = null;
  for (let i = 0; i < 6000 && settled === null; i++) {
    await sleep(25);
    const s = await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; if (!l) return null; const v = l.view; return { dim: v.dim, known: v.known.some((x) => x), settled: v.settled && v.sub !== null }; })()`);
    if (s && s.dim === 3 && s.known && firstPositions === null) firstPositions = Date.now() - t0;
    if (s && s.dim === 3 && s.settled) settled = Date.now() - t0;
  }
  const task1 = await metric('TaskDuration'); const script1 = await metric('ScriptDuration');
  const st = await stalls(); await sleep(1500); await gc(); const heap1 = await metric('JSHeapUsedSize');
  const info = await ev(`(() => { const v = ${V}; return { cache: v.cacheInfo, nodes: v.sub ? v.sub.ids.length : 0, status: document.querySelector('.speed-graph-status').textContent }; })()`);
  return { which, firstPositionsMs: firstPositions, settledMs: settled, mainThreadBusyMs: Math.round((task1 - task0) * 1000), scriptMs: Math.round((script1 - script0) * 1000), stallsWhileOpening: st, heapAddedMB: mb(heap1 - heap0), ...info };
};
out.cold = await openAndTime('cold');
await sleep(3500); // cache save
// draw cost at fit, and orbit / zoom / slide smoothness
out.draw = await ev(`(() => { const r = ${V}.renderer3d; r.fit(); const t = []; for (let i = 0; i < 30; i++) { r.draw(); t.push(r.lastDrawMs); } t.sort((a, b) => a - b); return { medianMs: +t[15].toFixed(2), maxMs: +t[29].toFixed(2) }; })()`);
const rect = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
const cx = rect.l + rect.w / 2, cy = rect.t + rect.h / 2;
await ev(`window.__raf = []; window.__stop = false; (() => { let prev = performance.now(); const f = (n) => { window.__raf.push(n - prev); prev = n; if (!window.__stop) requestAnimationFrame(f); }; requestAnimationFrame(f); })(); window.__long.length = 0; 0`);
const task2 = await metric('TaskDuration'); const ti = Date.now();
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.l + 100, y: rect.t + 100, button: 'left', buttons: 1, clickCount: 1 });
for (let i = 1; i <= 60; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.l + 100 + i * 10, y: rect.t + 100 + i * 4, button: 'left', buttons: 1 }); await sleep(25); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.l + 700, y: rect.t + 340, button: 'left', buttons: 0, clickCount: 1 });
for (let i = 0; i < 25; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -120 }); await sleep(40); }
for (let i = 0; i < 25; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 120 }); await sleep(40); }
await sleep(400);
const task3 = await metric('TaskDuration');
out.interaction = { ...(await ev(`(() => { window.__stop = true; const f = [...window.__raf].sort((a, b) => a - b); const q = (p) => +f[Math.floor((f.length - 1) * p)].toFixed(1); return { frames: f.length, medianMs: q(0.5), p95Ms: q(0.95), maxMs: q(1), longTasks: window.__long.length, longTaskMaxMs: Math.max(0, ...window.__long) }; })()`)), mainThreadBusyMs: Math.round((task3 - task2) * 1000), seconds: +((Date.now() - ti) / 1000).toFixed(1) };
await ev(`${V}.renderer3d.fit(); 0`); await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/3d-scale-${label}.png`, Buffer.from(shot.result.data, 'base64'));
// reopen: exact restore from the 3D cache
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(1000);
out.cached = await openAndTime('cached');
console.log(JSON.stringify(out, null, 1));
close();
