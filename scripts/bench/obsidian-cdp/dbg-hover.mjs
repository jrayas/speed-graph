import { connect } from './cdp-lib.mjs';
const { send, ev, sleep, close } = await connect();
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const waitSettled = async (dim) => { for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === ${dim} && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
await ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.view3d = true; p.settingsListeners.forEach((cb) => cb()); })()`);
console.log('settled 3d', await waitSettled(3)); await sleep(1000);
const rect = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
const state = () => ev(`(() => { const v = ${V}; return { drag: v.drag && v.drag.kind, pointers: v.pointers.size, hovered: v.hovered }; })()`);
console.log('start', await state());
// find the busiest node on screen
const hub = await ev(`(() => { const v = ${V}; v.renderer3d.fit(); const r3 = v.renderer3d; let best = -1, bd = -1; for (let i = 0; i < v.visible.length; i++) { if (!v.visible[i]) continue; const p = r3.nodeScreen(i); if (!p || p.x < 80 || p.y < 80 || p.x > v.width - 80 || p.y > v.height - 80) continue; if (v.degrees[i] > bd) { bd = v.degrees[i]; best = i; } } const r = v.canvas.getBoundingClientRect(); const s = r3.nodeScreen(best); return { id: best, x: r.left + s.x, y: r.top + s.y }; })()`);
await sleep(600);
const hub1 = await ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); const s = v.renderer3d.nodeScreen(${hub.id}); return { x: r.left + s.x, y: r.top + s.y, pick: v.renderer3d.pick(s.x, s.y) }; })()`);
console.log('hub', hub.id, 'screen', hub1);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hub1.x, y: hub1.y, button: 'none', buttons: 0 });
for (const ms of [50, 200, 600]) { await sleep(ms); console.log('hover after fresh move +' + ms, await state()); }
// now do a right-drag and look at the state afterwards
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.l + 60, y: rect.t + rect.h - 60, button: 'right', buttons: 2, clickCount: 1 });
console.log('after right press', await state());
for (let i = 1; i <= 5; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.l + 60 + i * 10, y: rect.t + rect.h - 60, button: 'right', buttons: 2 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.l + 110, y: rect.t + rect.h - 60, button: 'right', buttons: 0, clickCount: 1 });
await sleep(300);
console.log('after right release', await state());
close();
