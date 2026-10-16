import { Notice, PluginSettingTab, type App, type Plugin, type SettingDefinition, type SettingDefinitionItem } from 'obsidian';
import { DEFAULT_LOOK, LOOK_RANGES, type Look, type LookNumberKey } from '../render/appearance';
import { DRIFT_AMOUNT_RANGE, DRIFT_SPEED_RANGE } from '../render/drift';
import { ELECTRON_AMOUNT_RANGE, ELECTRON_SPEED_RANGE } from '../render/electrons';
import { MOTION_KINDS, MOTION_SPEED_RANGES, type Motion } from '../render/motion';
import { SKIN_NAMES } from '../render/skins';
import type { PackStore } from '../packs/store';
import { RANGES, type GraphSettings } from './settings';

export interface SettingsTabHost {
	settings: GraphSettings;
	packs: PackStore;
	/** Reads a text file from the vault by path, or null if there is none. */
	readVaultFile(path: string): Promise<string | null>;
	/** Call after changing a setting: saves it and updates open graph views. */
	changed(): void;
	clearCache(): Promise<void>;
}

type Range = readonly [number, number, number];

/**
 * The plugin's settings page (Obsidian's declarative settings, 1.13 and later). It is the control
 * centre: features, skin, brightness and colour, nodes, labels, layout forces and the 3D camera.
 * Everything extra is off by default and every number starts neutral, so the graph looks and behaves
 * as it does without visiting this page.
 */
