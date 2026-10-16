// Header gear and moving electrons through the real UI. Usage: node obs-electrons.mjs <screenshot dir> [expected edge count]
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const shotDir = process.argv[2];
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
if (process.argv[3]) { for (let i = 0; i < 900; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === Number(process.argv[3])) break; await sleep(1000); } }
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const settled = async (dim) => { for (let i = 0; i < 900; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
const evAwait = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name, clip) => { await sleep(600); const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 2 } } : {}) }); writeFileSync(`${shotDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
out.settled = await settled(2); await sleep(1500);
// ---- the gear in the pane header
out.gear = await ev(`(() => { const header = document.querySelector('.workspace-leaf.mod-active .view-header') ?? document.querySelector('.view-header'); const acts = [...header.querySelectorAll('.view-actions .clickable-icon')].map((e) => ({ label: e.getAttribute('aria-label'), x: Math.round(e.getBoundingClientRect().left), y: Math.round(e.getBoundingClientRect().top) })); return { acts, inCanvasButton: !!document.querySelector('.speed-graph-controls-toggle') }; })()`);
out.panelClosedAtStart = await ev(`document.querySelector('.speed-graph-controls').classList.contains('is-collapsed')`);
const clickGear = () => ev(`(() => { const b = [...document.querySelectorAll('.view-actions .clickable-icon')].find((e) => e.getAttribute('aria-label') === 'Graph settings'); b.click(); return 'ok'; })()`);
await clickGear(); await sleep(300);
out.panelOpenAfterClick = await ev(`!document.querySelector('.speed-graph-controls').classList.contains('is-collapsed')`);
out.gearActive = await ev(`[...document.querySelectorAll('.view-actions .clickable-icon')].find((e) => e.getAttribute('aria-label') === 'Graph settings').classList.contains('is-active')`);
await shot('electrons-0-header-panel-open');
await clickGear(); await sleep(300);
out.panelClosedAfterSecondClick = await ev(`document.querySelector('.speed-graph-controls').classList.contains('is-collapsed')`);
// ---- electrons through the real settings page
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const rowFor = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
const names = await st.ev(`[...document.querySelectorAll('.vertical-tab-content .setting-item-name')].map((e) => e.textContent.trim()).slice(0, 4)`);
out.firstRows = names;
const visible = (name) => st.ev(`(() => { const r = ${rowFor(name)}; if (!r) return false; const b = r.getBoundingClientRect(); return r.offsetParent !== null && b.height > 0 && getComputedStyle(r).display !== 'none' && getComputedStyle(r).visibility !== 'hidden'; })()`);
const rowInfo = (name) => st.ev(`(() => { const r = ${rowFor(name)}; if (!r) return null; const b = r.getBoundingClientRect(); return { cls: r.className, display: getComputedStyle(r).display, h: Math.round(b.height), hiddenAttr: r.hidden }; })()`);
out.speedRowWhenOff = await rowInfo('Electron speed'); out.speedHiddenWhenOff = !(await visible('Electron speed'));
await st.ev(`(() => { const c = ${rowFor('Moving electrons on links')}.querySelector('.checkbox-container'); if (!c.classList.contains('is-enabled')) c.click(); return 'ok'; })()`); await sleep(1000);
out.speedShownWhenOn = await visible('Electron speed');
out.saved = await ev(`JSON.stringify(app.plugins.plugins['speed-graph'].graphSettings.electrons)`);
// frame differences: how many pixels change between two frames 120 ms apart
const diffJs = (dim) => `new Promise((resolve) => { const v = ${V}; const c = ${dim === 3 ? 'v.renderer3d.overlay' : 'v.canvas'}; const g = c.getContext('2d'); const snap = () => g.getImageData(0, 0, c.width, c.height).data; const a = snap(); setTimeout(() => { const b = snap(); let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2] || a[i+3] !== b[i+3]) n++; resolve(n); }, 120); })`;
out.changedPixels2dOn = await evAwait(diffJs(2));
const pane = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.3, width: r.width * 0.4, height: r.height * 0.4 }; })()`);
await shot('electrons-1-2d-zoomed', pane);
out.statusDraw2d = await ev(`document.querySelector('.speed-graph-status')?.textContent`);
// off again: nothing moves
await st.ev(`(() => { const c = ${rowFor('Moving electrons on links')}.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled')) c.click(); return 'ok'; })()`); await sleep(800);
out.changedPixels2dOff = await evAwait(diffJs(2));
// 3D
await st.ev(`(() => { const c = ${rowFor('Moving electrons on links')}.querySelector('.checkbox-container'); if (!c.classList.contains('is-enabled')) c.click(); const t = ${rowFor('3D view (experimental)')}.querySelector('.checkbox-container'); if (!t.classList.contains('is-enabled')) t.click(); return 'ok'; })()`);
out.settled3d = await settled(3); await sleep(1500);
out.changedPixels3dOn = await evAwait(diffJs(3));
out.statusDraw3d = await ev(`document.querySelector('.speed-graph-status')?.textContent`);
await shot('electrons-2-3d');
await st.ev(`(() => { const c = ${rowFor('Moving electrons on links')}.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled')) c.click(); return 'ok'; })()`); await sleep(800);
out.changedPixels3dOff = await evAwait(diffJs(3));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
