import { connect } from './cdp-lib.mjs';
const { send, ev, sleep, close } = await connect();
const logs = [];
const ws = null;
await send('Runtime.enable');
// the helper's onmessage only resolves ids; add our own listener through a second connection
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('app://'));
const sock = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (sock.onopen = r));
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600)); };
sock.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
await sleep(500);
console.log('before', await ev(`app.plugins.plugins['speed-graph'].graphSettings.view3d`), 'leaves', await ev(`app.workspace.getLeavesOfType('speed-graph-view').length`));
await ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.view3d = true; p.settingsListeners.forEach((cb) => cb()); })()`);
await sleep(2500);
console.log('after view3d now:', await ev(`app.plugins.plugins['speed-graph'].graphSettings.view3d`), 'dim', await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return l ? l.view.dim : 'no view'; })()`));
console.log(logs.join('\n') || '(no console output)');
console.log('webgl2:', await ev(`(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return null; return { version: g.getParameter(g.VERSION), pointRange: [...g.getParameter(g.ALIASED_POINT_SIZE_RANGE)] }; })()`));
sock.close(); close();
