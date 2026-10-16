import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerAction, type PointerPress } from '../src/view/pointer-mode';

const base: PointerPress = { dim: 2, pointerType: 'mouse', button: 0, rightButtonPans: true, onNode: false, modifier: false };
const act = (over: Partial<PointerPress>) => pointerAction({ ...base, ...over });

test('flat view: the left button clicks notes and pans empty space; with the setting on the right and middle buttons also pan', () => {
	assert.equal(act({ button: 0, onNode: true }), 'node');
	assert.equal(act({ button: 0, onNode: false }), 'pan');
	assert.equal(act({ button: 2, onNode: false }), 'pan');
	assert.equal(act({ button: 2, onNode: true }), 'pan'); // right-drag over a note still pans, it does not move the note
	assert.equal(act({ button: 1 }), 'pan');
	assert.equal(act({ button: 3 }), 'ignore');
	assert.equal(act({ button: 4 }), 'ignore');
});

test('flat view, setting off: only the left button acts', () => {
	assert.equal(act({ rightButtonPans: false, button: 0, onNode: false }), 'pan');
	assert.equal(act({ rightButtonPans: false, button: 0, onNode: true }), 'node');
	assert.equal(act({ rightButtonPans: false, button: 2 }), 'ignore');
	assert.equal(act({ rightButtonPans: false, button: 1 }), 'ignore');
});

test('touch and pen always pan with one finger, whatever the setting', () => {
	for (const pointerType of ['touch', 'pen']) {
		for (const rightButtonPans of [true, false]) {
			assert.equal(act({ pointerType, rightButtonPans, onNode: false }), 'pan');
			assert.equal(act({ pointerType, rightButtonPans, onNode: true }), 'node');
			assert.equal(act({ pointerType, rightButtonPans, button: 2, onNode: false }), 'pan'); // button is meaningless for touch
		}
	}
});

test('3D: left orbits, right or middle slides, modifier slides, notes are clicked; the setting changes nothing', () => {
	for (const rightButtonPans of [true, false]) {
		const a = (over: Partial<PointerPress>) => act({ dim: 3, rightButtonPans, ...over });
		assert.equal(a({ button: 0 }), 'orbit');
		assert.equal(a({ button: 0, modifier: true }), 'slide');
		assert.equal(a({ button: 0, onNode: true }), 'node');
		assert.equal(a({ button: 0, onNode: true, modifier: true }), 'node');
		assert.equal(a({ button: 2 }), 'slide');
		assert.equal(a({ button: 1 }), 'slide');
		assert.equal(a({ button: 4 }), 'ignore');
	}
	assert.equal(act({ dim: 3, pointerType: 'touch' }), 'orbit');
});
