// 3D view check in a real Obsidian (isolated instance, scratch vault copy).
// Usage: node obs-3d.mjs <expected link count> <screenshot dir> <scratch vault dir>
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from './cdp-lib.mjs';
const [expectedEdges, shotDir, vaultDir] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const { send, ev, sleep, close } = await connect();
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${n}.png`, Buffer.from(r.result.data, 'base64')); };
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
const waitSettled = async (dim, max = 600) => { for (let i = 0; i < max; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
for (let i = 0; i < 900; i++) { if ((await ev(`app.plugins.plugins['fast-graph'].vaultGraph.model.edges`)) === expectedEdges) break; await sleep(1000); }
await ev(`app.workspace.getLeavesOfType('fast-graph-view').forEach((l) => l.detach())`); await sleep(500);
out.defaults = await ev(`(() => { const s = app.plugins.plugins['fast-graph'].graphSettings; return { view3d: s.view3d, autoRotate: s.autoRotate }; })()`);
await ev(`app.commands.executeCommandById('fast-graph:open-graph')`);
out.settled2d = await waitSettled(2);
out.glCanvasInTwoD = await ev(`!!document.querySelector('.fast-graph-gl')`);
// switch to 3D through the real settings page toggle
await ev(`app.setting.open(); app.setting.openTabById('fast-graph'); 0`); await sleep(2000);
const settings = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
out.settingsRowNames = await settings.ev(`[...document.querySelectorAll('.vertical-tab-content .setting-item-name')].map((e) => e.textContent.trim())`);
await settings.ev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === '3D view (experimental)'); row.querySelector('.checkbox-container').click(); })()`); await sleep(800);
out.view3dAfterToggle = await ev(`app.plugins.plugins['fast-graph'].graphSettings.view3d`);
settings.close(); await ev(`app.setting.close(); 0`); await sleep(500);
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('fast-graph-view')[0], { focus: true }); 0`);
out.settled3d = await waitSettled(3);
await sleep(1500);
out.state3d = await ev(`(() => { const v = ${V}; const gl = document.querySelector('.fast-graph-gl'); return { dim: v.dim, hasRenderer3d: !!v.renderer3d, glCanvas: !!gl, glSize: gl ? [gl.width, gl.height] : null, visible: v.visible.reduce((a, b) => a + b, 0), subNodes: v.sub.ids.length, positionsStride3: v.positions.length === v.capacity * 3, knownIn3d: v.known.reduce((a, b) => a + b, 0), status: document.querySelector('.fast-graph-status').textContent, drawMs: +v.renderer3d.lastDrawMs.toFixed(2), webgl: (() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); return g ? g.getParameter(g.VERSION) : null; })() }; })()`);
// the layout really uses all three axes
out.spread = await ev(`(() => { const v = ${V}; const p = v.positions; const n = v.sub.ids.length; const sd = (a) => { let m = 0; for (const id of v.sub.ids) m += p[3*id + a]; m /= n; let s = 0; for (const id of v.sub.ids) s += (p[3*id + a] - m) ** 2; return Math.sqrt(s / n); }; return { x: Math.round(sd(0)), y: Math.round(sd(1)), z: Math.round(sd(2)) }; })()`);
await shot('3d-1-default');
// cache file for 3D
await sleep(2500);
const cache3 = join(vaultDir, '.obsidian/plugins/fast-graph/layout-cache-3d.bin');
out.cache3dFile = existsSync(cache3) ? { bytes: statSync(cache3).size, expectedBytes: 32 + 20 * (await ev(`${V}.known.reduce((a, b) => a + b, 0)`)) } : null;
// real mouse: orbit, slide, zoom
const rect = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
const cx = rect.l + rect.w / 2, cy = rect.t + rect.h / 2;
const cam = () => ev(`(() => { const c = ${V}.renderer3d.camera; return { yaw: +c.yaw.toFixed(3), pitch: +c.pitch.toFixed(3), distance: +c.distance.toFixed(1), target: c.target.map((v) => +v.toFixed(1)) }; })()`);
const before = await cam();
await mouse('mousePressed', rect.l + 40, rect.t + rect.h - 40); for (let i = 1; i <= 15; i++) { await mouse('mouseMoved', rect.l + 40 + i * 12, rect.t + rect.h - 40 - i * 4); await sleep(20); } await mouse('mouseReleased', rect.l + 220, rect.t + rect.h - 100); await sleep(300);
const afterOrbit = await cam();
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -300 }); await sleep(300);
const afterZoom = await cam();
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.l + 40, y: rect.t + rect.h - 40, button: 'right', buttons: 2, clickCount: 1 });
for (let i = 1; i <= 10; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.l + 40 + i * 10, y: rect.t + rect.h - 40, button: 'right', buttons: 2 }); await sleep(20); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.l + 140, y: rect.t + rect.h - 40, button: 'right', buttons: 0, clickCount: 1 }); await sleep(300);
const afterSlide = await cam();
out.camera = { before, afterOrbit, afterZoom, afterSlide, orbitChangedYaw: afterOrbit.yaw !== before.yaw, zoomedIn: afterZoom.distance < afterOrbit.distance, slideMovedTarget: JSON.stringify(afterSlide.target) !== JSON.stringify(afterZoom.target), distanceKeptByOrbit: afterOrbit.distance === before.distance };
await shot('3d-2-after-camera');
// hover, click, drag a node
await ev(`${V}.renderer3d.fit(); 0`); await sleep(800);
const hub = await ev(`(() => { const v = ${V}; const r3 = v.renderer3d; let best = -1, bd = -1; for (let i = 0; i < v.visible.length; i++) { if (!v.visible[i]) continue; const p = r3.nodeScreen(i); if (!p || p.x < 80 || p.y < 80 || p.x > v.width - 80 || p.y > v.height - 80) continue; if (v.degrees[i] > bd) { bd = v.degrees[i]; best = i; } } const r = v.canvas.getBoundingClientRect(); const s = r3.nodeScreen(best); return { id: best, x: r.left + s.x, y: r.top + s.y, path: v.model.ids.pathOf(best), deg: bd }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hub.x, y: hub.y, button: 'none', buttons: 0 }); await sleep(500);
out.hover3d = await ev(`(() => { const v = ${V}; return { hovered: v.hovered, expected: ${hub.id}, cardHidden: document.querySelector('.fast-graph-hover').classList.contains('is-hidden'), card: document.querySelector('.fast-graph-hover').textContent }; })()`);
await shot('3d-3-hover');
const mdBefore = await ev(`app.workspace.getLeavesOfType('markdown').length`);
await mouse('mousePressed', hub.x, hub.y); await mouse('mouseReleased', hub.x, hub.y); await sleep(1200);
out.click3d = { markdownBefore: mdBefore, after: await ev(`app.workspace.getLeavesOfType('markdown').length`), active: await ev(`app.workspace.getActiveFile()?.path`), expected: hub.path };
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('fast-graph-view')[0], { focus: true }); 0`); await sleep(600);
// drag the hub in the plane facing the camera
const pos0 = await ev(`(() => { const v = ${V}; const p = v.renderer3d.nodePosition(${hub.id}); return p.map((x) => +x.toFixed(1)); })()`);
const hub2 = await ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); const s = v.renderer3d.nodeScreen(${hub.id}); return { x: r.left + s.x, y: r.top + s.y }; })()`);
await mouse('mousePressed', hub2.x, hub2.y);
for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', hub2.x + i * 8, hub2.y + i * 4); await sleep(40); }
await sleep(500);
const during = await ev(`(() => { const v = ${V}; return v.renderer3d.nodePosition(${hub.id}).map((x) => +x.toFixed(1)); })()`);
const screenDuring = await ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); const s = v.renderer3d.nodeScreen(${hub.id}); return { x: +(r.left + s.x).toFixed(1), y: +(r.top + s.y).toFixed(1) }; })()`);
await mouse('mouseReleased', hub2.x + 96, hub2.y + 48); await sleep(800);
out.drag3d = { start: pos0, duringDrag: during, pointerEnd: { x: hub2.x + 96, y: hub2.y + 48 }, nodeScreenDuringDrag: screenDuring, moved: JSON.stringify(pos0) !== JSON.stringify(during) };
// skins in 3D
const setSkin = (id) => ev(`(() => { const s = app.plugins.plugins['fast-graph'].graphSettings; s.skin = '${id}'; app.plugins.plugins['fast-graph'].settingsListeners.forEach((cb) => cb()); })()`);
await ev(`${V}.renderer3d.fit(); 0`);
out.skinDraw = {};
for (const id of ['galaxy', 'brain', 'default']) { await setSkin(id); await sleep(1200); out.skinDraw[id] = await ev(`(() => { const r = ${V}.renderer3d; const t = []; for (let i = 0; i < 20; i++) { r.draw(); t.push(r.lastDrawMs); } t.sort((a, b) => a - b); return { medianMs: +t[10].toFixed(2), maxMs: +t[19].toFixed(2) }; })()`); await shot(`3d-4-skin-${id}`); }
// back to 2D: the 2D layout comes back, the GL canvas goes away
await ev(`(() => { const s = app.plugins.plugins['fast-graph'].graphSettings; s.view3d = false; app.plugins.plugins['fast-graph'].settingsListeners.forEach((cb) => cb()); })()`);
out.back2d = await waitSettled(2);
await sleep(800);
out.after2d = await ev(`(() => { const v = ${V}; return { dim: v.dim, renderer3dGone: v.renderer3d === null, glCanvasGone: !document.querySelector('.fast-graph-gl'), known2d: v.stores[2].known.reduce((a, b) => a + b, 0), status: document.querySelector('.fast-graph-status').textContent, cache: v.cacheInfo }; })()`);
await shot('3d-5-back-in-2d');
console.log(JSON.stringify(out, null, 1));
close();