export class FastGraphSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly host: SettingsTabHost,
	) {
		super(app, plugin);
	}

	private get s(): GraphSettings {
		return this.host.settings;
	}

	private get skinned(): boolean {
		return this.s.skin !== 'default';
	}

	private slider(name: string, desc: string, key: string, range: Range, visible?: () => boolean, format?: (v: number) => string): SettingDefinition {
		return {
			name,
			desc,
			control: { type: 'slider', key, min: range[0], max: range[1], step: range[2], ...(format ? { displayFormat: format } : {}) },
			...(visible ? { visible } : {}),
		};
	}

	private look(name: string, desc: string, key: LookNumberKey, visible?: () => boolean, format?: (v: number) => string): SettingDefinition {
		return this.slider(name, desc, `look.${key}`, LOOK_RANGES[key], visible, format);
	}

	private speed(name: string, desc: string, key: keyof Motion['speeds'], kind: Motion['kind'], format: (v: number) => string): SettingDefinition {
		const [min, max, step] = MOTION_SPEED_RANGES[key];
		return { name, desc, control: { type: 'slider', key: `motion.speeds.${key}`, min, max, step, displayFormat: format }, visible: () => this.s.motion.kind === kind };
	}

	private toggle(name: string, desc: string, key: string, visible?: () => boolean): SettingDefinition {
		return { name, desc, control: { type: 'toggle', key }, ...(visible ? { visible } : {}) };
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const percent = (v: number) => `${Math.round(v * 100)}%`;
		const degrees = (v: number) => `${Math.round(v)}°`;
		const look = (): Look => this.s.look;
		return [
			{
				type: 'group',
				heading: 'Mouse',
				items: [
					this.toggle('Also pan with the right mouse button', 'The left button clicks notes and drags the view, as before. With this on, the right (or middle) button also drags the view, and the right button opens no menu. Touch screens pan with one finger either way.', 'rightButtonPan'),
				],
			},
			{
				type: 'group',
				heading: 'Features',
				items: [
					this.toggle('Zoomed-out bubbles', 'When zoomed out on a big graph, show crowded areas as bubbles with a note count. They split into real nodes as you zoom in. Off by default.', 'clusters'),
					this.toggle('Moving electrons on links', 'Small bright dots with a fading tail travel along the links from each note to the notes it links to, like current in a circuit. Works in the flat and the 3D view. It uses a share of the links on big graphs, so it stays smooth. Off by default.', 'electrons.enabled'),
					{
						name: 'Electron speed',
						desc: 'How fast they travel, in pixels per second. Long and short links look the same speed.',
						control: { type: 'slider', key: 'electrons.speed', min: ELECTRON_SPEED_RANGE[0], max: ELECTRON_SPEED_RANGE[1], step: ELECTRON_SPEED_RANGE[2], displayFormat: (v: number) => `${Math.round(v)} px/s` },
						visible: () => this.s.electrons.enabled,
					},
					{
						name: 'Electron amount',
						desc: 'How many links carry an electron. Big graphs are capped, so 100% never means every link.',
						control: { type: 'slider', key: 'electrons.amount', min: ELECTRON_AMOUNT_RANGE[0], max: ELECTRON_AMOUNT_RANGE[1], step: ELECTRON_AMOUNT_RANGE[2], displayFormat: percent },
						visible: () => this.s.electrons.enabled,
					},
					this.toggle('Gentle drift (alive graph)', 'Every note wanders a few pixels on its own slow path, so the graph looks alive even when you are not touching it. It only changes how the graph is drawn: the real layout, saved positions and shapes are never moved. The note under your pointer holds still. Off by default.', 'drift.enabled'),
					{
						name: 'Drift amount',
						desc: 'How far each note wanders, from about 1 to 7 pixels.',
						control: { type: 'slider', key: 'drift.amount', min: DRIFT_AMOUNT_RANGE[0], max: DRIFT_AMOUNT_RANGE[1], step: DRIFT_AMOUNT_RANGE[2], displayFormat: percent },
						visible: () => this.s.drift.enabled,
					},
					{
						name: 'Drift speed',
						desc: 'How fast they wander. Low is a slow sway; high is a lively shimmer.',
						control: { type: 'slider', key: 'drift.speed', min: DRIFT_SPEED_RANGE[0], max: DRIFT_SPEED_RANGE[1], step: DRIFT_SPEED_RANGE[2], displayFormat: percent },
						visible: () => this.s.drift.enabled,
					},
					this.toggle('3D view (experimental)', 'Show the graph in three dimensions. Drag to turn, scroll to zoom, right-drag or hold Shift to slide. It needs WebGL2. Off by default.', 'view3d'),
				],
			},
			{
				type: 'group',
				heading: 'Appearance',
				items: [
					{
						name: 'Skin',
						desc: 'A complete look drawn by code, with no image files. The default skin keeps your Obsidian theme.',
						control: { type: 'dropdown', key: 'skin', options: SKIN_NAMES },
					},
					this.toggle('Animate skin effects', 'Twinkling stars and signals travelling along links. Stays off if your system asks for reduced motion.', 'skinEffects', () => this.skinned),
					this.toggle('Slowly rotate the 3D view', 'Turns the 3D view gently while you are not touching it.', 'autoRotate', () => this.s.view3d),
					this.look('Effects speed', 'How fast twinkling, signals and rotation run. 0 freezes them.', 'effectsSpeed', () => this.skinned || this.s.view3d, percent),
				],
			},
			{
				type: 'group',
				heading: 'Shapes and packs',
				items: [
					{
						name: 'Shape layout',
						desc: 'Pull the graph into a shape, such as a heart, a brain or a galaxy, with its own colours. The layout also sets the flat or 3D view. Choose None to go back to the normal graph.',
						control: { type: 'dropdown', key: 'activeLayout', options: this.layoutOptions() },
					},
					this.slider('Shape strength', 'How firmly notes are pulled into the shape. Low keeps more of the link structure; high follows the shape closely.', 'shapeStrength', RANGES.shapeStrength, () => this.s.activeLayout !== '', percent),
					this.toggle('Show the shape as a faint guide', 'Draws the shape of the active layout as a faint dotted outline behind the notes (flat view). Line-art shapes such as a web or a honeycomb ask for it themselves. Off by default.', 'shapeGuide', () => this.s.activeLayout !== ''),
					{
						name: 'Import a pack',
						desc: this.importReport || 'Paste the text of a pack file below, then choose this row. You can also type the path of a pack file that is in your vault. Packs hold colours, shapes and layouts, never code.',
						action: () => void this.importPack(),
					},
					{ name: 'Pack text or vault path', control: { type: 'textarea', key: 'importText', placeholder: '{ "format": "fast-graph-pack", ... }', rows: 6 } },
					...this.packRows(),
				],
			},
			{
				type: 'group',
				heading: 'Motion',
				items: [
					{
						name: 'Effect',
						desc: 'A gentle movement of the whole graph, in the flat and the 3D view. It costs almost nothing, however big the graph. Stops by itself if your system asks for reduced motion. Off by default.',
						control: { type: 'dropdown', key: 'motion.kind', options: MOTION_KINDS },
					},
					{
						name: 'Strength',
						desc: 'How big the movement is.',
						control: { type: 'slider', key: 'motion.strength', min: 0, max: 1, step: 0.05, displayFormat: percent },
						visible: () => this.s.motion.kind !== 'off',
					},
					this.speed('Heart rate', 'Beats per minute.', 'heartbeat', 'heartbeat', (v) => `${Math.round(v)} bpm`),
					{
						name: 'Double beat',
						desc: 'A "lub-dub": a strong beat followed by a softer one. Off gives a single thump.',
						control: { type: 'toggle', key: 'motion.doubleBeat' },
						visible: () => this.s.motion.kind === 'heartbeat',
					},
					{
						name: 'Beat faster when I am active',
						desc: 'The heart speeds up by up to 60 beats a minute while you open and edit notes, then slows down again.',
						control: { type: 'toggle', key: 'motion.activityLinked' },
						visible: () => this.s.motion.kind === 'heartbeat',
					},
					this.speed('Breathing rate', 'Breaths per minute.', 'breathe', 'breathe', (v) => `${Math.round(v)} per min`),
					this.speed('Vibration speed', 'Shakes per second.', 'vibrate', 'vibrate', (v) => `${Math.round(v)} per sec`),
					this.speed('Panic cycles', 'How often panic builds up and breaks, per minute.', 'panic', 'panic', (v) => `${Math.round(v)} per min`),
					this.speed('Flinch rate', 'How often the graph gets a fright, per minute. Between frights it trembles.', 'shiver', 'shiver', (v) => `${Math.round(v)} per min`),
				],
			},
			{
				type: 'group',
				heading: 'Brightness and colour',
				items: [
					this.look('Brightness', 'Makes everything lighter or darker: nodes, links, labels, glow and the backdrop. 100% is the normal look.', 'brightness', undefined, percent),
					this.look('Saturation', '0% is black and white, 100% normal, 200% vivid.', 'saturation', undefined, percent),
					this.look('Node brightness', 'Only the nodes.', 'nodeBrightness', undefined, percent),
					this.look('Node opacity', 'How solid nodes are. Lower shows more of what is behind.', 'nodeOpacity', undefined, percent),
					this.look('Link brightness', 'How visible links are. 0% hides them.', 'linkBrightness', undefined, percent),
					this.look('Glow strength', 'The soft halo around glowing nodes.', 'glowStrength', () => this.skinned, percent),
					this.look('Background brightness', 'The skin backdrop, or your custom background colour.', 'backgroundBrightness', () => this.skinned || look().useBackgroundColour, percent),
					{
						name: 'Reset brightness and colour',
						desc: 'Puts every brightness, colour and glow value above and below back to normal.',
						action: () => {
							Object.assign(this.s.look, DEFAULT_LOOK);
							this.host.changed();
							this.update();
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Custom colours',
				items: [
					this.toggle('Custom node colour', 'Use one colour for all nodes instead of the theme or skin. Colour groups still win.', 'look.useNodeColour'),
					{ name: 'Node colour', control: { type: 'color', key: 'look.nodeColour' }, visible: () => look().useNodeColour },
					this.toggle('Custom link colour', 'Use one colour for all links.', 'look.useLinkColour'),
					{ name: 'Link colour', control: { type: 'color', key: 'look.linkColour' }, visible: () => look().useLinkColour },
					this.toggle('Custom background colour', 'Fill the graph with a colour of your choice.', 'look.useBackgroundColour'),
					{ name: 'Background colour', control: { type: 'color', key: 'look.backgroundColour' }, visible: () => look().useBackgroundColour },
				],
			},
			{
				type: 'group',
				heading: 'Nodes and links',
				items: [
					this.slider('Node size', 'Size of nodes, which also grow with their number of links.', 'nodeSize', RANGES.nodeSize, undefined, (v) => `${v.toFixed(1)}x`),
					this.slider('Link thickness', 'Line width in the flat view. The 3D view always draws thin lines.', 'linkThickness', RANGES.linkThickness, undefined, (v) => `${v.toFixed(1)} px`),
					this.toggle('Arrows', 'Show the direction of links in the flat view.', 'showArrows'),
				],
			},
			{
				type: 'group',
				heading: 'Labels',
				items: [
					this.slider('Text fade threshold', 'Labels fade in once you zoom past this level.', 'textFadeThreshold', RANGES.textFadeThreshold, undefined, (v) => v.toFixed(1)),
					this.look('Label size', 'Text size in pixels.', 'labelSize', undefined, (v) => `${Math.round(v)} px`),
					this.look('Label brightness', 'Only the labels.', 'labelBrightness', undefined, percent),
				],
			},
			{
				type: 'group',
				heading: 'Filters',
				items: [
					{
						name: 'Exclude folders',
						desc: 'Notes in these folders (and their sub-folders) are left out of the graph. One folder per line, for example Templates or Archive/Old. Not case-sensitive.',
						control: { type: 'textarea', key: 'excludedFolders', placeholder: 'Templates\nArchive/Old', rows: 4 },
					},
				],
			},
			{
				type: 'group',
				heading: 'Layout forces',
				items: [
					this.slider('Center force', 'How strongly notes are pulled towards the middle. Keeps unlinked notes close.', 'centerForce', RANGES.centerForce, undefined, (v) => v.toFixed(2)),
					this.slider('Repel force', 'How strongly notes push each other apart.', 'repelForce', RANGES.repelForce, undefined, (v) => v.toFixed(1)),
					this.slider('Link force', 'How strongly links pull their notes together.', 'linkForce', RANGES.linkForce, undefined, (v) => v.toFixed(2)),
					this.slider('Link distance', 'The length links try to reach.', 'linkDistance', RANGES.linkDistance, undefined, (v) => `${Math.round(v)}`),
					this.toggle('Animate layout', 'Show the layout settling live. Off shows only the finished result.', 'animate'),
				],
			},
			{
				type: 'group',
				heading: '3D camera',
				visible: () => this.s.view3d,
				items: [
					this.look('Field of view', 'Wider shows more and exaggerates depth.', 'fov', undefined, degrees),
					this.look('Depth fade', 'How strongly far links fade. 0% shows them all equally.', 'depthFade', undefined, percent),
				],
			},
			{
				type: 'group',
				heading: 'Layout cache',
				items: [
					{
						name: 'Clear saved layout',
						desc: 'Deletes the saved positions (flat and 3D). The next time the graph opens it is laid out again from scratch, then saved.',
						action: () => void this.host.clearCache(),
					},
				],
			},
		];
	}

	private importText = '';
	private importReport = '';

	private layoutOptions(): Record<string, string> {
		const options: Record<string, string> = { none: 'None (normal graph)' };
		for (const entry of this.host.packs.layouts()) options[entry.key] = entry.label;
		return options;
	}

	/** One row to copy each pack as text, and one to remove each imported pack. */
	private packRows(): SettingDefinition[] {
		const rows: SettingDefinition[] = [];
		for (const { pack, builtin } of this.host.packs.all()) {
			const parts = [`${pack.themes.length} themes`, `${pack.shapes.length} shapes`, `${pack.layouts.length} layouts`];
			const by = pack.author ? ` by ${pack.author}` : '';
			rows.push({
				name: `Copy ${pack.name} as text`,
				desc: `${builtin ? 'Comes with the plugin' : 'Imported'}${by}. ${parts.join(', ')}. Copies the pack so you can share it or start your own from it.`,
				action: () => void this.copyPack(pack.id, pack.name),
			});
			if (!builtin) {
				rows.push({ name: `Remove ${pack.name}`, desc: 'Deletes this imported pack.', action: () => void this.removePack(pack.id, pack.name) });
			}
		}
		if (this.host.packs.skipped.length > 0) {
			rows.push({ name: 'Saved packs that could not be read', desc: this.host.packs.skipped.join(', '), action: () => undefined });
		}
		return rows;
	}

	private async importPack(): Promise<void> {
		let text = this.importText.trim();
		if (text === '') {
			new Notice('Paste a pack or a vault path first.');
			return;
		}
		if (!text.startsWith('{')) {
			const fromVault = await this.host.readVaultFile(text);
			if (fromVault === null) {
				this.importReport = 'No pack file was found at that path in your vault.';
				new Notice(this.importReport);
				this.update();
				return;
			}
			text = fromVault;
		}
		const result = await this.host.packs.importText(text);
		if (!result.ok) {
			const lines = result.errors.slice(0, 12).map((e) => `${e.path}: ${e.message}`);
			if (result.errors.length > 12) lines.push(`and ${result.errors.length - 12} more`);
			this.importReport = `Not imported. ${lines.join(' | ')}`;
			new Notice(`The pack was not imported: ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}. The details are under Import a pack.`);
		} else {
			const note = result.saved ? '' : ' It could not be saved to disk, so it will be gone when Obsidian restarts.';
			this.importReport = `Imported ${result.pack.name}${result.replaced ? ' (replaced the earlier copy)' : ''}.${note}${result.warnings.length > 0 ? ` Ignored fields: ${result.warnings.map((w) => w.path).join(', ')}.` : ''}`;
			new Notice(this.importReport);
			this.importText = '';
			this.host.changed();
		}
		this.update();
	}

	private async copyPack(id: string, name: string): Promise<void> {
		const text = this.host.packs.exportText(id);
		if (text === null) return;
		try {
			await navigator.clipboard.writeText(text);
			new Notice(`Copied ${name} to the clipboard.`);
		} catch {
			new Notice('Could not copy to the clipboard.');
		}
	}

	private async removePack(id: string, name: string): Promise<void> {
		if (await this.host.packs.remove(id)) {
			// A layout from the removed pack falls back to the normal graph.
			if (this.s.activeLayout.startsWith(`${id}/`)) this.s.activeLayout = '';
			new Notice(`Removed ${name}.`);
			this.host.changed();
			this.update();
		}
	}

	/** Choosing a layout also sets the flat or 3D view and the shape strength the pack suggests. */
	private chooseLayout(key: string): void {
		if (key === '') {
			this.s.activeLayout = '';
			return;
		}
		const entry = this.host.packs.find(key);
		if (!entry) return;
		this.s.activeLayout = key;
		this.s.view3d = entry.layout.dimensions === 3;
		this.s.shapeStrength = entry.layout.forces.shapeStrength;
	}

	/** Keys are plain ("clusters") or nested with dots ("look.brightness"). */
	getControlValue(key: string): unknown {
		if (key === 'importText') return this.importText;
		if (key === 'activeLayout') return this.s.activeLayout === '' ? 'none' : this.s.activeLayout;
		let node: unknown = this.host.settings;
		for (const part of key.split('.')) {
			if (typeof node !== 'object' || node === null) return undefined;
			node = (node as Record<string, unknown>)[part];
		}
		return node;
	}

	setControlValue(key: string, value: unknown): void {
		if (key === 'importText') {
			this.importText = typeof value === 'string' ? value : '';
			return;
		}
		if (key === 'activeLayout') {
			this.chooseLayout(typeof value === 'string' && value !== 'none' ? value : '');
			this.host.changed();
			this.update();
			return;
		}
		const parts = key.split('.');
		let node = this.host.settings as unknown as Record<string, unknown>;
		for (const part of parts.slice(0, -1)) {
			const next = node[part];
			if (typeof next !== 'object' || next === null) return;
			node = next as Record<string, unknown>;
		}
		node[parts[parts.length - 1] as string] = value;
		this.host.changed();
		this.update();
	}
}
