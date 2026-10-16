/**
 * Camera maths for the 3D view: 4x4 matrices (column-major, as WebGL wants), an orbit camera,
 * projection to screen pixels and nearest-node picking. Pure code, unit-tested.
 */
export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function multiply(a: Mat4, b: Mat4): Mat4 {
	const out = new Float32Array(16);
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			let sum = 0;
			for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] as number) * (b[col * 4 + k] as number);
			out[col * 4 + row] = sum;
		}
	}
	return out;
}

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
	const f = 1 / Math.tan(fovY / 2);
	const m = new Float32Array(16);
	m[0] = f / aspect;
	m[5] = f;
	m[10] = (far + near) / (near - far);
	m[11] = -1;
	m[14] = (2 * far * near) / (near - far);
	return m;
}

function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalise(a: Vec3): Vec3 {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
	const z = normalise(sub(eye, target));
	const x = normalise(cross(up, z));
	const y = cross(z, x);
	const m = new Float32Array(16);
	m[0] = x[0];
	m[1] = y[0];
	m[2] = z[0];
	m[4] = x[1];
	m[5] = y[1];
	m[6] = z[1];
	m[8] = x[2];
	m[9] = y[2];
	m[10] = z[2];
	m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
	m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
	m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
	m[15] = 1;
	return m;
}

export interface Bounds3 {
	min: Vec3;
	max: Vec3;
}

/** Bounds of the shown nodes (positions are x, y, z per node). With `trim` > 0 the outer share of values on each axis is ignored. */
export function computeBounds3(positions: Float32Array, visible: Uint8Array, trim = 0): Bounds3 | null {
	const count = Math.min(visible.length, Math.floor(positions.length / 3));
	const axes: number[][] = [[], [], []];
	for (let i = 0; i < count; i++) {
		if (!visible[i]) continue;
		for (let a = 0; a < 3; a++) (axes[a] as number[]).push(positions[3 * i + a] as number);
	}
	if ((axes[0] as number[]).length === 0) return null;
	const pick = (values: number[]): [number, number] => {
		const sorted = Float32Array.from(values).sort();
		const lo = Math.floor(sorted.length * trim);
		const hi = Math.max(lo, Math.ceil(sorted.length * (1 - trim)) - 1);
		return [sorted[lo] as number, sorted[hi] as number];
	};
	const [x0, x1] = pick(axes[0] as number[]);
	const [y0, y1] = pick(axes[1] as number[]);
	const [z0, z1] = pick(axes[2] as number[]);
	return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

export interface Projected {
	x: number;
	y: number;
	/** Distance along the view direction; negative means behind the camera. */
	depth: number;
	inFront: boolean;
}

const MIN_DISTANCE = 5;
const MAX_DISTANCE = 1e7;
const MAX_PITCH = 1.5;

/** A camera that orbits a target point. Y is up. */
export class OrbitCamera {
	target: Vec3 = [0, 0, 0];
	yaw = 0.6;
	pitch = 0.35;
	distance = 600;
	fovY = (50 * Math.PI) / 180;

	eye(): Vec3 {
		const cp = Math.cos(this.pitch);
		return [
			this.target[0] + this.distance * cp * Math.sin(this.yaw),
			this.target[1] + this.distance * Math.sin(this.pitch),
			this.target[2] + this.distance * cp * Math.cos(this.yaw),
		];
	}

	view(): Mat4 {
		return lookAt(this.eye(), this.target, [0, 1, 0]);
	}

	projection(aspect: number): Mat4 {
		return perspective(this.fovY, aspect, Math.max(0.5, this.distance * 0.02), this.distance * 60);
	}

	viewProjection(aspect: number): Mat4 {
		return multiply(this.projection(aspect), this.view());
	}

	/** Drag to rotate around the target. */
	orbit(dxPx: number, dyPx: number): void {
		this.yaw -= dxPx * 0.006;
		this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + dyPx * 0.006));
	}

	/** Slides the target across the screen plane by a pixel amount. */
	pan(dxPx: number, dyPx: number, viewportHeightPx: number): void {
		const scale = (2 * this.distance * Math.tan(this.fovY / 2)) / Math.max(1, viewportHeightPx);
		const eye = this.eye();
		const forward = normalise(sub(this.target, eye));
		const right = normalise(cross(forward, [0, 1, 0]));
		const up = cross(right, forward);
		for (let i = 0; i < 3; i++) this.target[i] = (this.target[i] as number) - (right[i] as number) * dxPx * scale + (up[i] as number) * dyPx * scale;
	}

	/** factor > 1 moves closer. */
	dolly(factor: number): void {
		this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this.distance / factor));
	}

	/** Centres the camera on the bounds and backs off until they fit. */
	fit(bounds: Bounds3, aspect: number): void {
		this.target = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
		const radius = Math.max(1, 0.5 * Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]));
		const halfFov = Math.min(this.fovY / 2, Math.atan(Math.tan(this.fovY / 2) * aspect));
		this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, (radius / Math.sin(halfFov)) * 1.05));
	}

	project(x: number, y: number, z: number, width: number, height: number, vp?: Mat4): Projected {
		const m = vp ?? this.viewProjection(width / Math.max(1, height));
		const cx = (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number);
		const cy = (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number);
		const cw = (m[3] as number) * x + (m[7] as number) * y + (m[11] as number) * z + (m[15] as number);
		const w = cw === 0 ? 1e-9 : cw;
		return { x: ((cx / w) * 0.5 + 0.5) * width, y: (0.5 - (cy / w) * 0.5) * height, depth: cw, inFront: cw > 0 };
	}

	/** A ray from the camera through a screen pixel: origin and unit direction. */
	ray(sx: number, sy: number, width: number, height: number): { origin: Vec3; dir: Vec3 } {
		const eye = this.eye();
		const forward = normalise(sub(this.target, eye));
		const right = normalise(cross(forward, [0, 1, 0]));
		const up = cross(right, forward);
		const tanHalf = Math.tan(this.fovY / 2);
		const ndcX = (sx / width) * 2 - 1;
		const ndcY = 1 - (sy / height) * 2;
		const aspect = width / Math.max(1, height);
		const dir = normalise([
			forward[0] + right[0] * ndcX * tanHalf * aspect + up[0] * ndcY * tanHalf,
			forward[1] + right[1] * ndcX * tanHalf * aspect + up[1] * ndcY * tanHalf,
			forward[2] + right[2] * ndcX * tanHalf * aspect + up[2] * ndcY * tanHalf,
		]);
		return { origin: eye, dir };
	}

	/** The world point under a screen pixel on the plane through `through` that faces the camera. Used to drag a node. */
	pointOnViewPlane(sx: number, sy: number, width: number, height: number, through: Vec3): Vec3 {
		const { origin, dir } = this.ray(sx, sy, width, height);
		const forward = normalise(sub(this.target, this.eye()));
		const denom = dir[0] * forward[0] + dir[1] * forward[1] + dir[2] * forward[2];
		const t = denom === 0 ? 0 : ((through[0] - origin[0]) * forward[0] + (through[1] - origin[1]) * forward[1] + (through[2] - origin[2]) * forward[2]) / denom;
		return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
	}
}

