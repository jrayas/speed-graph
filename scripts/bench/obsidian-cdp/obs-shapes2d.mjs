// Look at flat shape layouts from the packs. Usage: node obs-shapes2d.mjs <screenshot dir> <key>[,<key>...]
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const [shotDir, keys] = process.argv.slice(2);
const main = await connect();
const { send, ev, sleep } = main;
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('fast-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('fast-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const settled = async () => { for (let i = 0; i < 500; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return !!l && l.view.dim === 2 && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
await settled(); await sleep(1000);
for (const key of keys.split(',')) {
	await ev(`(() => { const p = app.plugins.plugins['fast-graph']; const s = p.graphSettings; s.activeLayout = ${JSON.stringify(key)}; s.view3d = false; const e = ${V}.host.packs.find(${JSON.stringify(key)}); s.shapeStrength = e ? e.layout.forces.shapeStrength : 1; p.settingsListeners.forEach((f) => f()); 0; })()`);
	await sleep(800); await settled(); await sleep(4500);
	const clip = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
	const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
	writeFileSync(`${shotDir}/flat-${key.replace('/', '_')}.png`, Buffer.from(shot.result.data, 'base64'));
	console.log('saved', key);
}
// planets: are the most-connected notes on the planet spots, and how far apart are they?
const info = await ev(`(() => { const v = ${V}; if (!/solar/.test(v.host.settings.activeLayout)) return null; const ids = [...v.sub.ids]; const deg = ids.map((id) => v.degrees[id]); const order = ids.map((id, i) => i).sort((a, b) => deg[b] - deg[a] || a - b); const p = v.positions; const top = order.slice(0, 9).map((i) => [ids[i], v.degrees[ids[i]], Math.hypot(p[2*ids[i]], p[2*ids[i]+1])]); const pl = order.slice(1, 9).map((i) => [p[2*ids[i]], p[2*ids[i]+1]]); let min = 1e9; for (let a = 0; a < pl.length; a++) for (let b = a + 1; b < pl.length; b++) min = Math.min(min, Math.hypot(pl[a][0]-pl[b][0], pl[a][1]-pl[b][1])); const median = (arr) => arr.sort((x, y) => x - y)[Math.floor(arr.length / 2)]; return { topDegreesAndRadius: top.map((t) => t[1] + '@' + Math.round(t[2])), closestPlanetPairPx: Math.round(min) }; })()`);
console.log(JSON.stringify(info));
process.exit(0);
