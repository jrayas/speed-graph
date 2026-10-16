import { connect } from './cdp-lib.mjs';
const { ev, sleep } = await connect();
const V = `app.workspace.getLeavesOfType('fast-graph-view')[0].view`;
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('fast-graph-view')[0], { focus: true }); 0`); await sleep(500);
await ev(`(() => { const v = ${V}; v.localPath = null; v.host.settings.localGraph = true; v.scheduleFilter(); 0; })()`); await sleep(2500);
console.log('no centre:', await ev(`(() => { const v = ${V}; let n = 0; for (let i = 0; i < v.capacity; i++) if (v.visible[i]) n++; return { shown: n, status: document.querySelector('.fast-graph-status')?.textContent }; })()`));
await ev(`(() => { const v = ${V}; v.host.settings.localGraph = false; v.scheduleFilter(); 0; })()`); await sleep(1500);
console.log('off again:', await ev(`(() => { const v = ${V}; let n = 0; for (let i = 0; i < v.capacity; i++) if (v.visible[i]) n++; return n; })()`));
process.exit(0);
