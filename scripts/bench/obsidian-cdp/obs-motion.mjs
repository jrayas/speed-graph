// Motion effects through the real settings page. Usage: node obs-motion.mjs <screenshot dir>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const shotDir = process.argv[2];
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const settled = async (dim) => { for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
out.settled = await settled(2); await sleep(1000);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
// sample the effect scale and the width of what is really drawn, every animation frame for `ms`
const sampleJs = (ms, dim) => `new Promise((resolve) => { const v = ${V}; const r = ${dim === 3 ? 'v.renderer3d' : 'v.renderer'}; const c = v.canvas; const g = ${dim === 3 ? 'null' : "c.getContext('2d')"}; const rows = []; const t0 = performance.now(); const step = () => { const t = performance.now() - t0; let w = -1; if (g) { const W = c.width, H = c.height; const d = g.getImageData(0, Math.floor(H / 2), W, 1).data; let lo = W, hi = -1; for (let x = 0; x < W; x++) if (d[4 * x + 3] > 40) { if (x < lo) lo = x; if (x > hi) hi = x; } w = hi - lo; } rows.push([Math.round(t), +r.motion.scale.toFixed(4), +r.motion.dx.toFixed(2), w]); if (t < ${ms}) requestAnimationFrame(step); else resolve(rows); }; requestAnimationFrame(step); })`;
const summarise = (rows) => { const sc = rows.map((r) => r[1]); const w = rows.map((r) => r[3]).filter((x) => x > 0); return { frames: rows.length, scaleMin: Math.min(...sc), scaleMax: Math.max(...sc), widthMin: Math.min(...w), widthMax: Math.max(...w), dxMax: Math.max(...rows.map((r) => Math.abs(r[2]))) }; };
const evAwait = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
out.offDefault = summarise(await evAwait(sampleJs(1000, 2)));
// open the real settings window and choose the effect
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const rowFor = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
const choose = (name, label) => st.ev(`(() => { const row = ${rowFor(name)}; if (!row) return 'no row'; const s = row.querySelector('select'); const o = [...s.options].find((o) => o.text === ${JSON.stringify(label)}); if (!o) return 'no option: ' + [...s.options].map((o) => o.text); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const slide = (name, v) => st.ev(`(() => { const row = ${rowFor(name)}; if (!row) return 'no row ${name}'; const sl = row.querySelector('input[type=range]'); sl.value = ${v}; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const rowsNow = () => st.ev(`[...document.querySelectorAll('.vertical-tab-content .setting-item-name')].map((e) => e.textContent.trim())`);
out.rowsOff = (await rowsNow()).filter((n) => ['Effect', 'Strength', 'Heart rate', 'Double beat', 'Breathing rate', 'Vibration speed', 'Flinch rate'].includes(n));
out.chose = await choose('Effect', 'Heartbeat'); await sleep(800);
out.rowsHeart = (await rowsNow()).filter((n) => ['Effect', 'Strength', 'Heart rate', 'Double beat', 'Breathing rate', 'Vibration speed', 'Flinch rate'].includes(n));
out.strength = await slide('Strength', 1); await sleep(300);
out.saved = await ev(`JSON.stringify(app.plugins.plugins['speed-graph'].graphSettings.motion)`);
out.heart2d = summarise(await evAwait(sampleJs(3000, 2)));
const pic = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/motion-heart-2d.png`, Buffer.from(pic.result.data, 'base64'));
for (const [label, speedRow, v] of [['Vibrate', 'Vibration speed', 30], ['Scared (flinch and shiver)', 'Flinch rate', 40], ['Breathing', 'Breathing rate', 12]]) {
	await choose('Effect', label); await sleep(600); if (speedRow) await slide(speedRow, v); await sleep(300);
	out[label] = summarise(await evAwait(sampleJs(3500, 2)));
}
// 3D: turn it on in the real settings page, run the heartbeat there
await choose('Effect', 'Heartbeat'); await sleep(400);
await st.ev(`(() => { const row = ${rowFor('3D view (experimental)')}; const c = row.querySelector('.checkbox-container'); if (!c.classList.contains('is-enabled')) c.click(); return 'ok'; })()`);
out.settled3d = await settled(3); await sleep(1500);
out.heart3d = summarise(await evAwait(sampleJs(3000, 3)));
const pic3 = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/motion-heart-3d.png`, Buffer.from(pic3.result.data, 'base64'));
// back to Off: the picture must stand still again
await choose('Effect', 'Off'); await sleep(800);
out.off3d = summarise(await evAwait(sampleJs(800, 3)));
out.errors = await ev(`(window.__fgErrors || []).length`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
