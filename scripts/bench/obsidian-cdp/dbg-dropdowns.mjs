import { connect } from './cdp-lib.mjs';
const main = await connect();
const { ev, sleep } = main;
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
console.log(JSON.stringify(await st.ev(`[...document.querySelectorAll('.vertical-tab-content .setting-item')].filter((e) => e.querySelector('select')).map((e) => [e.querySelector('.setting-item-name').textContent.trim(), [...e.querySelectorAll('option')].map((o) => o.value + '=' + o.text), e.querySelector('select').value])`), null, 1));
process.exit(0);
