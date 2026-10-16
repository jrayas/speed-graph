/**
 * Which mouse button does what in the graph, as a plain function so it can be tested.
 *
 * The left button clicks and drags notes, and drags the view when pressed on empty space. With
 * `rightButtonPans` the right and the middle button ALSO drag the view (a drag that starts on a
 * note pans instead of moving the note). A touch screen has no right button, so a finger pans
 * with one finger whatever the setting says.
 */
export type PointerAction =
	/** Do nothing with this press. */
	| 'ignore'
	/** Pressed on a note: click it, or drag it. */
	| 'node'
	/** Drag the view (flat). */
	| 'pan'
	/** 3D: turn the camera. */
	| 'orbit'
	/** 3D: slide the camera. */
	| 'slide';

export interface PointerPress {
	dim: 2 | 3;
	pointerType: string;
	/** 0 left, 1 middle, 2 right. Ignored for touch and pen. */
	button: number;
	rightButtonPans: boolean;
	/** A note is under the pointer. */
	onNode: boolean;
	/** A modifier key (Shift, Alt, Ctrl, Cmd) is held. */
	modifier: boolean;
}

export function pointerAction(p: PointerPress): PointerAction {
	const button = p.pointerType === 'mouse' ? p.button : 0;
	if (p.dim === 3) {
		if (button === 1 || button === 2) return 'slide';
		if (button !== 0) return 'ignore';
		if (p.onNode) return 'node';
		return p.modifier ? 'slide' : 'orbit';
	}
	if (button === 0) return p.onNode ? 'node' : 'pan';
	if (button === 1 || button === 2) return p.rightButtonPans ? 'pan' : 'ignore';
	return 'ignore';
}
