// Shockwave, panic and the activity-linked heartbeat in a real Obsidian. Usage: node obs-motion2.mjs
import { connect } from './cdp-lib.mjs';
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.settled && l.view.sub !== null; })()`)) break; }
await sleep(800);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const evAwait = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const rowFor = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
const choose = (name, label) => st.ev(`(() => { const s = ${rowFor(name)}.querySelector('select'); const o = [...s.options].find((o) => o.text === ${JSON.stringify(label)}); if (!o) return 'no option: ' + [...s.options].map((o) => o.text); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const slide = (name, v) => st.ev(`(() => { const sl = ${rowFor(name)}.querySelector('input[type=range]'); sl.value = ${v}; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const toggle = (name, on) => st.ev(`(() => { const c = ${rowFor(name)}.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled') !== ${on}) c.click(); return 'ok'; })()`);
const track = (ms) => `new Promise((resolve) => { const r = ${V}.renderer; const rows = []; const t0 = performance.now(); const step = () => { const t = performance.now() - t0; rows.push([Math.round(t), r.motion.scale, Math.hypot(r.motion.dx, r.motion.dy)]); if (t < ${ms}) requestAnimationFrame(step); else resolve(rows); }; requestAnimationFrame(step); })`;
const peaks = (rows) => rows.filter((r, i) => i > 0 && i < rows.length - 1 && r[1] > 1.03 && r[1] > rows[i - 1][1] && r[1] >= rows[i + 1][1]).length;
await slide('Strength', 1);
// shockwave: edit a real note (in the scratch copy) and watch the scale
await choose('Effect', 'Shockwave (pulse when you open or edit a note)'); await sleep(600);
out.idle = await evAwait(`(async () => { const rows = await ${track(800)}; return Math.max(...rows.map((r) => Math.abs(r[1] - 1))); })()`);
out.afterEdit = await evAwait(`(async () => { const f = app.vault.getMarkdownFiles()[3]; const p = ${track(2500)}; await app.vault.append(f, '\\n'); const rows = await p; const big = rows.filter((r) => Math.abs(r[1] - 1) > 0.03); return { frames: rows.length, peak: Math.max(...rows.map((r) => r[1])), trough: Math.min(...rows.map((r) => r[1])), firstBigAt: big[0]?.[0], lastBigAt: big.at(-1)?.[0], endsAtRest: Math.abs(rows.at(-1)[1] - 1) < 0.002 }; })()`);
// panic
await choose('Effect', 'Panic (flicker that builds, then calms)'); await sleep(500); await slide('Panic cycles', 12); await sleep(300); // 5 s cycle
out.panic = await evAwait(`(async () => { const rows = await ${track(5200)}; const a = (from, to) => Math.max(...rows.filter((r) => r[0] >= from && r[0] < to).map((r) => r[2])); return { calmStart: +a(0, 400).toFixed(2), building: +a(2500, 3300).toFixed(2), peakNearEnd: +a(3000, 3600).toFixed(2), calmAfterDrop: +a(4300, 5000).toFixed(2) }; })()`);
// activity-linked heart: count beats per second with and without recent activity
await choose('Effect', 'Heartbeat'); await sleep(500); await slide('Heart rate', 60); await toggle('Beat faster when I am active', true); await sleep(500);
const rest = await evAwait(track(5000)); out.restBeatsPerMin = +(peaks(rest) / 5 * 60).toFixed(0);
const busy = await evAwait(`(async () => { const p = ${track(5000)}; for (let i = 0; i < 6; i++) { await app.vault.append(app.vault.getMarkdownFiles()[i], '\\n'); await new Promise((r) => setTimeout(r, 100)); } return await p; })()`);
out.busyBeatsPerMin = +(peaks(busy) / 5 * 60).toFixed(0);
await sleep(14000);
const calm = await evAwait(track(5000)); out.calmAgainBeatsPerMin = +(peaks(calm) / 5 * 60).toFixed(0);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
