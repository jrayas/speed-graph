// View a shape from a chosen angle at several strengths. Usage: node obs-tune.mjs <screenshot dir> <layout key> <name> <pitch> <yaw> <strengths comma list>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const [shotDir, layout, name, pitch, yaw, strengths] = process.argv.slice(2);
const main = await connect();
const { send, ev, sleep } = main;
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('fast-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('fast-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const settled = async (dim) => { for (let i = 0; i < 500; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
await settled(2); await sleep(1000);
const apply = (key, strength) => ev(`(() => { const p = app.plugins.plugins['fast-graph']; const s = p.graphSettings; s.activeLayout = ${JSON.stringify(key)}; s.view3d = true; s.shapeStrength = ${strength}; p.settingsListeners.forEach((f) => f()); 0; })()`);
for (const st of strengths.split(',')) {
	await apply(layout, Number(st));
	await settled(3); await sleep(4500);
	await ev(`(() => { const r = ${V}.renderer3d; r.camera.pitch = ${pitch}; r.camera.yaw = ${yaw}; r.touch(); 0; })()`); await sleep(900);
	const clip = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.15, y: r.top + r.height * 0.1, width: r.width * 0.7, height: r.height * 0.8 }; })()`);
	const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
	writeFileSync(`${shotDir}/tune-${name}-${st}.png`, Buffer.from(shot.result.data, 'base64'));
	console.log('saved', name, st);
}
process.exit(0);
