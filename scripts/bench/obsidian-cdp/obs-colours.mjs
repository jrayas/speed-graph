// The shape-colours setting through the real settings page. Usage: node obs-colours.mjs <screenshot dir> <layout key>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const [shotDir, key] = process.argv.slice(2);
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('fast-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('fast-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const settled = async () => { for (let i = 0; i < 500; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return !!l && l.view.dim === 2 && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
await settled(); await sleep(1000);
const shot = async (name) => { await sleep(800); const clip = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`); const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } }); writeFileSync(`${shotDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const skinInfo = () => ev(`(() => { const s = ${V}.renderer.skin; return s ? { id: s.id, base: s.base, glow: s.glow } : null; })()`);
out.defaultSetting = await ev(`app.plugins.plugins['fast-graph'].graphSettings.shapeColours`);
out.skinBefore = await skinInfo();
// choose the layout through the real settings page
await ev(`app.setting.open(); app.setting.openTabById('fast-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const rowFor = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
const visible = (name) => st.ev(`(() => { const r = ${rowFor(name)}; if (!r) return false; const b = r.getBoundingClientRect(); return r.offsetParent !== null && b.height > 0 && getComputedStyle(r).display !== 'none'; })()`);
out.colourRowHiddenWithNoShape = !(await visible("Use the shape's own colours"));
await st.ev(`(() => { const s = ${rowFor('Shape layout')}.querySelector('select'); const o = [...s.options].find((o) => o.value === ${JSON.stringify(key)}); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
await sleep(1000); await settled(); await sleep(4500);
out.colourRowShownWithShape = await visible("Use the shape's own colours");
out.skinWithColours = await skinInfo();
await shot('colours-on');
// switch the colours off with the real toggle
await st.ev(`(() => { const c = ${rowFor("Use the shape's own colours")}.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled')) c.click(); return 'ok'; })()`); await sleep(1200);
out.saved = await ev(`app.plugins.plugins['fast-graph'].graphSettings.shapeColours`);
out.skinWithoutColours = await skinInfo();
out.shapeStillApplied = await ev(`!!${V}.buildShape()`);
await shot('colours-off');
// back on
await st.ev(`(() => { const c = ${rowFor("Use the shape's own colours")}.querySelector('.checkbox-container'); if (!c.classList.contains('is-enabled')) c.click(); return 'ok'; })()`); await sleep(1200);
out.skinBackOn = await skinInfo();
// planets/hubs: where are the core and coils?
out.hubs = await ev(`(() => { const v = ${V}; if (!/arc-reactor/.test(v.host.settings.activeLayout)) return null; const ids = [...v.sub.ids]; const deg = ids.map((id) => v.degrees[id]); const order = ids.map((id, i) => i).sort((a, b) => deg[b] - deg[a] || a - b); const p = v.positions; const top = order.slice(0, 11).map((i) => Math.round(Math.hypot(p[2*ids[i]], p[2*ids[i]+1]))); return { radiiOfTop11: top }; })()`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
