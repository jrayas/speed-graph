// Try force values on a flat pack layout without rebuilding. Usage: node obs-forces2d.mjs <dir> <key> <label> <json forces override>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp-lib.mjs';
const [shotDir, key, label, json] = process.argv.slice(2);
const main = await connect();
const { send, ev, sleep } = main;
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const settled = async () => { for (let i = 0; i < 500; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('fast-graph-view')[0]; return !!l && l.view.dim === 2 && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
await ev(`(() => { const p = app.plugins.plugins['fast-graph']; const s = p.graphSettings; s.activeLayout = ${JSON.stringify(key)}; s.view3d = false; const e = ${V}.host.packs.find(${JSON.stringify(key)}); Object.assign(e.layout.forces, ${json}); s.shapeStrength = e.layout.forces.shapeStrength; p.settingsListeners.forEach((f) => f()); 0; })()`);
await sleep(800); await settled(); await sleep(5000);
const clip = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
writeFileSync(`${shotDir}/forces-${label}.png`, Buffer.from(shot.result.data, 'base64'));
console.log('saved', label);
process.exit(0);
