// Mouse buttons and click-to-focus local graph, with real mouse events. Usage: node obs-mouse.mjs
import { connect } from './cdp-lib.mjs';
const main = await connect();
const { send, ev, sleep } = main;
const out = {};
await ev(`app.plugins.setEnable(true)`); await sleep(2000);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`app.workspace.getLeavesOfType('speed-graph-view').forEach((l) => l.detach())`); await sleep(500);
await ev(`app.commands.executeCommandById('speed-graph:open-graph')`);
const V = `app.workspace.getLeavesOfType('speed-graph-view')[0].view`;
const settled = async () => { for (let i = 0; i < 400; i++) { await sleep(250); if (await ev(`(() => { const l = app.workspace.getLeavesOfType('speed-graph-view')[0]; return !!l && l.view.dim === 2 && l.view.settled && l.view.sub !== null; })()`)) return true; } return false; };
out.settled = await settled(); await sleep(1500);
const mouse = (type, x, y, button = 'none', buttons = 0, clickCount = 0, modifiers = 0) => send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount, modifiers });
const canvasRect = () => ev(`(() => { const r = ${V}.canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
const tf = () => ev(`(() => { const t = ${V}.transform; return [Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10, Math.round(t.k * 1000) / 1000]; })()`);
const drag = async (x, y, dx, dy, button) => { const b = button === 'right' ? 2 : 1; await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, button, b, 1); for (let i = 1; i <= 8; i++) await mouse('mouseMoved', x + (dx * i) / 8, y + (dy * i) / 8, button, b); await mouse('mouseReleased', x + dx, y + dy, button, 0, 1); await sleep(300); };
await ev(`(() => { ${V}.autoFit = false; window.__opens = []; app.workspace.on('file-open', (f) => window.__opens.push(f?.path ?? null)); 0; })()`);
const rect = await canvasRect();
// an empty spot: scan for a point with no node under it, away from the panel
const empty = await ev(`(() => { const v = ${V}; for (let y = 40; y < 300; y += 20) for (let x = 40; x < 300; x += 20) if (v.hitTest(x, y) < 0) return [x, y]; return null; })()`);
out.emptySpot = empty;
const ex = rect.left + empty[0], ey = rect.top + empty[1];
await ev(`(() => { window.__ctx = []; ${V}.canvas.addEventListener('contextmenu', (e) => window.__ctx.push(e.defaultPrevented)); 0; })()`);
// ---- setting ON (default): right pans, left does not
const t0 = await tf();
await drag(ex, ey, 90, 50, 'left'); out.leftDragOnEmpty_on = { before: t0, after: await tf() };
await drag(ex, ey, 90, 50, 'right'); out.rightDragOnEmpty_on = { after: await tf() };
const t1 = await tf();
// right-drag that starts ON a note must pan, not move the note
const target = await ev(`(() => { const v = ${V}; let best = -1, bd = 0; for (let i = 0; i < v.capacity; i++) { if (!v.visible[i]) continue; const x = v.renderer.screen[2*i], y = v.renderer.screen[2*i+1]; if (x < 400 || x > v.width - 60 || y < 80 || y > v.height - 60) continue; const d = v.degrees[i]; if (d >= 4 && d <= 9 && v.model.kindOf(i) === 0) { best = i; break; } } return { id: best, x: v.renderer.screen[2*best], y: v.renderer.screen[2*best+1], path: v.model.ids.pathOf(best), hit: v.hitTest(v.renderer.screen[2*best], v.renderer.screen[2*best+1]) }; })()`);
out.target = target;
const nodePosBefore = await ev(`[${V}.positions[2*${target.id}], ${V}.positions[2*${target.id}+1]]`);
await drag(rect.left + target.x, rect.top + target.y, 60, 30, 'right');
out.rightDragStartingOnNote = { transformChanged: JSON.stringify(await tf()) !== JSON.stringify(t1), noteMoved: JSON.stringify(await ev(`[${V}.positions[2*${target.id}], ${V}.positions[2*${target.id}+1]]`)) !== JSON.stringify(nodePosBefore) };
// right click: no browser menu
await mouse('mousePressed', ex, ey, 'right', 2, 1); await mouse('mouseReleased', ex, ey, 'right', 0, 1); await sleep(200);
out.contextMenuSuppressed = await ev(`JSON.stringify(window.__ctx)`);
// left click on a note opens it (local graph is off)
const leavesBefore = await ev(`app.workspace.getLeavesOfType('markdown').length`);
const tx = rect.left + (await ev(`${V}.renderer.screen[2*${target.id}]`)), ty = rect.top + (await ev(`${V}.renderer.screen[2*${target.id}+1]`));
await mouse('mouseMoved', tx, ty); await mouse('mousePressed', tx, ty, 'left', 1, 1); await mouse('mouseReleased', tx, ty, 'left', 0, 1); await sleep(1200);
out.clickOpensNote = { leavesBefore, leavesAfter: await ev(`app.workspace.getLeavesOfType('markdown').length`), active: await ev(`app.workspace.getActiveFile()?.path ?? null`), expected: target.path };
// back to the graph tab
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('speed-graph-view')[0], { focus: true }); 0`); await sleep(800);
// ---- setting OFF through the real settings page: left pans again, right does nothing
await ev(`app.setting.open(); app.setting.openTabById('speed-graph'); 0`); await sleep(2000);
const st = await connect((t) => t.type === 'page' && t.title.startsWith('Settings'));
const rowFor = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
out.mouseRowFirst = await st.ev(`document.querySelector('.vertical-tab-content .setting-item-name')?.textContent.trim()`);
await st.ev(`(() => { const c = ${rowFor('Also pan with the right mouse button')}.querySelector('.checkbox-container'); if (c.classList.contains('is-enabled')) c.click(); return 'ok'; })()`); await sleep(800);
await ev(`app.setting.close(); 0`); await sleep(500);
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('speed-graph-view')[0], { focus: true }); 0`); await sleep(500);
out.savedOff = await ev(`app.plugins.plugins['speed-graph'].graphSettings.rightButtonPan`);
const r2 = await canvasRect();
const t2 = await tf();
await drag(r2.left + empty[0], r2.top + empty[1], 70, 40, 'left'); const t3 = await tf();
out.leftDragOnEmpty_off = { changed: JSON.stringify(t3) !== JSON.stringify(t2) };
await drag(r2.left + empty[0], r2.top + empty[1], 70, 40, 'right'); out.rightDragOnEmpty_off = { changed: JSON.stringify(await tf()) !== JSON.stringify(t3) };
// turn it back on for the local graph tests
await ev(`(() => { const p = app.plugins.plugins['speed-graph']; p.graphSettings.rightButtonPan = true; 0; })()`);
// ---- local graph by clicking
// independent neighbour count from Obsidian's own link data (markdown notes + unresolved ghosts), no attachments
const expectedFor = (path) => ev(`(() => { const rl = app.metadataCache.resolvedLinks, ul = app.metadataCache.unresolvedLinks; const set = new Set([${JSON.stringify(path)}]); for (const t of Object.keys(rl[${JSON.stringify(path)}] ?? {})) if (t.endsWith('.md')) set.add(t); for (const t of Object.keys(ul[${JSON.stringify(path)}] ?? {})) set.add('\\u0000' + t); for (const src of Object.keys(rl)) if (rl[src][${JSON.stringify(path)}] && src.endsWith('.md')) set.add(src); return set.size; })()`);
const shownCount = () => ev(`(() => { const v = ${V}; let n = 0; for (let i = 0; i < v.capacity; i++) if (v.visible[i]) n++; return n; })()`);
const status = () => ev(`document.querySelector('.speed-graph-status')?.textContent`);
out.allShown = await shownCount();
// turn the local graph on with the real in-graph panel (open it with the header gear)
await ev(`[...document.querySelectorAll('.view-actions .clickable-icon')].find((e) => e.getAttribute('aria-label') === 'Graph settings').click(); 0`); await sleep(400);
out.panelLabel = await ev(`[...document.querySelectorAll('.speed-graph-controls .setting-item-name')].map((e) => e.textContent.trim()).filter((t) => /neighbour/i.test(t))`);
await ev(`(() => { const row = [...document.querySelectorAll('.speed-graph-controls .setting-item')].find((e) => /neighbour/i.test(e.querySelector('.setting-item-name')?.textContent ?? '')); row.querySelector('.checkbox-container').click(); return 'ok'; })()`); await sleep(1800);
await ev(`[...document.querySelectorAll('.view-actions .clickable-icon')].find((e) => e.getAttribute('aria-label') === 'Graph settings').click(); 0`); await sleep(300); // close panel
await settled(); await sleep(800);
out.afterToggle = { shown: await shownCount(), status: await status(), activeNote: await ev(`app.workspace.getActiveFile()?.path ?? null`) };
const clickNode = async (id, opts = {}) => { const r = await canvasRect(); const pos = await ev(`[${V}.renderer.screen[2*${id}], ${V}.renderer.screen[2*${id}+1], ${V}.hitTest(${V}.renderer.screen[2*${id}], ${V}.renderer.screen[2*${id}+1])]`); const x = r.left + pos[0], y = r.top + pos[1]; await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 'left', 1, opts.clickCount ?? 1, opts.modifiers ?? 0); await mouse('mouseReleased', x, y, 'left', 0, opts.clickCount ?? 1, opts.modifiers ?? 0); return pos[2] === id; };
// focus a note whose centre is really clickable (nothing on top of it)
const pickable = await ev(`(() => { const v = ${V}; for (let i = 0; i < v.capacity; i++) { if (!v.visible[i] || v.model.kindOf(i) !== 0) continue; const x = v.renderer.screen[2*i], y = v.renderer.screen[2*i+1]; if (x < 60 || x > v.width - 60 || y < 60 || y > v.height - 60) continue; if (v.hitTest(x, y) === i && v.degrees[i] >= 3) return { id: i, path: v.model.ids.pathOf(i) }; } return null; })()`);
out.pickable = pickable;
const leavesBeforeFocus = await ev(`app.workspace.getLeavesOfType('markdown').length`);
out.clickedHit1 = await clickNode(pickable.id); await sleep(1500); await settled(); await sleep(500);
out.focus1 = { path: pickable.path, shown: await shownCount(), expected: await expectedFor(pickable.path), status: await status(), newTabsOpened: (await ev(`app.workspace.getLeavesOfType('markdown').length`)) - leavesBeforeFocus };
// pick one visible neighbour and click it: the centre moves
const neighbour = await ev(`(() => { const v = ${V}; for (let i = 0; i < v.capacity; i++) { if (!v.visible[i] || i === ${pickable.id} || v.model.kindOf(i) !== 0) continue; const x = v.renderer.screen[2*i], y = v.renderer.screen[2*i+1]; if (v.hitTest(x, y) !== i) continue; return { id: i, path: v.model.ids.pathOf(i) }; } return null; })()`);
out.neighbour = neighbour.path;
out.clickedHit2 = await clickNode(neighbour.id); await sleep(1500); await settled(); await sleep(500);
out.focus2 = { shown: await shownCount(), expected: await expectedFor(neighbour.path), status: await status(), stillSameCentreShown: await ev(`!!${V}.visible[${neighbour.id}]`) };
// double-click opens the note
const leavesBeforeDouble = await ev(`app.workspace.getLeavesOfType('markdown').length`);
await clickNode(neighbour.id, { clickCount: 1 }); await clickNode(neighbour.id, { clickCount: 2 }); await sleep(1500);
out.doubleClick = { opened: (await ev(`app.workspace.getLeavesOfType('markdown').length`)) > leavesBeforeDouble, active: await ev(`app.workspace.getActiveFile()?.path ?? null`) };
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('speed-graph-view')[0], { focus: true }); 0`); await sleep(800);
// toggle off: everything is back
await ev(`[...document.querySelectorAll('.view-actions .clickable-icon')].find((e) => e.getAttribute('aria-label') === 'Graph settings').click(); 0`); await sleep(400);
await ev(`(() => { const row = [...document.querySelectorAll('.speed-graph-controls .setting-item')].find((e) => /neighbour/i.test(e.querySelector('.setting-item-name')?.textContent ?? '')); row.querySelector('.checkbox-container').click(); return 'ok'; })()`); await sleep(1800); await settled();
out.fileOpens = await ev(`JSON.stringify(window.__opens)`);
out.afterToggleOff = { shown: await shownCount(), same: (await shownCount()) === out.allShown };
// ---- the scenario from the user: focus on, click, toggle off, toggle ON AGAIN -> must start fresh, not show the old note
const panelToggle = async () => { await ev(`[...document.querySelectorAll('.view-actions .clickable-icon')].find((e) => e.getAttribute('aria-label') === 'Graph settings').click(); 0`); await sleep(400); await ev(`(() => { const row = [...document.querySelectorAll('.speed-graph-controls .setting-item')].find((e) => /neighbour/i.test(e.querySelector('.setting-item-name')?.textContent ?? '')); row.querySelector('.checkbox-container').click(); return 'ok'; })()`); await sleep(1800); await ev(`[...document.querySelectorAll('.view-actions .clickable-icon')].find((e) => e.getAttribute('aria-label') === 'Graph settings').click(); 0`); await sleep(300); await settled(); await sleep(600); };
await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('speed-graph-view')[0], { focus: true }); 0`); await sleep(600);
out.noteOpenInEditor = await ev(`app.workspace.getActiveFile()?.path ?? null`);
await panelToggle(); // ON (second time)
out.secondOn = { shown: await shownCount(), status: await status(), centreForgotten: await ev(`${V}.localPath === null`) };
const second = await ev(`(() => { const v = ${V}; for (let i = 0; i < v.capacity; i++) { if (!v.visible[i] || v.model.kindOf(i) !== 0) continue; const x = v.renderer.screen[2*i], y = v.renderer.screen[2*i+1]; if (x < 60 || x > v.width - 60 || y < 60 || y > v.height - 60) continue; if (v.hitTest(x, y) === i && v.degrees[i] >= 3 && i !== ${pickable.id}) return { id: i, path: v.model.ids.pathOf(i) }; } return null; })()`);
out.clickedSecond = await clickNode(second.id); await sleep(1500); await settled(); await sleep(500);
out.focusAfterSecondOn = { path: second.path, shown: await shownCount(), expected: await expectedFor(second.path), status: await status() };
await panelToggle(); // OFF
out.secondOff = await shownCount();
await panelToggle(); // ON (third time): fresh again
out.thirdOn = { shown: await shownCount(), status: await status() };
// a saved "on" never comes back after a restart
out.savedFlagBeforeReload = await ev(`app.plugins.plugins['speed-graph'].graphSettings.localGraph`);
await ev(`app.plugins.plugins['speed-graph'].saveData(Object.assign({}, app.plugins.plugins['speed-graph'].graphSettings, { localGraph: true })); 0`); await sleep(600);
await ev(`app.plugins.disablePlugin('speed-graph').then(() => app.plugins.enablePlugin('speed-graph')); 0`); await sleep(3000);
out.localGraphAfterReloadWithSavedTrue = await ev(`app.plugins.plugins['speed-graph'].graphSettings.localGraph`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
