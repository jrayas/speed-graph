import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOOK, LOOK_RANGES, adjustRgb, mergeLook, parseSimpleColour, rgbToCss, scaleAlpha, type Rgb } from '../src/render/appearance';

test('neutral settings leave a colour exactly as it was', () => {
	for (const c of [[0, 0, 0], [255, 255, 255], [143, 176, 255], [12, 200, 77]] as Rgb[]) {
		assert.deepEqual(adjustRgb(c, 1, 1), c);
	}
});

test('brightness scales, clamps, and 0 gives black', () => {
	assert.deepEqual(adjustRgb([100, 150, 200], 0.5, 1), [50, 75, 100]);
	assert.deepEqual(adjustRgb([100, 150, 200], 2, 1), [200, 255, 255]);
	assert.deepEqual(adjustRgb([100, 150, 200], 0, 1), [0, 0, 0]);
	assert.deepEqual(adjustRgb([255, 255, 255], 2.5, 1), [255, 255, 255]);
});

test('brightness is monotonic: a higher setting is never darker', () => {
	let last = -1;
	for (let b = 0.2; b <= 2.5; b += 0.1) {
		const [r, g, bl] = adjustRgb([90, 120, 160], b, 1);
		const sum = r + g + bl;
		assert.ok(sum >= last, `dropped at ${b}`);
		last = sum;
	}
});

test('saturation 0 gives grey, 1 keeps the colour, 2 pushes it apart', () => {
	const grey = adjustRgb([200, 100, 50], 1, 0);
	assert.ok(grey[0] === grey[1] && grey[1] === grey[2]);
	assert.deepEqual(adjustRgb([200, 100, 50], 1, 1), [200, 100, 50]);
	const vivid = adjustRgb([200, 100, 50], 1, 2);
	assert.ok(vivid[0] - vivid[2] > 200 - 50);
});

test('parsing simple colour strings', () => {
	assert.deepEqual(parseSimpleColour('#fff'), { rgb: [255, 255, 255], alpha: 1 });
	assert.deepEqual(parseSimpleColour('#ff8800'), { rgb: [255, 136, 0], alpha: 1 });
	assert.deepEqual(parseSimpleColour('rgb(10, 20, 30)'), { rgb: [10, 20, 30], alpha: 1 });
	assert.deepEqual(parseSimpleColour('rgba(10,20,30,0.5)'), { rgb: [10, 20, 30], alpha: 0.5 });
	assert.deepEqual(parseSimpleColour('rgb(300 -5 30 / 50%)'), { rgb: [255, 0, 30], alpha: 0.5 });
	assert.equal(parseSimpleColour('hsl(10, 50%, 50%)'), null);
	assert.equal(parseSimpleColour('red'), null);
	assert.equal(parseSimpleColour(''), null);
});

test('css output and alpha scaling', () => {
	assert.equal(rgbToCss([1, 2, 3]), 'rgb(1, 2, 3)');
	assert.equal(rgbToCss([1, 2, 3], 0.25), 'rgba(1, 2, 3, 0.25)');
	assert.equal(scaleAlpha(0.8, 2), 1);
	assert.equal(scaleAlpha(0.8, 0), 0);
	assert.ok(Math.abs(scaleAlpha(0.4, 0.5) - 0.2) < 1e-12);
});

test('mergeLook: defaults, clamping, bad types and colour validation', () => {
	assert.deepEqual(mergeLook(null), DEFAULT_LOOK);
	assert.deepEqual(mergeLook([1, 2]), DEFAULT_LOOK);
	const m = mergeLook({ brightness: 99, saturation: -4, labelSize: 'big', fov: 5, nodeColour: '#ABCDEF', linkColour: 'blue', useNodeColour: true, useLinkColour: 'yes', backgroundBrightness: NaN });
	assert.equal(m.brightness, LOOK_RANGES.brightness[1]);
	assert.equal(m.saturation, 0);
	assert.equal(m.labelSize, DEFAULT_LOOK.labelSize);
	assert.equal(m.fov, LOOK_RANGES.fov[0]);
	assert.equal(m.nodeColour, '#abcdef');
	assert.equal(m.linkColour, DEFAULT_LOOK.linkColour);
	assert.equal(m.useNodeColour, true);
	assert.equal(m.useLinkColour, false);
	assert.equal(m.backgroundBrightness, DEFAULT_LOOK.backgroundBrightness);
});

test('every default sits inside its own range', () => {
	for (const [key, [min, max]] of Object.entries(LOOK_RANGES)) {
		const v = DEFAULT_LOOK[key as keyof typeof LOOK_RANGES];
		assert.ok(v >= min && v <= max, key);
	}
});
