// After the rename: the plugin must use only its new id, view type, classes and names. Usage: node obs-rename.mjs
import { connect } from './cdp-lib.mjs';
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2500);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
out.folder = await ev(`app.vault.adapter.list('.obsidian/plugins').then((l) => l.folders.map((f) => f.split('/').pop()))`);
out.loadedById = await ev(`!!app.plugins.plugins['speed-graph']`);
out.manifest = await ev(`(() => { const m = app.plugins.manifests['speed-graph']; return m ? { id: m.id, name: m.name, version: m.version } : null; })()`);
out.oldIdLoaded = await ev(`!!app.plugins.plugins['fast-graph']`);
out.commands = await ev(`Object.values(app.commands.commands).filter((c) => /graph/i.test(c.id) && /speed|fast/.test(c.id)).map((c) => c.id + ' = ' + c.name)`);
out.ribbon = await ev(`[...document.querySelectorAll('.side-dock-ribbon-action')].map((e) => e.getAttribute('aria-label')).filter((l) => /graph/i.test(l ?? ''))`);
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
for (let i = 0; i < 300; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === 2 && l.view.settled && l.view.sub !== null; })()`)) break; }
out.viewType = await ev(`${V}.getViewType()`);
out.tabTitle = await ev(`${V}.getDisplayText()`);
out.oldViewTypeLeaves = await ev(`app.workspace.getLeavesOfType('fast-graph-view').length`);
out.newClassElements = await ev(`['.speed-graph-view', '.speed-graph-canvas', '.speed-graph-status', '.speed-graph-controls'].map((s) => s + ':' + document.querySelectorAll(s).length)`);
out.anyOldClass = await ev(`document.querySelectorAll('[class*="fast-graph"]').length`);
out.cssApplied = await ev(`(() => ({ statusPosition: getComputedStyle(document.querySelector('.speed-graph-status')).position, controlsPosition: getComputedStyle(document.querySelector('.speed-graph-controls')).position }))()`);
out.status = await ev(`document.querySelector('.speed-graph-status')?.textContent`);
// the settings page: tab name and a rename-safe saved file
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
out.settingsTabs = await st.ev(`[...document.querySelectorAll('.vertical-tab-nav-item')].map((e) => e.textContent.trim()).filter((t) => /graph/i.test(t))`);
out.settingsOpened = await st.ev(`!!document.querySelector('.vertical-tab-content .setting-item')`);
await ev(`app.setting.close(); 0`); await sleep(500);
await ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.motion.kind = 'heartbeat'; p.graphSettings.rightButtonPan = true; p.settingsListeners.forEach((f) => f()); p.saveData(p.graphSettings); 0; })()`); await sleep(1500);
out.filesInPluginFolder = await ev(`app.vault.adapter.list('.obsidian/plugins/speed-graph').then((l) => l.files.map((f) => f.split('/').pop()).sort())`);
out.legacyPackAccepted = await ev(`(async () => { const p = app.plugins.plugins['speed-graph']; const v = ${V}; const r = await v.host.packs.importText(JSON.stringify({ format: 'fast-graph-pack', version: 1, id: 'legacy-test', layouts: [{ id: 'l' }] })); const ok = r.ok; if (ok) await v.host.packs.remove('legacy-test'); return ok; })()`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
