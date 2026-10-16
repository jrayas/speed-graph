// Settings page as the control centre: drives the real settings window and measures the effect on screen.
// Usage: node obs-look.mjs <expected link count> <screenshot dir>
import { writeFileSync } from 'node:fs';
import { connect, decodePng } from './cdp-lib.mjs';
const [expectedEdges, shotDir] = [Number(process.argv[2]), process.argv[3]];
const main = await connect();
const { send, ev, sleep } = main;
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const out = {};
const S = `app.plugins.plugins['speed-graph'].graphSettings`;
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
for (let i = 0; i < 900; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === expectedEdges) break; await sleep(1000); }
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const settled = async (dim) => { for (let i = 0; i < 600; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
out.settled = await settled(2); await sleep(1500);
// mean colour of the graph pane from a small screenshot
const pane = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left, y: r.top + 20, width: r.width, height: r.height - 60 }; })()`);
const measure = async () => { await sleep(700); const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...pane, scale: 0.3 } }); const img = decodePng(Buffer.from(r.result.data, 'base64')); let R = 0, G = 0, B = 0, n = 0; for (let i = 0; i < img.width * img.height; i++) { R += img.data[i * img.channels]; G += img.data[i * img.channels + 1]; B += img.data[i * img.channels + 2]; n++; } return { r: +(R / n).toFixed(2), g: +(G / n).toFixed(2), b: +(B / n).toFixed(2), luma: +((0.299 * R + 0.587 * G + 0.114 * B) / n).toFixed(2) }; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
// open the real settings window
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const sev = st.ev;
const names = () => sev(`[...document.querySelectorAll('.vertical-tab-content .setting-item-name')].map((e) => e.textContent.trim())`);
out.rowsPlain = await names();
out.sliderCount = await sev(`document.querySelectorAll('.vertical-tab-content input[type=range]').length`);
const setSlider = (name, value) => sev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)}); if (!row) return 'no row: ${name}'; const sl = row.querySelector('input[type=range]'); sl.value = ${value}; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const setToggle = (name, on) => sev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)}); if (!row) return 'no row'; const c = row.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled') !== ${on}) c.click(); return 'ok'; })()`);
const setColour = (name, hex) => sev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)}); if (!row) return 'no row: ${name}'; const i = row.querySelector('input[type=color]'); i.value = '${hex}'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
const look = () => ev(`(() => ({ ...${S}.look }))()`);
// 1. defaults are neutral
out.defaultLook = await look();
out.base = await measure();
// 2. global brightness through the real slider
out.brightness = {};
for (const v of [0.4, 1, 1.8]) { out.brightness['set ' + v] = await setSlider('Brightness', v); await sleep(400); out.brightness[v] = { saved: (await look()).brightness, ...(await measure()) }; if (v === 0.4 || v === 1.8) await shot('look-brightness-' + v); }
await setSlider('Brightness', 1);
// 3. only nodes / only links / only labels
const mean = async (name, value, reset) => { await setSlider(name, value); await sleep(300); const m = await measure(); await setSlider(name, reset); return m; };
out.nodeBrightness2 = await mean('Node brightness', 2.2, 1);
out.nodeOpacityLow = await mean('Node opacity', 0.2, 1);
out.linkBrightness0 = await mean('Link brightness', 0, 1);
out.linkBrightness3 = await mean('Link brightness', 3, 1);
out.saturation0 = await mean('Saturation', 0, 1);
// 4. custom node colour through the real colour picker (pure green nodes: green channel must dominate)
out.customNode = { toggle: await setToggle('Custom node colour', true) }; await sleep(300);
out.customNode.rowsAfter = (await names()).includes('Node colour');
out.customNode.colour = await setColour('Node colour', '#00ff00'); await sleep(400);
out.customNode.saved = (await look()).nodeColour;
out.customNode.mean = await measure(); await shot('look-custom-green-nodes');
await setToggle('Custom node colour', false);
out.customBackground = { toggle: await setToggle('Custom background colour', true) }; await sleep(300);
await setColour('Background colour', '#301030'); await sleep(500);
out.customBackground.mean = await measure(); await shot('look-custom-background');
await setToggle('Custom background colour', false);
// 5. layout force from the settings page changes the layout
const spread = () => ev(`(() => { const v = ${V}; let s = 0, n = 0; for (let i = 0; i < v.visible.length; i++) if (v.visible[i]) { s += Math.hypot(v.positions[2*i], v.positions[2*i+1]); n++; } return +(s / n).toFixed(1); })()`);
const before = await spread();
await setSlider('Link distance', 160);
await sleep(1500); out.settledAfterForce = await settled(2); await sleep(500);
out.linkDistance = { before, after160: await spread(), saved: await ev(`${S}.linkDistance`) };
await setSlider('Link distance', 30); await sleep(1500); await settled(2);
// 6. skin rows appear, glow strength changes the picture
await ev(`(() => { ${S}.skin = 'galaxy'; app.plugins.plugins['speed-graph'].settingsListeners.forEach((cb) => cb()); })()`); await sleep(1500);
out.rowsGalaxy = (await names()).filter((n) => ['Glow strength', 'Background brightness', 'Effects speed', 'Animate skin effects'].includes(n));
out.glow = {};
for (const v of [0, 1, 2]) { await setSlider('Glow strength', v); await sleep(300); out.glow[v] = await measure(); }
await setSlider('Glow strength', 1);
out.backgroundBrightness = {};
for (const v of [0, 1, 2]) { await setSlider('Background brightness', v); await sleep(300); out.backgroundBrightness[v] = await measure(); }
await setSlider('Background brightness', 1);
// 7. labels
await setSlider('Label size', 20); await sleep(300); out.labelSize = { saved: (await look()).labelSize };
await setSlider('Label size', 12);
// 8. reset button
await setSlider('Brightness', 1.9); await setSlider('Saturation', 0.3);
await sev(`(() => { const row = [...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === 'Reset brightness and colour'); row.click(); })()`); await sleep(600);
out.afterReset = await look();
// 9. 3D settings rows and effect
await ev(`(() => { ${S}.skin = 'default'; ${S}.view3d = true; app.plugins.plugins['speed-graph'].settingsListeners.forEach((cb) => cb()); })()`);
out.settled3d = await settled(3); await sleep(1500);
out.rows3d = (await names()).filter((n) => ['Field of view', 'Depth fade', 'Slowly rotate the 3D view'].includes(n));
await setSlider('Field of view', 80); await sleep(400);
out.fov = { saved: (await look()).fov, cameraFovDeg: await ev(`+(${V}.renderer3d.camera.fovY * 180 / Math.PI).toFixed(1)`) };
await setSlider('Field of view', 50);
const m3 = {};
for (const v of [0.4, 1, 1.8]) { await setSlider('Brightness', v); await sleep(400); m3[v] = await measure(); }
out.brightness3d = m3; await shot('look-3d-bright');
await setSlider('Brightness', 1);
st.close();
console.log(JSON.stringify(out, null, 1));
main.close();
