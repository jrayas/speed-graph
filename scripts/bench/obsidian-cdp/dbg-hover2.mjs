import { connect } from './cdp-lib.mjs';
const { send, ev, sleep, close } = await connect();
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
const state = () => ev(`(() => { const v = ${V}; return { drag: v.drag && v.drag.kind, pointers: v.pointers.size, hovered: v.hovered, cardHidden: document.querySelector('.fast-graph-hover').classList.contains('is-hidden') }; })()`);
const rect = await ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
// right drag slide, then re-fit and hover the busiest node (same order as the failing run)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.l + 40, y: rect.t + rect.h - 40, button: 'right', buttons: 2, clickCount: 1 });
for (let i = 1; i <= 10; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.l + 40 + i * 10, y: rect.t + rect.h - 40, button: 'right', buttons: 2 }); await sleep(20); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.l + 140, y: rect.t + rect.h - 40, button: 'right', buttons: 0, clickCount: 1 }); await sleep(300);
console.log('after slide', await state());
await ev(`${V}.renderer3d.fit(); 0`); await sleep(800);
const hub = await ev(`(() => { const v = ${V}; const r3 = v.renderer3d; let best = -1, bd = -1; for (let i = 0; i < v.visible.length; i++) { if (!v.visible[i]) continue; const p = r3.nodeScreen(i); if (!p || p.x < 80 || p.y < 80 || p.x > v.width - 80 || p.y > v.height - 80) continue; if (v.degrees[i] > bd) { bd = v.degrees[i]; best = i; } } const r = v.canvas.getBoundingClientRect(); const s = r3.nodeScreen(best); return { id: best, x: r.left + s.x, y: r.top + s.y, pick: r3.pick(s.x, s.y) }; })()`);
console.log('hub', hub);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hub.x, y: hub.y, button: 'none', buttons: 0 });
for (const ms of [30, 150, 500]) { await sleep(ms); console.log('+' + ms, await state()); }
// one more tiny move at the same place: does hover appear?
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hub.x + 1, y: hub.y + 1, button: 'none', buttons: 0 }); await sleep(200);
console.log('after a 1px nudge', await state());
close();
