// Gentle drift through the real settings page. Usage: node obs-drift.mjs <screenshot dir>
import { writeFileSync } from 'node:fs';
import { connect, decodePng } from './cdp-lib.mjs';
const shotDir = process.argv[2];
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const settled = async (dim) => { for (let i = 0; i < 600; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
let step = 0; const log = (m) => console.error(`[${++step}] ${m}`);
const evAwait = async (expr) => { const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), new Promise((res) => setTimeout(() => res({ timeout: true }), 40000))]); if (r.timeout) return 'TIMEOUT'; return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.result; };
out.settled = await settled(2); await sleep(1500); log('2d settled');
const layoutHash = () => ev(`(() => { const p = ${V}.positions; let h = 0; for (let i = 0; i < p.length; i += 1) h = (h * 31 + Math.round(p[i] * 100)) | 0; return h; })()`);
out.layoutHashBefore = await layoutHash();
// how far on screen do 300 nodes move over 6 seconds? sampled every 100 ms from the renderer's own screen positions
const sample = (ms) => `new Promise((resolve) => { const v = ${V}; const r = v.renderer; const ids = []; for (let i = 0; i < v.capacity && ids.length < 300; i++) if (v.visible[i]) ids.push(i); const base = ids.map((i) => [r.screen[2*i], r.screen[2*i+1]]); let maxD = 0, sumD = 0, n = 0, maxStep = 0; let prev = base.map((b) => b.slice()); const t0 = performance.now(); const step = () => { r.requestDraw(); setTimeout(() => { ids.forEach((i, k) => { const x = r.screen[2*i], y = r.screen[2*i+1]; const d = Math.hypot(x - base[k][0], y - base[k][1]); maxD = Math.max(maxD, d); sumD += d; n++; maxStep = Math.max(maxStep, Math.hypot(x - prev[k][0], y - prev[k][1])); prev[k] = [x, y]; }); if (performance.now() - t0 < ${ms}) step(); else resolve({ maxDisplacementPx: +maxD.toFixed(2), meanDisplacementPx: +(sumD / n).toFixed(2), maxStepPx: +maxStep.toFixed(2) }); }, 100); }; step(); })`;
out.screenWanderOff = await evAwait(sample(2000)); log('wander off ' + JSON.stringify(out.screenWanderOff));
// turn it on through the real settings page
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const rowFor = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
const visible = (name) => st.ev(`(() => { const r = ${rowFor(name)}; if (!r) return false; const b = r.getBoundingClientRect(); return r.offsetParent !== null && b.height > 0 && getComputedStyle(r).display !== 'none'; })()`);
const toggle = (name, on) => st.ev(`(() => { const c = ${rowFor(name)}.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled') !== ${on}) c.click(); return 'ok'; })()`);
const slide = (name, v) => st.ev(`(() => { const sl = ${rowFor(name)}.querySelector('input[type=range]'); sl.value = ${v}; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
out.rowsOrder = await st.ev(`[...document.querySelectorAll('.vertical-tab-content .setting-item-name')].map((e) => e.textContent.trim()).slice(0, 8)`);
out.slidersHiddenWhenOff = !(await visible('Drift amount')) && !(await visible('Drift speed'));
await toggle('Gentle drift (alive graph)', true); await sleep(1200);
out.slidersShownWhenOn = (await visible('Drift amount')) && (await visible('Drift speed'));
out.saved = await ev(`JSON.stringify(app.plugins.plugins['speed-graph'].graphSettings.drift)`);
log('toggled on'); out.screenWander40 = await evAwait(sample(6000)); log('wander 40 ' + JSON.stringify(out.screenWander40));
out.layoutHashAfter = await layoutHash();
out.layoutUntouched = out.layoutHashBefore === out.layoutHashAfter;
await slide('Drift amount', 1); await sleep(600); out.screenWander100 = await evAwait(sample(4000));
await slide('Drift amount', 0.4);
// hovering a note holds it still
log('hover start'); out.hover = await evAwait(`new Promise((resolve) => { const v = ${V}; const r = v.renderer; let id = -1; for (let i = 0; i < v.capacity; i++) if (v.visible[i]) { id = i; break; } const xs = []; const rec = () => xs.push([r.screen[2*id], r.screen[2*id+1]]); const spread = (a) => { const mx = a.reduce((s, p) => s + p[0], 0) / a.length, my = a.reduce((s, p) => s + p[1], 0) / a.length; return Math.max(...a.map((p) => Math.hypot(p[0] - mx, p[1] - my))); }; const run = (n, done) => { let k = 0; const f = () => { r.requestDraw(); setTimeout(() => { rec(); if (++k < n) f(); else done(); }, 100); }; f(); }; run(40, () => { const free = spread(xs.splice(0)); r.setHighlight(id); setTimeout(() => { run(20, () => { r.setHighlight(-1); resolve({ spreadWhileFreePx: +free.toFixed(2), spreadWhileHoveredPx: +spread(xs.splice(0)).toFixed(2) }); }); }, 500); }); })`);
// zoomed-in picture for a look, then off again
await slide('Drift speed', 1); await sleep(300);
await st.ev(`0`);
await send('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(`${shotDir}/drift-2d.png`, Buffer.from(r.result.data, 'base64')));
await toggle('Gentle drift (alive graph)', false); await sleep(1200);
out.screenWanderOffAgain = await evAwait(sample(2000));
// 3D: compare two screenshots 600 ms apart with drift on and off
await toggle('3D view (experimental)', true); out.settled3d = await settled(3); await sleep(1500);
const shotDiff = async () => { const clip = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.25, y: r.top + r.height * 0.25, width: r.width * 0.5, height: r.height * 0.5 }; })()`); const grab = async () => decodePng(Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })).result.data, 'base64')); const a = await grab(); await sleep(600); const b = await grab(); let n = 0; for (let i = 0; i < a.width * a.height; i++) { const o = i * a.channels; if (Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]) > 24) n++; } return n; };
out.pixelsChanged3dOff = await shotDiff();
await toggle('Gentle drift (alive graph)', true); await sleep(1200);
out.pixelsChanged3dOn = await shotDiff();
await send('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(`${shotDir}/drift-3d.png`, Buffer.from(r.result.data, 'base64')));
out.glError = await ev(`${V}.renderer3d.gl.getError()`);
out.layoutHash3dUntouched = await ev(`(() => { const p = ${V}.positions; return p.length > 0 && p.every((x) => Number.isFinite(x)); })()`);
await toggle('Moving electrons on links', true); await sleep(1000);
out.glErrorWithElectrons = await ev(`${V}.renderer3d.gl.getError()`);
out.view3dStillOn = await ev(`${V}.dim`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
