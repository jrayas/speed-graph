import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLinks, clusterNodes, hitCluster } from '../src/render/cluster';

const params = { width: 100, height: 100, cellPx: 20, minCluster: 3, margin: 0 };
const pts = (list: [number, number][]) => Float32Array.from(list.flat());

test('crowded cells become bubbles with exact centroids; sparse ones stay individual', () => {
	// three nodes in the cell (0..20, 0..20), one alone at (90, 90), two in cell (40..60, 40..60)
	const screen = pts([[2, 2], [4, 6], [6, 4], [90, 90], [41, 41], [45, 45]]);
	const cl = clusterNodes(screen, new Uint8Array(6).fill(1), 6, new Uint8Array(6), 1, params);
	assert.equal(cl.clusters, 1);
	assert.deepEqual([...cl.cellOf], [0, 0, 0, -1, -1, -1]);
	assert.equal(cl.count[0], 3);
	assert.ok(Math.abs((cl.cx[0] as number) - 4) < 1e-5 && Math.abs((cl.cy[0] as number) - 4) < 1e-5);
});

test('undrawn nodes and nodes outside the grid are ignored', () => {
	const screen = pts([[2, 2], [3, 3], [4, 4], [5, 5], [500, 500], [-300, 5]]);
	const drawn = Uint8Array.from([1, 1, 1, 0, 1, 1]);
	const cl = clusterNodes(screen, drawn, 6, new Uint8Array(6), 1, params);
	assert.equal(cl.count[0], 3); // the 4th is not drawn
	assert.equal(cl.cellOf[3], -1);
	assert.equal(cl.cellOf[4], -1);
	assert.equal(cl.cellOf[5], -1);
});

test('a bubble takes the colour of the most common group among its members', () => {
	const screen = pts([[1, 1], [2, 2], [3, 3], [4, 4]]);
	const cl = clusterNodes(screen, new Uint8Array(4).fill(1), 4, Uint8Array.from([0, 2, 2, 1]), 3, params);
	assert.equal(cl.group[0], 2);
});

test('zooming in (spreading the same nodes out) dissolves the bubble into nodes', () => {
	const base: [number, number][] = [[2, 2], [4, 6], [6, 4]];
	const dense = clusterNodes(pts(base), new Uint8Array(3).fill(1), 3, new Uint8Array(3), 1, params);
	const spread = clusterNodes(pts(base.map(([x, y]) => [x * 8, y * 8] as [number, number])), new Uint8Array(3).fill(1), 3, new Uint8Array(3), 1, params);
	assert.equal(dense.clusters, 1);
	assert.equal(spread.clusters, 0);
});

test('links: inside a bubble vanish, between bubbles merge with a weight, bubble-to-node kept, node-to-node left out', () => {
	// cluster 0 near (4,4) with nodes 0,1,2 ; cluster 1 near (44,44) with nodes 3,4,5 ; lone node 6 at (90, 10)
	const screen = pts([[2, 2], [4, 6], [6, 4], [41, 41], [44, 44], [47, 47], [90, 10], [95, 95]]);
	const drawn = new Uint8Array(8).fill(1);
	const cl = clusterNodes(screen, drawn, 8, new Uint8Array(8), 1, params);
	assert.equal(cl.clusters, 2);
	const edges = Uint32Array.from([0, 1, 0, 3, 1, 4, 2, 5, 6, 0, 6, 7]);
	const links = aggregateLinks(edges, cl, screen, drawn);
	// 0-1 is inside cluster 0 (gone); 0-3, 1-4, 2-5 merge into one segment of weight 3; 6-0 is lone-to-bubble; 6-7 is lone-to-lone (not returned)
	assert.equal(links.weight.length, 2);
	assert.deepEqual([...links.weight].sort(), [1, 3]);
	const merged = links.weight.indexOf(3);
	assert.ok(Math.abs((links.x1[merged] as number) - 4) < 1e-5 || Math.abs((links.x2[merged] as number) - 4) < 1e-5);
	// an undrawn end removes the link
	drawn[6] = 0;
	assert.equal(aggregateLinks(edges, cl, screen, drawn).weight.length, 1);
});

test('hitCluster finds the nearest bubble within its radius plus slack', () => {
	const screen = pts([[2, 2], [4, 6], [6, 4], [41, 41], [44, 44], [47, 47]]);
	const cl = clusterNodes(screen, new Uint8Array(6).fill(1), 6, new Uint8Array(6), 1, params);
	const radius = (n: number) => 4 + n;
	assert.equal(hitCluster(cl, 4, 4, radius, 0), 0);
	assert.equal(hitCluster(cl, 44, 44, radius, 0), 1);
	assert.equal(hitCluster(cl, 80, 20, radius, 0), -1);
	assert.equal(hitCluster(cl, 14, 4, radius, 4), 0); // 10 away, reach 7 + 4
});
