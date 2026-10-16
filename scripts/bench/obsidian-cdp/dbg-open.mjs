import { connect } from './cdp-lib.mjs';
const { ev, sleep } = await connect();
await ev(`app.plugins.setEnable(true)`); await sleep(2500);
await ev(`(() => { window.__errs = []; const ce = console.error; console.error = (...a) => { window.__errs.push(a.map(String).join(' ').slice(0, 300)); ce.apply(console, a); }; window.addEventListener('error', (e) => window.__errs.push('error: ' + e.message)); 0; })()`);
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
for (let t = 0; t < 3; t++) { await sleep(5000); console.log(t * 5 + 5, 's:', JSON.stringify(await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; const v = l?.view; return { status: document.querySelector('.speed-graph-status')?.textContent, settled: v?.settled, sub: v?.sub?.ids?.length ?? null, modelNodes: app.plugins.plugins['speed-graph'].vaultGraph?.model?.nodeCount ?? null, resolved: Object.keys(app.metadataCache.resolvedLinks).length }; })()`))); }
console.log('errors', await ev(`JSON.stringify(window.__errs)`));
process.exit(0);
