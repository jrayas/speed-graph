// Shape layouts and pack import through the real settings page. Usage: node obs-shapes.mjs <screenshot dir>
import { writeFileSync, readFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const shotDir = process.argv[2];
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const settled = async (dim) => { for (let i = 0; i < 500; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
out.settled0 = await settled(2); await sleep(1200);
const shot = async (name) => { await sleep(800); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const geometry = (dim) => ev(`(() => { const v = ${V}; const p = v.positions; const d = ${dim}; let n = 0, sx = 0, sy = 0, sz = 0; const ids = v.sub.ids; for (const id of ids) { sx += p[d*id]; sy += p[d*id+1]; if (d === 3) sz += p[d*id+2]; n++; } const mx = sx/n, my = sy/n, mz = sz/n; let vx = 0, vy = 0, vz = 0; for (const id of ids) { vx += (p[d*id]-mx)**2; vy += (p[d*id+1]-my)**2; if (d === 3) vz += (p[d*id+2]-mz)**2; } return { nodes: n, sdX: +Math.sqrt(vx/n).toFixed(1), sdY: +Math.sqrt(vy/n).toFixed(1), sdZ: d === 3 ? +Math.sqrt(vz/n).toFixed(1) : null }; })()`);
out.normal2d = await geometry(2); await shot('shape-0-normal');
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const rowFor = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
const choose = (name, label) => st.ev(`(() => { const row = ${rowFor(name)}; if (!row) return 'no row'; const s = row.querySelector('select'); const o = [...s.options].find((o) => o.text === ${JSON.stringify(label)}); if (!o) return 'no option: ' + [...s.options].map((o) => o.text); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const slide = (name, v) => st.ev(`(() => { const row = ${rowFor(name)}; if (!row) return 'no row'; const sl = row.querySelector('input[type=range]'); sl.value = ${v}; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
out.options = await st.ev(`[...${rowFor('Shape layout')}.querySelectorAll('option')].map((o) => o.value + '=' + o.text)`);
out.strengthHiddenWhenNone = await st.ev(`(() => { const r = ${rowFor('Shape strength')}; return !r || r.offsetParent === null || r.style.display === 'none'; })()`);
// 2D heart
out.chose2d = await choose('Shape layout', 'Heart (2D)'); out.settled2d = await settled(2); await sleep(2500);
out.heart2d = await geometry(2); await shot('shape-1-heart-2d');
out.setView3dWas = await ev(`app.plugins.plugins['speed-graph'].graphSettings.view3d`);
await slide('Shape strength', 1); await sleep(4000); out.heart2dFull = await geometry(2); await shot('shape-2-heart-2d-strength-100');
// 3D layouts
for (const [label, name] of [['Heart (3D)', 'heart3d'], ['Brain (3D)', 'brain3d'], ['Galaxy (3D)', 'galaxy3d']]) {
	out['choose ' + label] = await choose('Shape layout', label);
	out['settled ' + label] = await settled(3); await sleep(5000);
	out[name] = await geometry(3); out[name + 'Skin'] = await ev(`${V}.renderer3d?.skin?.id ?? null`); await shot('shape-3-' + name);
}
// back to none
out.none = await choose('Shape layout', 'None (normal graph)'); await sleep(500);
out.savedAfterNone = await ev(`JSON.stringify([app.plugins.plugins['speed-graph'].graphSettings.activeLayout, app.plugins.plugins['speed-graph'].graphSettings.view3d])`);
// import: a good pack (the heart pack under a new id) and a bad one, through the real textarea and row
const good = JSON.parse(readFileSync(new URL('../../docs/packs/heart.fgpack.json', import.meta.url), 'utf8')); good.id = 'my-heart'; good.name = 'My heart'; good.layouts = good.layouts.slice(0, 1);
const typeText = (t) => st.ev(`(() => { const ta = ${rowFor('Pack text or vault path')}.querySelector('textarea'); ta.value = ${JSON.stringify(t)}; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const clickRow = (name) => st.ev(`(() => { const row = ${rowFor(name)}; if (!row) return 'no row ' + ${JSON.stringify(name)}; const b = row.querySelector('button') ?? row.querySelector('.clickable-icon') ?? row; b.click(); return 'clicked'; })()`);
const descOf = (name) => st.ev(`${rowFor(name)}?.querySelector('.setting-item-description')?.textContent ?? null`);
await typeText('{ "format": "speed-graph-pack", "version": 1, "id": "Bad Id", "shapes": [ { "id": "s", "kind": "implicit", "value": "x +" } ] }');
out.clickBad = await clickRow('Import a pack'); await sleep(800);
out.badReport = await descOf('Import a pack');
await typeText(JSON.stringify(good)); out.clickGood = await clickRow('Import a pack'); await sleep(1000);
out.goodReport = await descOf('Import a pack');
out.optionsAfterImport = await st.ev(`[...${rowFor('Shape layout')}.querySelectorAll('option')].map((o) => o.text)`);
out.removeRowPresent = await st.ev(`!!${rowFor('Remove My heart')}`);
out.packFileSaved = await ev(`app.vault.adapter.exists('.obsidian/plugins/speed-graph/packs/my-heart.fgpack.json')`);
// reload the plugin: the imported pack must come back
await ev(`app.plugins.disablePlugin('speed-graph').then(() => app.plugins.enablePlugin('speed-graph')); 0`); await sleep(2500);
await ev(`app.setting.close(); 0`); await sleep(500);
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st2 = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
out.afterReload = await st2.ev(`[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === 'Shape layout').querySelectorAll('option').length + ' options; imported pack listed: ' + [...document.querySelectorAll('.vertical-tab-content .setting-item-name')].some((e) => e.textContent.trim() === 'Remove My heart')`);
// remove it again through the real row
out.removeClick = await st2.ev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === 'Remove My heart'); if (!row) return 'no row'; (row.querySelector('button') ?? row).click(); return 'clicked'; })()`); await sleep(1000);
out.afterRemove = await ev(`app.vault.adapter.exists('.obsidian/plugins/speed-graph/packs/my-heart.fgpack.json')`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
