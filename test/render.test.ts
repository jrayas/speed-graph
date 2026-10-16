import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, computeBounds, fitBounds, screenToWorld, zoomAt, MAX_ZOOM, MIN_ZOOM } from '../src/render/transform';
import { nearestNode } from '../src/render/hit-test';
import { buildAdjacency } from '../src/data/adjacency';

test('zoomAt keeps the world point under the cursor fixed', () => {
	const t = { x: 40, y: -20, k: 1.5 };
	const before = screenToWorld(t, 300, 200);
	const z = zoomAt(t, 300, 200, 1.7);
	const after = screenToWorld(z, 300, 200);
	assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
	assert.ok(z.k > t.k);
});

test('zoom is clamped', () => {
	assert.equal(clampZoom(1e9), MAX_ZOOM);
	assert.equal(clampZoom(0), MIN_ZOOM);
	assert.equal(zoomAt({ x: 0, y: 0, k: MAX_ZOOM }, 5, 5, 10).k, MAX_ZOOM);
});

test('computeBounds ignores dead slots and returns null when empty', () => {
	const pos = new Float32Array([0, 0, 100, 50, 999, 999, -10, 20]);
	assert.deepEqual(computeBounds(pos, new Uint8Array([1, 1, 0, 1])), { minX: -10, minY: 0, maxX: 100, maxY: 50 });
	assert.equal(computeBounds(pos, new Uint8Array([0, 0, 0, 0])), null);
});

test('fitBounds centres the content inside the viewport', () => {
	const t = fitBounds({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 800, 600, 20);
	assert.ok(Math.abs(t.k - 3.8) < 1e-9);
	assert.ok(Math.abs(t.x - 400) < 1e-9 && Math.abs(t.y - 300) < 1e-9);
	const topLeft = { x: -100 * t.k + t.x, y: -50 * t.k + t.y };
	assert.ok(topLeft.x >= 20 - 1e-9 && topLeft.y >= 20 - 1e-9);
});

test('nearestNode picks the closest alive node within reach', () => {
	const pos = new Float32Array([0, 0, 10, 0, 12, 0]);
	const radius = new Float32Array([2, 2, 2]);
	assert.equal(nearestNode(pos, new Uint8Array([1, 1, 1]), radius, 11.5, 0, 0), 2);
	assert.equal(nearestNode(pos, new Uint8Array([1, 1, 0]), radius, 11.5, 0, 0), 1);
	assert.equal(nearestNode(pos, new Uint8Array([1, 1, 1]), radius, 50, 50, 0), -1);
	assert.equal(nearestNode(pos, new Uint8Array([1, 1, 1]), radius, 0, 5, 4), 0);
});

test('buildAdjacency lists neighbours in both directions', () => {
	const adj = buildAdjacency(new Uint32Array([0, 1, 1, 2, 3, 0]), 5);
	const of = (i: number) => [...adj.neighbours.slice(adj.offsets[i], adj.offsets[i + 1])].sort();
	assert.deepEqual(of(0), [1, 3]);
	assert.deepEqual(of(1), [0, 2]);
	assert.deepEqual(of(2), [1]);
	assert.deepEqual(of(3), [0]);
	assert.deepEqual(of(4), []);
	assert.equal(adj.neighbours.length, 6);
});

test('computeBounds with trim ignores far outliers', () => {
	const n = 100;
	const pos = new Float32Array(n * 2);
	for (let i = 0; i < n; i++) {
		pos[2 * i] = i;
		pos[2 * i + 1] = i;
	}
	pos[0] = -10000; // one far outlier
	const alive = new Uint8Array(n).fill(1);
	assert.equal(computeBounds(pos, alive)?.minX, -10000);
	const trimmed = computeBounds(pos, alive, 0.02);
	assert.ok(trimmed && trimmed.minX >= 0 && trimmed.maxX <= 99);
	assert.equal(computeBounds(pos, new Uint8Array(n), 0.02), null);
});

test('fitBounds does not zoom in past maxZoom, so small graphs keep normal-sized nodes', () => {
	const tiny = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
	assert.ok(fitBounds(tiny, 800, 600, 20).k > 10);
	const capped = fitBounds(tiny, 800, 600, 20, 1.5);
	assert.equal(capped.k, 1.5);
	assert.ok(Math.abs(capped.x - 400) < 1e-9 && Math.abs(capped.y - 300) < 1e-9);
	assert.ok(fitBounds({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, 800, 600, 20, 1.5).k < 1.5);
});
