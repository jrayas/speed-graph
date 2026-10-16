import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbitCamera, computeBounds3, lookAt, multiply, perspective, pickNode3D, pixelRadius } from '../src/render/math3d';

const close = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps * (1 + Math.abs(b));

test('multiply: identity leaves a matrix alone, and order matters', () => {
	const id = new Float32Array(16); id[0] = id[5] = id[10] = id[15] = 1;
	const m = perspective(1, 1.5, 1, 100);
	assert.deepEqual([...multiply(id, m)], [...m]);
	assert.deepEqual([...multiply(m, id)], [...m]);
	const t = new Float32Array(id); t[12] = 5;
	assert.notDeepEqual([...multiply(m, t)], [...multiply(t, m)]);
});

test('lookAt puts the target straight ahead of the eye', () => {
	const v = lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
	// the target maps to (0, 0, -10) in view space
	assert.ok(close(v[12] as number, 0) && close(v[13] as number, 0) && close(v[14] as number, -10));
});

test('the orbit target projects to the centre of the screen', () => {
	const cam = new OrbitCamera();
	cam.target = [30, -20, 5];
	cam.distance = 400;
	const p = cam.project(30, -20, 5, 800, 600);
	assert.ok(close(p.x, 400) && close(p.y, 300) && p.inFront);
	assert.ok(close(p.depth, 400, 1e-3));
});

test('orbiting changes the eye but never the distance; pitch is clamped', () => {
	const cam = new OrbitCamera();
	cam.distance = 300;
	for (let i = 0; i < 50; i++) cam.orbit(37, 91);
	const e = cam.eye();
	assert.ok(close(Math.hypot(e[0] - cam.target[0], e[1] - cam.target[1], e[2] - cam.target[2]), 300, 1e-6));
	assert.ok(Math.abs(cam.pitch) <= 1.5 + 1e-9);
	const centre = cam.project(0, 0, 0, 800, 600);
	assert.ok(close(centre.x, 400) && close(centre.y, 300));
});

test('pan slides the target across the screen: a dragged point follows the cursor', () => {
	const cam = new OrbitCamera();
	cam.distance = 500;
	const before = cam.project(0, 0, 0, 800, 600);
	cam.pan(100, 0, 600); // drag right by 100 px
	const after = cam.project(0, 0, 0, 800, 600);
	assert.ok(close(after.x - before.x, 100, 0.02), `moved ${after.x - before.x}`);
	assert.ok(close(after.y, before.y, 0.02));
});

test('dolly zooms with limits', () => {
	const cam = new OrbitCamera();
	cam.distance = 100;
	cam.dolly(2);
	assert.equal(cam.distance, 50);
	cam.dolly(1e12);
	assert.ok(cam.distance >= 5);
	cam.dolly(1e-12);
	assert.ok(cam.distance <= 1e7);
});

test('fit backs the camera off until every corner of the bounds is on screen', () => {
	const bounds = { min: [-100, -50, -80] as [number, number, number], max: [120, 60, 90] as [number, number, number] };
	const sizes: [number, number][] = [[800, 600], [400, 700], [1200, 500]];
	for (const [w, h] of sizes) {
		const cam = new OrbitCamera();
		cam.fit(bounds, w / h);
		for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
			const p = cam.project(x, y, z, w, h);
			assert.ok(p.inFront && p.x >= -1 && p.x <= w + 1 && p.y >= -1 && p.y <= h + 1, `corner off screen at ${w}x${h}: ${p.x},${p.y}`);
		}
	}
});

test('computeBounds3 ignores hidden nodes and trims outliers', () => {
	const pos = new Float32Array(3 * 100);
	for (let i = 0; i < 100; i++) { pos[3 * i] = i; pos[3 * i + 1] = -i; pos[3 * i + 2] = i * 2; }
	pos[0] = -9999;
	const visible = new Uint8Array(100).fill(1);
	assert.equal(computeBounds3(pos, visible)!.min[0], -9999);
	assert.ok(computeBounds3(pos, visible, 0.02)!.min[0] >= 0);
	visible[99] = 0;
	assert.equal(computeBounds3(pos, visible)!.max[0], 98);
	assert.equal(computeBounds3(pos, new Uint8Array(100)), null);
});

test('ray through the centre pixel looks at the target; the view-plane point round-trips', () => {
	const cam = new OrbitCamera();
	cam.target = [10, 20, 30];
	cam.distance = 250;
	const { origin, dir } = cam.ray(400, 300, 800, 600);
	const reach = [origin[0] + dir[0] * 250, origin[1] + dir[1] * 250, origin[2] + dir[2] * 250];
	assert.ok(close(reach[0] as number, 10, 1e-3) && close(reach[1] as number, 20, 1e-3) && close(reach[2] as number, 30, 1e-3));
	const world: [number, number, number] = [25, -10, 60];
	const s = cam.project(world[0], world[1], world[2], 800, 600);
	const back = cam.pointOnViewPlane(s.x, s.y, 800, 600, world);
	assert.ok(close(back[0], world[0], 1e-3) && close(back[1], world[1], 1e-3) && close(back[2], world[2], 1e-3));
});

test('pixel radius shrinks with distance and respects its limits', () => {
	const fov = (50 * Math.PI) / 180;
	assert.ok(pixelRadius(5, 100, 600, fov) > pixelRadius(5, 400, 600, fov));
	assert.equal(pixelRadius(5, -1, 600, fov), 0);
	assert.equal(pixelRadius(1e-6, 100, 600, fov), 1);
	assert.equal(pixelRadius(1e6, 100, 600, fov), 40);
});

test('picking: nearest on screen, nearer to the camera on a tie, skips hidden and behind-the-camera nodes', () => {
	const cam = new OrbitCamera();
	cam.yaw = 0; cam.pitch = 0; cam.distance = 500; cam.target = [0, 0, 0];
	// camera looks down -z from +z. Node 0 at the centre, node 1 behind it (further), node 2 off to the side, node 3 behind the camera.
	const pos = Float32Array.from([0, 0, 0, 0, 0, -100, 60, 0, 0, 0, 0, 900]);
	const radius = Float32Array.from([6, 6, 6, 6]);
	const visible = Uint8Array.from([1, 1, 1, 1]);
	assert.equal(pickNode3D(cam, pos, visible, radius, 800, 600, 400, 300, 2), 0); // nearer one wins the overlap
	visible[0] = 0;
	assert.equal(pickNode3D(cam, pos, visible, radius, 800, 600, 400, 300, 2), 1); // hidden node skipped
	assert.equal(pickNode3D(cam, pos, visible, radius, 800, 600, 700, 100, 2), -1); // nothing there
	const s2 = cam.project(60, 0, 0, 800, 600);
	assert.equal(pickNode3D(cam, pos, visible, radius, 800, 600, s2.x, s2.y, 2), 2);
});
