import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, mergeSettings, toLayoutParams } from '../src/settings/settings';

test('defaults map to the d3 defaults', () => {
	const p = toLayoutParams(DEFAULT_SETTINGS);
	assert.equal(p.repelStrength, -30);
	assert.equal(p.linkDistance, 30);
	assert.equal(p.centerStrength, 1);
	assert.ok(Math.abs(p.gravity - 0.2) < 1e-12);
	assert.equal(p.repelMaxDistance, Infinity);
});

test('mergeSettings keeps valid values and clamps or ignores bad ones', () => {
	const s = mergeSettings({ repelForce: 500, linkDistance: 'far', showArrows: true, animate: 'yes', nodeSize: 2 });
	assert.equal(s.repelForce, 20);
	assert.equal(s.linkDistance, DEFAULT_SETTINGS.linkDistance);
	assert.equal(s.showArrows, true);
	assert.equal(s.animate, true);
	assert.equal(s.nodeSize, 2);
});

test('mergeSettings copes with null, arrays and NaN', () => {
	assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
	assert.deepEqual(mergeSettings([1, 2]), DEFAULT_SETTINGS);
	assert.equal(mergeSettings({ centerForce: NaN }).centerForce, DEFAULT_SETTINGS.centerForce);
});

test('filters, local graph and groups are validated', () => {
	const s = mergeSettings({
		search: 'tag:#x', showAttachments: true, showOrphans: false, hideUnresolved: true,
		localGraph: true, localDepth: 9.4,
		groups: [{ query: 'a', color: '#ff0000' }, { query: 'b', color: 'red; drop' }, { query: 5, color: '#fff' }, null, 'x'],
	});
	assert.equal(s.search, 'tag:#x');
	assert.equal(s.showAttachments, true);
	assert.equal(s.showOrphans, false);
	assert.equal(s.hideUnresolved, true);
	assert.equal(s.localGraph, false); // the focus toggle is for one session only: a saved "on" is ignored
	assert.equal(s.localDepth, 5);
	assert.deepEqual(s.groups, [{ query: 'a', color: '#ff0000' }]);
	assert.deepEqual(mergeSettings({ groups: 'nope' }).groups, []);
	assert.equal(mergeSettings({ localDepth: 0 }).localDepth, 1);
});

test('zoomed-out bubbles are off by default but can be switched on', () => {
	assert.equal(DEFAULT_SETTINGS.clusters, false);
	assert.equal(mergeSettings(null).clusters, false);
	assert.equal(mergeSettings({ clusters: true }).clusters, true);
	assert.equal(mergeSettings({ clusters: 'yes' }).clusters, false);
});

test('skin defaults to the current look; unknown skins fall back; effects are a boolean', () => {
	assert.equal(DEFAULT_SETTINGS.skin, 'default');
	assert.equal(mergeSettings({ skin: 'galaxy' }).skin, 'galaxy');
	assert.equal(mergeSettings({ skin: 'brain' }).skin, 'brain');
	assert.equal(mergeSettings({ skin: 'toString' }).skin, 'default');
	assert.equal(mergeSettings({ skin: 42 }).skin, 'default');
	assert.equal(mergeSettings({ skinEffects: false }).skinEffects, false);
	assert.equal(mergeSettings({ skinEffects: 'no' }).skinEffects, true);
});

test('3D view and auto-rotate are off by default and need real booleans', () => {
	assert.equal(DEFAULT_SETTINGS.view3d, false);
	assert.equal(DEFAULT_SETTINGS.autoRotate, false);
	assert.equal(mergeSettings({ view3d: true }).view3d, true);
	assert.equal(mergeSettings({ view3d: 1 }).view3d, false);
	assert.equal(mergeSettings({ autoRotate: true }).autoRotate, true);
});

test('the look section is merged, validated and independent of the shared defaults', () => {
	assert.equal(DEFAULT_SETTINGS.look.brightness, 1);
	const s = mergeSettings({ look: { brightness: 1.5, nodeColour: '#00ff00', useNodeColour: true, labelSize: 99 } });
	assert.equal(s.look.brightness, 1.5);
	assert.equal(s.look.nodeColour, '#00ff00');
	assert.equal(s.look.useNodeColour, true);
	assert.equal(s.look.labelSize, 24);
	assert.equal(mergeSettings({ look: 'bright' }).look.brightness, 1);
	// changing one merged settings object must not change the defaults or another object
	const a = mergeSettings(null);
	const b = mergeSettings(null);
	a.look.brightness = 2;
	assert.equal(b.look.brightness, 1);
	assert.equal(DEFAULT_SETTINGS.look.brightness, 1);
});

test('shape colours: on by default, and a saved off is kept', () => {
	assert.equal(DEFAULT_SETTINGS.shapeColours, true);
	assert.equal(mergeSettings({}).shapeColours, true);
	assert.equal(mergeSettings({ shapeColours: false }).shapeColours, false);
	assert.equal(mergeSettings({ shapeColours: 'no' }).shapeColours, true); // not a boolean: ignored
});
