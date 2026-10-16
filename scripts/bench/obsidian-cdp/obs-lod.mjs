// Zoomed-out clustering check in a real Obsidian (isolated instance, scratch vault copy).
// Usage: node obs-lod.mjs <expected link count> <screenshot dir>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const [expectedEdges, shotDir] = [Number(process.argv[2]), process.argv[3]];
const { send, ev, sleep, close } = await connect();
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${n}.png`, Buffer.from(r.result.data, 'base64')); };
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
for (let i = 0; i < 900; i++) { if ((await ev(`app.plugins.plugins['fast-graph'].vaultGraph.model.edges`)) === expectedEdges) break; await sleep(1000); }
await ev(`app.workspace.getLeavesOfType('fast-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('fast-graph:open-graph')`);
for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return !!l && l.view.settled && l.view.sub !== null; })()`)) break; }
await sleep(1500);
const draw = (n = 20) => ev(`(() => { const r = ${V}.renderer; const t = []; for (let i = 0; i < ${n}; i++) { r.draw(); t.push(r.lastDrawMs); } t.sort((a, b) => a - b); return { medianMs: +t[Math.floor(${n} / 2)].toFixed(2), maxMs: +t[${n} - 1].toFixed(2), bubbles: r.bubbleCount }; })()`);
const setClusters = (on) => ev(`(() => { const c = [...document.querySelectorAll('.fast-graph-controls .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent === 'Cluster when zoomed out').querySelector('.checkbox-container'); if (c.classList.contains('is-enabled') !== ${on}) c.click(); })()`);
await ev(`document.querySelector('.fast-graph-controls-toggle').click()`); await sleep(300);
await ev(`document.querySelector('.fast-graph-controls-toggle').click()`); await sleep(300); // panel opened and closed: controls exist
await ev(`${V}.fit(true)`); await sleep(800);
out.fitView = { k: await ev(`+${V}.transform.k.toFixed(3)`), withClusters: await draw(), status: await ev(`document.querySelector('.fast-graph-status').textContent`) };
await shot('lod-1-fit-clusters');
await setClusters(false); await sleep(500); out.fitView.withoutClusters = await draw(); await shot('lod-2-fit-no-clusters');
await setClusters(true); await sleep(500);
// zoom in step by step and watch the bubbles dissolve
const steps = [];
for (const factor of [1, 2, 3, 5, 8]) {
  await ev(`${V}.fit(true)`); await sleep(300);
  await ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); v.autoFit = false; v.setTransform(zoomAtShim(v.transform, v.width / 2, v.height / 2, ${factor})); function zoomAtShim(t, sx, sy, f) { const k = t.k * f; const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k; return { k, x: sx - wx * k, y: sy - wy * k }; } })()`); await sleep(500);
  steps.push({ zoomFactorFromFit: factor, k: await ev(`+${V}.transform.k.toFixed(3)`), ...(await draw(10)) });
  if (factor === 3) await shot('lod-3-zoom-x3');
}
out.zoomSteps = steps;
// hover and click a bubble at fit
await ev(`${V}.fit(true)`); await sleep(800);
const b = await ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); const cl = v.renderer.clusterState; if (!cl || cl.clusters === 0) return null; let best = 0; for (let c = 1; c < cl.clusters; c++) if (cl.count[c] > cl.count[best]) best = c; return { x: r.left + cl.cx[best], y: r.top + cl.cy[best], count: cl.count[best], k: v.transform.k }; })()`);
if (b) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'none', buttons: 0 }); await sleep(400);
  out.bubbleHover = { bubbleCount: b.count, card: await ev(`document.querySelector('.fast-graph-hover').textContent`), hidden: await ev(`document.querySelector('.fast-graph-hover').classList.contains('is-hidden')` ) };
  await shot('lod-4-bubble-hover');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', buttons: 1, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(600);
  out.bubbleClick = { kBefore: +b.k.toFixed(3), kAfter: await ev(`+${V}.transform.k.toFixed(3)`) };
} else out.bubbleHover = 'no bubbles at fit';
// at high zoom, individual nodes are pickable again
await ev(`${V}.fit(true)`); await sleep(500);
out.pickableAtFit = await ev(`(() => { const v = ${V}; const p = v.renderer.getPickable(); let n = 0, vis = 0; for (let i = 0; i < p.length; i++) { n += p[i]; vis += v.visible[i]; } return { pickable: n, visible: vis }; })()`);
console.log(JSON.stringify(out, null, 1));
close();
