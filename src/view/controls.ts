import { Setting } from 'obsidian';
import { SKIN_NAMES } from '../render/skins';
import { DEFAULT_LOOK, LOOK_RANGES } from '../render/appearance';
import { DEFAULT_SETTINGS, RANGES, type GraphSettings } from '../settings/settings';

export type ChangeKind = 'layout' | 'display' | 'filter' | 'groups' | 'local' | 'reset';

type NumericKey = keyof typeof RANGES;
type BooleanKey = 'view3d' | 'autoRotate' | 'clusters' | 'skinEffects' | 'showArrows' | 'animate' | 'showAttachments' | 'showOrphans' | 'hideUnresolved' | 'localGraph';

const GROUP_COLOURS = ['#e5484d', '#3e9bff', '#30a46c', '#f5a524', '#a259ff', '#12a594', '#ef5da8', '#8b8d98'];
const MAX_GROUPS = 20;

/** Builds the collapsible panel: filters, colour groups, local graph, forces and display. */
export function buildControls(
	parent: HTMLElement,
	settings: GraphSettings,
	onChange: (kind: ChangeKind) => void,
): HTMLElement {
	// Opened and closed by the gear in the pane header (graph-view.ts), so there is no button in the canvas.
	const panel = parent.createDiv({ cls: 'fast-graph-controls is-collapsed' });
	const body = panel.createDiv({ cls: 'fast-graph-controls-body' });

	const slider = (name: string, key: NumericKey, kind: ChangeKind) => {
		const [min, max, step] = RANGES[key];
		new Setting(body).setName(name).addSlider((s) =>
			s
				.setLimits(min, max, step)
				.setValue(settings[key])
				.onChange((value) => {
					settings[key] = value;
					onChange(kind);
				}),
		);
	};
	const toggleSetting = (name: string, key: BooleanKey, kind: ChangeKind) => {
		new Setting(body).setName(name).addToggle((t) =>
			t.setValue(settings[key]).onChange((value) => {
				settings[key] = value;
				onChange(kind);
			}),
		);
	};

	new Setting(body).setName('Filters').setHeading();
	new Setting(body)
		.setName('Search')
		.addText((t) =>
			t
				.setPlaceholder('Search notes')
				.setValue(settings.search)
				.onChange((value) => {
					settings.search = value;
					onChange('filter');
				}),
		);
	toggleSetting('Attachments', 'showAttachments', 'filter');
	toggleSetting('Orphans', 'showOrphans', 'filter');
	toggleSetting('Existing files only', 'hideUnresolved', 'filter');

	new Setting(body).setName('Groups').setHeading();
	const groupList = body.createDiv({ cls: 'fast-graph-groups' });
	const renderGroups = () => {
		groupList.empty();
		settings.groups.forEach((group, index) => {
			new Setting(groupList)
				.addText((t) =>
					t
						.setPlaceholder('Query, such as tag:#work')
						.setValue(group.query)
						.onChange((value) => {
							group.query = value;
							onChange('groups');
						}),
				)
				.addColorPicker((c) =>
					c.setValue(group.color).onChange((value) => {
						group.color = value;
						onChange('groups');
					}),
				)
				.addExtraButton((b) =>
					b
						.setIcon('x')
						.setTooltip('Remove group')
						.onClick(() => {
							settings.groups.splice(index, 1);
							renderGroups();
							onChange('groups');
						}),
				);
		});
	};
	renderGroups();
	new Setting(body).addButton((b) =>
		b.setButtonText('New group').onClick(() => {
			if (settings.groups.length >= MAX_GROUPS) return;
			settings.groups.push({ query: '', color: GROUP_COLOURS[settings.groups.length % GROUP_COLOURS.length] ?? '#8b8d98' });
			renderGroups();
			onChange('groups');
		}),
	);

	new Setting(body).setName('Local graph').setHeading();
	toggleSetting('Focus on one note and its neighbours', 'localGraph', 'local');
	body.createDiv({ cls: 'setting-item-description', text: 'Click a note to make it the centre. Double-click a note to open it.' });
	slider('Depth', 'localDepth', 'local');

	new Setting(body).setName('Forces').setHeading();
	slider('Center force', 'centerForce', 'layout');
	slider('Repel force', 'repelForce', 'layout');
	slider('Link force', 'linkForce', 'layout');
	slider('Link distance', 'linkDistance', 'layout');

	new Setting(body).setName('Display').setHeading();
	new Setting(body).setName('Brightness').addSlider((sl) =>
		sl
			.setLimits(LOOK_RANGES.brightness[0], LOOK_RANGES.brightness[1], LOOK_RANGES.brightness[2])
			.setValue(settings.look.brightness)
			.onChange((value) => {
				settings.look.brightness = value;
				onChange('display');
			}),
	);
	new Setting(body).setName('Skin').addDropdown((d) =>
		d
			.addOptions(SKIN_NAMES)
			.setValue(settings.skin)
			.onChange((value) => {
				settings.skin = value;
				onChange('display');
			}),
	);
	toggleSetting('Animate skin effects', 'skinEffects', 'display');
	toggleSetting('3D view (experimental)', 'view3d', 'display');
	if (settings.view3d) toggleSetting('Slowly rotate the 3D view', 'autoRotate', 'display');
	toggleSetting('Cluster when zoomed out', 'clusters', 'display');
	toggleSetting('Arrows', 'showArrows', 'display');
	slider('Text fade threshold', 'textFadeThreshold', 'display');
	slider('Node size', 'nodeSize', 'display');
	slider('Link thickness', 'linkThickness', 'display');
	toggleSetting('Animate', 'animate', 'display');

	new Setting(body).addButton((b) =>
		b.setButtonText('Reset to defaults').onClick(() => {
			Object.assign(settings, DEFAULT_SETTINGS, { groups: [], look: { ...DEFAULT_LOOK } });
			onChange('reset');
		}),
	);
	return panel;
}
