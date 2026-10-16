// Settings tab and skins check in a real Obsidian (isolated instance, scratch vault copy).
// Usage: node obs-skins.mjs <expected link count> <screenshot dir>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const [expectedEdges, shotDir] = [Number(process.argv[2]), process.argv[3]];
const { send, ev, sleep, close } = await connect();
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${n}.png`, Buffer.from(r.result.data, 'base64')); };
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
for (let i = 0; i < 900; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === expectedEdges) break; await sleep(1000); }
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
// defaults
out.defaults = await ev(`(() => { const s = app.plugins.plugins['speed-graph'].graphSettings; return { clusters: s.clusters, skin: s.skin, skinEffects: s.skinEffects }; })()`);
// settings page: Obsidian opens Settings in its own window, so attach to that window
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const settings = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const sev = settings.ev;
out.settingsTab = await sev(`(() => { const c = document.querySelector('.vertical-tab-content'); if (!c) return null; return { names: [...c.querySelectorAll('.setting-item-name')].map((e) => e.textContent.trim()), headings: [...c.querySelectorAll('.setting-item-heading, .setting-group-heading')].map((e) => e.textContent.trim()), toggles: c.querySelectorAll('.checkbox-container').length, dropdowns: c.querySelectorAll('select').length, buttons: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()) }; })()`);
const settingsShot = async (n) => { const r = await settings.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${n}.png`, Buffer.from(r.result.data, 'base64')); };
await settingsShot('skin-0-settings-tab');
// change the skin through the real dropdown in the settings page
await sev(`(() => { const sel = document.querySelector('.vertical-tab-content select'); sel.value = 'galaxy'; sel.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(800);
out.afterTabChange = await ev(`app.plugins.plugins['speed-graph'].graphSettings.skin`);
out.effectsRowVisible = await sev(`[...document.querySelectorAll('.vertical-tab-content .setting-item-name')].some((e) => e.textContent.trim() === 'Animate skin effects')`);
await settingsShot('skin-1-settings-galaxy');
// bubbles toggle in the settings page (off by default)
out.bubblesBefore = await ev(`app.plugins.plugins['speed-graph'].graphSettings.clusters`);
await sev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === 'Zoomed-out bubbles'); row.querySelector('.checkbox-container').click(); })()`); await sleep(600);
out.bubblesAfterClick = await ev(`app.plugins.plugins['speed-graph'].graphSettings.clusters`);
await sev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === 'Zoomed-out bubbles'); row.querySelector('.checkbox-container').click(); })()`); await sleep(400);
out.bubblesAfterSecondClick = await ev(`app.plugins.plugins['speed-graph'].graphSettings.clusters`);
settings.close();
await ev(`app.setting.close(); 0`); await sleep(500);
// open the graph and look at each skin
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.settled && l.view.sub !== null; })()`)) break; }
await sleep(1500);
const draw = (n = 20) => ev(`(() => { const r = ${V}.renderer; const t = []; for (let i = 0; i < ${n}; i++) { r.draw(); t.push(r.lastDrawMs); } t.sort((a, b) => a - b); return { medianMs: +t[Math.floor(${n} / 2)].toFixed(2), maxMs: +t[${n} - 1].toFixed(2) }; })()`);
const setSkin = (id) => ev(`(() => { const s = app.plugins.plugins['speed-graph'].graphSettings; s.skin = '${id}'; app.plugins.plugins['speed-graph'].settingsListeners.forEach((cb) => cb()); })()`);
out.draw = {};
for (const id of ['default', 'galaxy', 'brain']) {
  await setSkin(id); await sleep(1200);
  await ev(`${V}.fit(true)`); await sleep(700);
  out.draw[id] = await draw();
  await shot(`skin-2-${id}`);
}
// zoomed in on the brain skin: curved links and pulses
await ev(`(() => { const v = ${V}; v.autoFit = false; const t = v.transform; const f = 6; const sx = v.width / 2, sy = v.height / 2; const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k; v.setTransform({ k: t.k * f, x: sx - wx * t.k * f, y: sy - wy * t.k * f }); })()`); await sleep(900);
out.brainZoomedDraw = await draw(10);
await shot('skin-3-brain-zoomed');
await setSkin('galaxy'); await sleep(900); await shot('skin-4-galaxy-zoomed');
// animation loop runs only for animated skins, and stops when effects are off
out.animation = {};
await setSkin('galaxy');
out.animation.galaxyTimerRunning = await ev(`${V}.renderer.animTimer !== 0`);
await ev(`(() => { const s = app.plugins.plugins['speed-graph'].graphSettings; s.skinEffects = false; app.plugins.plugins['speed-graph'].settingsListeners.forEach((cb) => cb()); })()`); await sleep(300);
out.animation.effectsOffTimerRunning = await ev(`${V}.renderer.animTimer !== 0`);
await setSkin('default');
out.animation.defaultSkinTimerRunning = await ev(`${V}.renderer.animTimer !== 0`);
console.log(JSON.stringify(out, null, 1));
close();
