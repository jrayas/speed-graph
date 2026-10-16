const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('app://'));
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
const mouse = (type, x, y, down) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: down ? 1 : 0, clickCount: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('speed-graph-view')[0], { focus: true })`); await sleep(500);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
await ev(`${V}.fit(true)`); await sleep(500);
const info = await ev(`(() => { const v = ${V}; const r = v.canvas.getBoundingClientRect(); const t = v.transform; let best=-1,bd=-1; for (let i=0;i<v.alive.length;i++){ if(!v.alive[i])continue; const x=v.positions[2*i]*t.k+t.x,y=v.positions[2*i+1]*t.k+t.y; if(x<60||y<60||x>r.width-60||y>r.height-60)continue; if(v.degrees[i]>bd){bd=v.degrees[i];best=i;} } return { id: best, sx: r.left+v.positions[2*best]*t.k+t.x, sy: r.top+v.positions[2*best+1]*t.k+t.y, k: t.k, left: r.left, top: r.top }; })()`);
console.log('target', JSON.stringify(info));
await mouse('mousePressed', info.sx, info.sy, true);
console.log('after press: drag =', JSON.stringify(await ev(`${V}.drag`)));
for (let s = 1; s <= 5; s++) {
  const px = info.sx + s * 16, py = info.sy + s * 10;
  await mouse('mouseMoved', px, py, true); await sleep(250);
  const r = await ev(`(() => { const v = ${V}; const d = v.drag; const t = v.transform; const w = { x: (${px} - v.canvas.getBoundingClientRect().left - t.x) / t.k, y: (${py} - v.canvas.getBoundingClientRect().top - t.y) / t.k }; return { drag: d && { id: d.id, moved: d.moved }, nodePos: d && [v.positions[2*d.id], v.positions[2*d.id+1]], pointerWorld: [w.x, w.y], k: t.k, autoFit: v.autoFit }; })()`);
  console.log('move', s, JSON.stringify(r));
}
await mouse('mouseReleased', info.sx + 80, info.sy + 50, false);
ws.close();
