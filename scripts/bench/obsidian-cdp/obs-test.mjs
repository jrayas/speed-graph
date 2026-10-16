import { writeFileSync } from 'node:fs';
const S = process.argv[2];
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('app://'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' && !extra.down ? 0 : 1, clickCount: 1, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${S}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
// Screen position (CSS px) and degree of the biggest hub inside the visible canvas.
const hubInfo = () => ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); const t = v.transform; let best = -1, bd = -1;
  for (let i = 0; i < v.alive.length; i++) { if (!v.alive[i]) continue; const x = v.positions[2*i]*t.k+t.x, y = v.positions[2*i+1]*t.k+t.y; if (x<20||y<20||x>r.width-20||y>r.height-20) continue; if (v.degrees[i] > bd) { bd = v.degrees[i]; best = i; } }
  return { id: best, deg: bd, sx: r.left + v.positions[2*best]*t.k+t.x, sy: r.top + v.positions[2*best+1]*t.k+t.y, k: t.k, tx: t.x, ty: t.y, w: r.width, h: r.height, left: r.left, top: r.top, path: v.host.getGraph().model.ids.pathOf(best) }; })()`);
const out = {};
let h = await hubInfo(); out.hub = h;
// 1. hover
await mouse('mouseMoved', h.sx, h.sy); await sleep(400);
out.hover = await ev(`(() => { const v = ${V}; return { hovered: v.hovered, isHoveringClass: v.canvas.classList.contains('is-hovering') }; })()`);
await shot('t1-hover');
// 2. wheel zoom in at the canvas centre
const cx = h.left + h.w / 2, cy = h.top + h.h / 2;
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -400 }); await sleep(400);
out.zoomAfterWheel = await ev(`(() => { const v = ${V}; return { k: v.transform.k, autoFit: v.autoFit }; })()`);
await shot('t2-zoom');
// 3. pan by dragging empty canvas space
const before = await ev(`(() => { const t = ${V}.transform; return { x: t.x, y: t.y }; })()`);
await mouse('mousePressed', h.left + 30, h.top + h.h - 40); await mouse('mouseMoved', h.left + 90, h.top + h.h - 90, { down: true }); await mouse('mouseReleased', h.left + 90, h.top + h.h - 90); await sleep(300);
const after = await ev(`(() => { const t = ${V}.transform; return { x: t.x, y: t.y }; })()`);
out.panDelta = { dx: +(after.x - before.x).toFixed(1), dy: +(after.y - before.y).toFixed(1) };
// 4. drag a node
h = await hubInfo();
const p0 = await ev(`(() => { const v = ${V}; return [v.positions[2*${h.id}], v.positions[2*${h.id}+1]]; })()`);
await mouse('mousePressed', h.sx, h.sy);
for (let s = 1; s <= 10; s++) { await mouse('mouseMoved', h.sx + s * 8, h.sy + s * 5, { down: true }); await sleep(30); }
await sleep(300);
const during = await ev(`(() => { const v = ${V}; return [v.positions[2*${h.id}], v.positions[2*${h.id}+1]]; })()`);
await mouse('mouseReleased', h.sx + 80, h.sy + 50); await sleep(1500);
out.nodeDrag = { start: p0.map((n) => +n.toFixed(1)), duringDrag: during.map((n) => +n.toFixed(1)), expectedWorldShift: [+(80 / h.k).toFixed(1), +(50 / h.k).toFixed(1)] };
await shot('t4-drag');
// 5. click a node opens the note
h = await hubInfo();
const mdBefore = await ev(`app.workspace.getLeavesOfType('markdown').length`);
await mouse('mouseMoved', h.sx, h.sy); await sleep(200); await mouse('mousePressed', h.sx, h.sy); await mouse('mouseReleased', h.sx, h.sy); await sleep(1200);
out.click = await ev(`(() => ({ markdownLeavesBefore: ${mdBefore}, after: app.workspace.getLeavesOfType('markdown').length, activeFile: app.workspace.getActiveFile()?.path, expected: ${JSON.stringify(h.path)} }))()`);
// 6. go back to the graph tab, open the settings panel
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('speed-graph-view')[0], { focus: true })`); await sleep(500);
await ev(`document.querySelector('.speed-graph-controls-toggle').click()`); await sleep(500);
out.panel = await ev(`(() => ({ open: !document.querySelector('.speed-graph-controls').classList.contains('is-collapsed'), sliders: document.querySelectorAll('.speed-graph-controls input[type=range]').length, toggles: document.querySelectorAll('.speed-graph-controls .checkbox-container').length }))()`);
await shot('t6-panel');
// 7. change a slider (link distance) and confirm the layout reacts
const spread = () => ev(`(() => { const v = ${V}; let s = 0, n = 0; for (let i = 0; i < v.alive.length; i++) if (v.alive[i]) { s += Math.hypot(v.positions[2*i], v.positions[2*i+1]); n++; } return s / n; })()`);
const s0 = await spread();
await ev(`(() => { const sl = [...document.querySelectorAll('.speed-graph-controls .setting-item')].find(e => e.textContent.includes('Link distance')).querySelector('input[type=range]'); sl.value = 120; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await sleep(4000);
const s1 = await spread();
out.sliderLinkDistance = { meanRadiusBefore: +s0.toFixed(1), after120: +s1.toFixed(1), status: await ev(`document.querySelector('.speed-graph-status').textContent`) };
await shot('t7-slider');
// 8. console errors captured? check performance of the draw in the real app
out.drawMs = await ev(`${V}.renderer.lastDrawMs`);
console.log(JSON.stringify(out, null, 1));
ws.close();
