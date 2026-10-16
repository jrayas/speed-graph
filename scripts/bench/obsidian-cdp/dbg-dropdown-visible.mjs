import { connect } from './cdp-lib.mjs';
const main = await connect();
const { ev, sleep } = main;
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
console.log(JSON.stringify(await st.ev(`[...document.querySelectorAll('.vertical-tab-content .setting-item')].filter((r) => r.querySelector('select')).map((r) => ({ name: r.querySelector('.setting-item-name').textContent.trim(), selects: [...r.querySelectorAll('select')].map((s) => { const b = s.getBoundingClientRect(); const cs = getComputedStyle(s); return { options: s.options.length, w: Math.round(b.width), h: Math.round(b.height), visibility: cs.visibility, display: cs.display, position: cs.position, opacity: cs.opacity, cls: s.className, aria: s.getAttribute('aria-hidden'), tab: s.tabIndex }; }) }))`), null, 1));
process.exit(0);
