import galaxy from '../../docs/packs/galaxy.fgpack.json';
import brain from '../../docs/packs/brain-stylised.fgpack.json';
import heart from '../../docs/packs/heart.fgpack.json';
import trefoil from '../../docs/packs/trefoil-knot.fgpack.json';
import spider from '../../docs/packs/spider.fgpack.json';
import honeycomb from '../../docs/packs/honeycomb.fgpack.json';
import solar from '../../docs/packs/solar-system.fgpack.json';
import reactor from '../../docs/packs/arc-reactor.fgpack.json';
import { validatePack, type Pack } from './pack';

/**
 * The example packs shipped with the plugin. They are the same files as in docs/packs/, so the
 * documentation, the tests and the plugin can never drift apart. They are checked like any other pack.
 */
export function builtinPacks(): Pack[] {
	const out: Pack[] = [];
	for (const raw of [galaxy, brain, heart, trefoil, spider, honeycomb, solar, reactor] as unknown[]) {
		const result = validatePack(raw);
		if (result.ok) out.push(result.pack);
		else console.error('[speed-graph] A built-in pack is invalid', result.errors);
	}
	return out;
}
