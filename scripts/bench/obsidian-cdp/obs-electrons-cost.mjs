// Draw cost of electrons on a big vault. Usage: node obs-electrons-cost.mjs <expected edge count>
import { connect } from './cdp-lib.mjs';
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
for (let i = 0; i < 1500; i++) { if ((await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`)) === Number(process.argv[2])) break; await sleep(1000); }
out.indexedEdges = await ev(`app.plugins.plugins['speed-graph'].vaultGraph.model.edges`);
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const settled = async (dim) => { for (let i = 0; i < 1200; i++) { await sleep(500); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
const evAwait = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
out.settled = await settled(2); await sleep(2000);
// time the renderer's own draw for 40 forced frames, then do it again with electrons on
const timeDraws = (dim) => `new Promise((resolve) => { const v = ${V}; const r = ${dim === 3 ? 'v.renderer3d' : 'v.renderer'}; const times = []; let n = 0; const step = () => { const t0 = performance.now(); r.draw(); times.push(performance.now() - t0); if (++n < 60) requestAnimationFrame(step); else { times.sort((a, b) => a - b); resolve({ median: +times[30].toFixed(2), p95: +times[56].toFixed(2), max: +times[59].toFixed(2) }); } }; requestAnimationFrame(step); })`;
const setElectrons = (on, amount) => ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.electrons.enabled = ${on}; p.graphSettings.electrons.amount = ${amount}; p.settingsListeners.forEach((f) => f()); 0; })()`);
const setDrift = (on, amount) => ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.drift.enabled = ${on}; p.graphSettings.drift.amount = ${amount}; p.settingsListeners.forEach((f) => f()); 0; })()`);
out.draw2dOff = await evAwait(timeDraws(2));
await setDrift(true, 0.4); await sleep(800); out.draw2dDrift40 = await evAwait(timeDraws(2));
await setDrift(true, 1); await sleep(800); out.draw2dDrift100 = await evAwait(timeDraws(2));
await setDrift(false, 0.4); await sleep(500);
await setElectrons(true, 0.4); await sleep(800); out.draw2dOn40 = await evAwait(timeDraws(2));
await setElectrons(true, 1); await sleep(800); out.draw2dOn100 = await evAwait(timeDraws(2));
await setElectrons(false, 0.4); await sleep(500);
await ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.view3d = true; p.settingsListeners.forEach((f) => f()); 0; })()`);
out.settled3d = await settled(3); await sleep(2000);
out.draw3dOff = await evAwait(timeDraws(3));
await setDrift(true, 0.4); await sleep(800); out.draw3dDrift40 = await evAwait(timeDraws(3));
await setDrift(true, 1); await sleep(800); out.draw3dDrift100 = await evAwait(timeDraws(3));
await setDrift(false, 0.4); await sleep(500);
await setElectrons(true, 0.4); await sleep(800); out.draw3dOn40 = await evAwait(timeDraws(3));
await setElectrons(true, 1); await sleep(800); out.draw3dOn100 = await evAwait(timeDraws(3));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
