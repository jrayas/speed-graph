// Honest comparison of the built-in graph view and ours, measured the same way, in one real Obsidian
// session (isolated instance, scratch vault copy). Built-in first (plugins off), then ours.
// Usage: node obs-compare.mjs <vault file count> <expected link count of our model> <screenshot dir> [builtin|ours|both]
import { writeFileSync } from 'node:fs';
import { connect, decodePng, lumaGrid } from './cdp-lib.mjs';
const [fileCount, expectedEdges, shotDir, which = 'both'] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], process.argv[5]];
const { send, ev, sleep, close } = await connect();
const mb = (b) => +(b / 1048576).toFixed(1);
const metric = async (name) => (await send('Performance.getMetrics')).result.metrics.find((m) => m.name === name)?.value ?? 0;
const gc = async () => { await send('HeapProfiler.collectGarbage'); await sleep(300); };
await send('Performance.enable'); await send('HeapProfiler.enable'); await send('Page.enable');

async function waitForIndex() {
  let last = -1, stableFor = 0;
  for (let i = 0; i < 1500; i++) {
    const n = await ev(`(() => { const r = app.metadataCache.resolvedLinks; let t = 0; for (const k in r) for (const _ in r[k]) t++; return Object.keys(r).length * 1e6 + t; })()`);
    stableFor = n === last ? stableFor + 1 : 0; last = n;
    if (stableFor >= 15 && Math.floor(n / 1e6) >= fileCount * 0.99) return Math.round(i);
    await sleep(1000);
  }
  return -1;
}
async function measure(label, openExpr, closeExpr, paneSelector, readyExpr) {
  await gc();
  const heap0 = await metric('JSHeapUsedSize');
  // pane rectangle in CSS px for screenshots
  await ev(`window.__long = []; window.__gaps = []; window.__raf = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
    (() => { let prev = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__gaps.push(n - prev); prev = n; }, 20); })(); 0`);
  const shotRegion = async () => { const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(paneSelector)}) || document.body; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`); return { ...r, scale: 0.3 }; };
  const grab = async (clip) => { const r = await send('Page.captureScreenshot', { format: 'png', clip }); return lumaGrid(decodePng(Buffer.from(r.result.data, 'base64'))); };
  const baseClip = await shotRegion(); const before = await grab(baseClip);
  const task0 = await metric('TaskDuration'), script0 = await metric('ScriptDuration');
  const t0 = Date.now(); await ev(openExpr);
  let prev = before, firstVisible = null, stable = null, calm = 0; const timeline = [];
  for (let i = 0; i < 400 && stable === null; i++) {
    const clip = await shotRegion(); const g = await grab(clip); const t = Date.now() - t0;
    let ink = 0; for (let k = 0; k < g.length; k++) if (Math.abs(g[k] - before[k]) > 6) ink++; ink /= g.length;
    let diff = 0; for (let k = 0; k < g.length; k++) diff += Math.abs(g[k] - prev[k]); diff /= g.length;
    timeline.push([t, +ink.toFixed(3), +diff.toFixed(2)]);
    if (firstVisible === null && ink > 0.03) firstVisible = t;
    if (firstVisible !== null) { calm = diff < 0.25 ? calm + 1 : 0; if (calm >= 4) stable = t; }
    prev = g;
  }
  const task1 = await metric('TaskDuration'), script1 = await metric('ScriptDuration');
  const open = { firstVisibleMs: firstVisible, stableMs: stable, mainThreadBusyMs: Math.round((task1 - task0) * 1000), scriptMs: Math.round((script1 - script0) * 1000) };
  const stalls = await ev(`({ longTasks: window.__long.length, longTaskMaxMs: Math.max(0, ...window.__long), longTaskTotalMs: window.__long.reduce((a, b) => a + b, 0), maxTimerGapMs: Math.round(Math.max(...window.__gaps)), samples: window.__gaps.length })`);
  const ready = readyExpr ? await ev(readyExpr) : null;
  const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/compare-${label}.png`, Buffer.from(shot.result.data, 'base64'));
  await gc(); const heap1 = await metric('JSHeapUsedSize');
  // interaction: wheel zoom in/out and drag-pan at the pane centre, with a frame logger
  const c = await shotRegion(); const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  await ev(`window.__raf = []; window.__stop = false; (() => { let prev = performance.now(); const f = (n) => { window.__raf.push(n - prev); prev = n; if (!window.__stop) requestAnimationFrame(f); }; requestAnimationFrame(f); })(); window.__long.length = 0; 0`);
  const task2 = await metric('TaskDuration'); const ti = Date.now();
  for (let i = 0; i < 30; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -120 }); await sleep(40); }
  for (let i = 0; i < 30; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 120 }); await sleep(40); }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx - 200, y: cy - 150, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 30; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx - 200 + i * 10, y: cy - 150 + i * 6, button: 'left', buttons: 1 }); await sleep(25); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 100, y: cy + 30, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(500);
  const task3 = await metric('TaskDuration');
  const frames = await ev(`(() => { window.__stop = true; const f = [...window.__raf].sort((a, b) => a - b); const q = (p) => +f[Math.floor((f.length - 1) * p)].toFixed(1); return { frames: f.length, medianMs: q(0.5), p95Ms: q(0.95), maxMs: q(1), longTasks: window.__long.length, longTaskMaxMs: Math.max(0, ...window.__long) }; })()`);
  await ev(`clearInterval(window.__iv); 0`);
  await ev(closeExpr); await sleep(800);
  return { label, open, stallsWhileOpening: stalls, ready, interaction: { ...frames, mainThreadBusyMs: Math.round((task3 - task2) * 1000), seconds: +((Date.now() - ti) / 1000).toFixed(1) }, heapMBBefore: mb(heap0), heapMBAfterOpen: mb(heap1), heapDeltaMB: mb(heap1 - heap0), timelineSample: timeline.filter((_, i) => i % 6 === 0).slice(0, 14) };
}
const out = { fileCount };
out.indexWaitSeconds = await waitForIndex();
await sleep(3000);
const pane = '.workspace-leaf.mod-active .view-content';
if (which !== 'ours') {
  // Fair baseline: our plugin off. The core Graph view may be switched off in a vault, so enable it in this
  // throwaway instance (uses Obsidian's undocumented internal plugin object; test script only) and check the command exists.
  await ev(`app.plugins.setEnable(false)`); await sleep(1500);
  await ev(`(async () => { const p = app.internalPlugins.plugins.graph; if (!p.enabled) await p.enable(true); })()`); await sleep(1500);
  out.builtinCommandExists = await ev(`!!app.commands.commands['graph:open']`);
  out.communityPluginsOff = await ev(`!app.plugins.isEnabled()`);
  if (!out.builtinCommandExists) throw new Error('graph:open does not exist; the built-in graph is not available');
  out.builtin = await measure('builtin', `app.commands.executeCommandById('graph:open')`, `app.workspace.getLeavesOfType('graph').forEach((l) => l.detach())`, pane, `({ graphLeaves: app.workspace.getLeavesOfType('graph').length })`);
}
if (which !== 'builtin') {
  await ev(`app.plugins.setEnable(true)`); await sleep(2000);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  for (let i = 0; i < 900; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === expectedEdges) break; await sleep(1000); }
  await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
  await ev(`app.commands.executeCommandById('speed-graph:clear-layout-cache')`); await sleep(1000); // cold start: no saved layout
  out.ours = await measure('ours-cold', `app.commands.executeCommandById('speed-graph:open-graph')`, `app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`, pane,
    `(() => { const v = app.workspace.getLeavesOfType('speed-graph-view')[0]?.view; return v ? { settled: v.settled, cache: v.cacheInfo, bubbles: v.renderer.bubbleCount } : null; })()`);
  await sleep(3000);
  out.oursWithCache = await measure('ours-cached', `app.commands.executeCommandById('speed-graph:open-graph')`, `app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`, pane,
    `(() => { const v = app.workspace.getLeavesOfType('speed-graph-view')[0]?.view; return v ? { settled: v.settled, cache: v.cacheInfo, bubbles: v.renderer.bubbleCount } : null; })()`);
}
console.log(JSON.stringify(out, null, 1));
close();
