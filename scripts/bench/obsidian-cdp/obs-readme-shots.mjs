// Screenshots for the README: the default graph, then the honeycomb. Usage: node obs-readme-shots.mjs <dir>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const shotDir = process.argv[2];
const main = await connect();
const { send, ev, sleep } = main;
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('fast-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('fast-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const settled = async () => { for (let i = 0; i < 500; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return !!l && l.view.dim === 2 && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
await settled(); await sleep(2500);
const shot = async (name) => { const clip = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height - 34 }; })()`); const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } }); writeFileSync(`${shotDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); console.log('saved', name, JSON.stringify(await ev(`(() => { const s = app.plugins.plugins['fast-graph'].graphSettings; return { layout: s.activeLayout, skin: s.skin, clusters: s.clusters, electrons: s.electrons.enabled, drift: s.drift.enabled, motion: s.motion.kind, view3d: s.view3d }; })()`))); };
await shot('readme-default');
await ev(`(() => { const p = app.plugins.plugins['fast-graph']; const s = p.graphSettings; s.activeLayout = 'honeycomb/honeycomb-2d'; s.view3d = false; s.shapeStrength = 1; p.settingsListeners.forEach((f) => f()); 0; })()`);
await sleep(800); await settled(); await sleep(6000);
await shot('readme-honeycomb');
process.exit(0);