/** On-screen size in pixels of a node of `worldRadius` at `depth` from the camera. */
export function pixelRadius(worldRadius: number, depth: number, viewportHeight: number, fovY: number, min = 1, max = 40): number {
	if (depth <= 0) return 0;
	const px = (worldRadius * viewportHeight) / (2 * depth * Math.tan(fovY / 2));
	return Math.max(min, Math.min(max, px));
}

/**
 * The shown node nearest to a screen point (within its own pixel radius plus `slackPx`).
 * Ties go to the node nearer the camera. Returns -1 if none.
 */
export function pickNode3D(
	camera: OrbitCamera,
	positions: Float32Array,
	visible: Uint8Array,
	radiusWorld: Float32Array,
	width: number,
	height: number,
	sx: number,
	sy: number,
	slackPx: number,
): number {
	const vp = camera.viewProjection(width / Math.max(1, height));
	let best = -1;
	let bestScore = Infinity;
	const count = Math.min(visible.length, Math.floor(positions.length / 3));
	for (let i = 0; i < count; i++) {
		if (!visible[i]) continue;
		const p = camera.project(positions[3 * i] as number, positions[3 * i + 1] as number, positions[3 * i + 2] as number, width, height, vp);
		if (!p.inFront) continue;
		const reach = pixelRadius(radiusWorld[i] as number, p.depth, height, camera.fovY) + slackPx;
		const d2 = (p.x - sx) ** 2 + (p.y - sy) ** 2;
		if (d2 > reach * reach) continue;
		// Prefer the closest on screen, then the nearer to the camera.
		const score = d2 + p.depth * 1e-6;
		if (score < bestScore) {
			bestScore = score;
			best = i;
		}
	}
	return best;
}
