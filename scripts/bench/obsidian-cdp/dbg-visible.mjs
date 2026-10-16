import { connect } from './cdp-lib.mjs';
const main = await connect(); const { ev, sleep } = main;
const S = `app.plugins.plugins['speed-graph'].graphSettings`;
const probe = async (label) => {
  await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(1800);
  const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
  const r = await st.ev(`(() => { const want = ['Animate skin effects', 'Slowly rotate the 3D view', 'Effects speed', 'Glow strength', 'Background brightness', 'Field of view', 'Depth fade', 'Node colour', 'Link colour', 'Background colour', 'Brightness']; const out = {}; for (const row of document.querySelectorAll('.vertical-tab-content .setting-item')) { const n = row.querySelector('.setting-item-name')?.textContent.trim(); if (want.includes(n)) out[n] = row.checkVisibility ? row.checkVisibility() : row.offsetHeight > 0; } const heads = [...document.querySelectorAll('.vertical-tab-content .setting-item-heading, .vertical-tab-content .setting-group-heading')].map((e) => ({ t: e.textContent.trim(), v: e.checkVisibility() })); return { rows: out, headings: heads.filter((h) => h.t === '3D camera') }; })()`);
  console.log(label, JSON.stringify(r)); st.close(); await ev(`app.setting.close(); 0`); await sleep(500);
};
await ev(`(() => { ${S}.skin = 'default'; ${S}.view3d = false; app.plugins.plugins['speed-graph'].settingsListeners.forEach((cb) => cb()); })()`); await sleep(1500);
await probe('default skin, 2D:');
await ev(`(() => { ${S}.skin = 'brain'; app.plugins.plugins['speed-graph'].settingsListeners.forEach((cb) => cb()); })()`); await sleep(1000);
await probe('brain skin, 2D:');
await ev(`(() => { ${S}.skin = 'default'; ${S}.view3d = true; ${S}.look.useNodeColour = true; app.plugins.plugins['speed-graph'].settingsListeners.forEach((cb) => cb()); })()`); await sleep(1500);
await probe('default skin, 3D, custom node colour on:');
main.close();
