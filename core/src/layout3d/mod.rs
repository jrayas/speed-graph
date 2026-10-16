//! 3D force-directed layout: the same d3-force model as the 2D `Layout` (centre, many-body,
//! link forces, gravity, velocity decay, alpha cooling) with a z axis and an octree for the
//! repel force. Positions go in and out as interleaved `[x, y, z, ...]` f32 arrays.

use crate::barnes_hut::octree::OctTree;
use crate::layout::rng::Rng;
use crate::shape::{ShapeField, NO_REGION};
use wasm_bindgen::prelude::*;

/// Two irrational steps that spread points evenly (the R2 low-discrepancy sequence).
const A1: f64 = 0.754_877_666_246_692_7;
const A2: f64 = 0.569_840_290_998_053_2;

/// How hard a strength of 1 pulls: per tick, strength x this x the distance beyond the shape's edge.
const SHAPE_PULL: f64 = 2.0;
/// Largest share of the way to the target a node is pulled in one tick.
const SHAPE_PULL_MAX_STEP: f64 = 0.9;
/// Share of the pull that remains when the layout has cooled.
const SHAPE_PULL_FLOOR: f64 = 0.25;

#[wasm_bindgen]
pub struct Layout3 {
    n: usize,
    x: Vec<f64>,
    y: Vec<f64>,
    z: Vec<f64>,
    vx: Vec<f64>,
    vy: Vec<f64>,
    vz: Vec<f64>,
    fixed: Vec<bool>,
    fixed_x: Vec<f64>,
    fixed_y: Vec<f64>,
    fixed_z: Vec<f64>,
    src: Vec<u32>,
    dst: Vec<u32>,
    bias: Vec<f64>,
    base_strength: Vec<f64>,
    alpha: f64,
    alpha_min: f64,
    alpha_decay: f64,
    alpha_target: f64,
    velocity_decay: f64,
    center_strength: f64,
    repel_strength: f64,
    link_strength: f64,
    link_distance: f64,
    gravity: f64,
    shape: Option<ShapeField>,
    shape_strength: f64,
    node_region: Vec<u8>,
    repel_max2: f64,
    theta2: f64,
    tree: OctTree,
    rng: Rng,
}

fn fract(v: f64) -> f64 {
    v - v.floor()
}

#[wasm_bindgen]
impl Layout3 {
    /// `edges` is a flat `[source0, target0, ...]`. Invalid pairs (out of range, or a self-link) are ignored.
    #[wasm_bindgen(constructor)]
    pub fn new(node_count: u32, edges: &[u32], seed: u32) -> Layout3 {
        let n = node_count as usize;
        let mut rng = Rng::new(seed);

        // Start positions: points spread evenly over directions, in a growing shell
        // (radius 10 * cbrt(0.5 + i), the 3D version of d3's phyllotaxis), plus a seeded
        // offset into the sequence and a seeded jitter so different seeds differ.
        let offset = (rng.next_f64() * 100_000.0).floor();
        let mut x = Vec::with_capacity(n);
        let mut y = Vec::with_capacity(n);
        let mut z = Vec::with_capacity(n);
        for i in 0..n {
            let t = i as f64 + offset;
            let u = fract(0.5 + t * A1);
            let v = fract(0.5 + t * A2);
            let cos_theta = 1.0 - 2.0 * u;
            let sin_theta = (1.0 - cos_theta * cos_theta).max(0.0).sqrt();
            let phi = std::f64::consts::TAU * v;
            let radius = 10.0 * (0.5 + i as f64).cbrt();
            x.push(radius * sin_theta * phi.cos() + (rng.next_f64() - 0.5) * 2.0);
            y.push(radius * sin_theta * phi.sin() + (rng.next_f64() - 0.5) * 2.0);
            z.push(radius * cos_theta + (rng.next_f64() - 0.5) * 2.0);
        }

        let mut src = Vec::with_capacity(edges.len() / 2);
        let mut dst = Vec::with_capacity(edges.len() / 2);
        let mut count = vec![0u32; n];
        for k in 0..edges.len() / 2 {
            let (s, t) = (edges[2 * k], edges[2 * k + 1]);
            if s as usize >= n || t as usize >= n || s == t {
                continue;
            }
            src.push(s);
            dst.push(t);
            count[s as usize] += 1;
            count[t as usize] += 1;
        }
        let mut bias = Vec::with_capacity(src.len());
        let mut base_strength = Vec::with_capacity(src.len());
        for k in 0..src.len() {
            let (cs, ct) = (f64::from(count[src[k] as usize]), f64::from(count[dst[k] as usize]));
            bias.push(cs / (cs + ct));
            base_strength.push(1.0 / cs.min(ct));
        }

        let alpha_min = 0.001;
        Layout3 {
            n,
            x,
            y,
            z,
            vx: vec![0.0; n],
            vy: vec![0.0; n],
            vz: vec![0.0; n],
            fixed: vec![false; n],
            fixed_x: vec![0.0; n],
            fixed_y: vec![0.0; n],
            fixed_z: vec![0.0; n],
            src,
            dst,
            bias,
            base_strength,
            alpha: 1.0,
            alpha_min,
            alpha_decay: 1.0 - f64::powf(alpha_min, 1.0 / 300.0),
            alpha_target: 0.0,
            velocity_decay: 0.4,
            center_strength: 1.0,
            repel_strength: -30.0,
            link_strength: 1.0,
            link_distance: 30.0,
            gravity: 0.0,
            shape: None,
            shape_strength: 0.0,
            node_region: vec![NO_REGION; n],
            repel_max2: f64::INFINITY,
            theta2: 0.81,
            tree: OctTree::new(),
            rng,
        }
    }

    /// Same meaning as `Layout::set_params`.
    #[allow(clippy::too_many_arguments)]
    pub fn set_params(
        &mut self,
        center_strength: f64,
        repel_strength: f64,
        link_strength: f64,
        link_distance: f64,
        theta: f64,
        velocity_decay: f64,
        gravity: f64,
        repel_max_distance: f64,
    ) {
        self.center_strength = center_strength;
        self.repel_strength = repel_strength;
        self.link_strength = link_strength;
        self.link_distance = link_distance;
        self.theta2 = theta * theta;
        self.velocity_decay = velocity_decay;
        self.gravity = gravity;
        self.repel_max2 = repel_max_distance * repel_max_distance;
    }

    /// Gives the layout a shape: `targets` is `[x, y, z, ...]` in the shape's units, multiplied by `scale`;
    /// `regions` is one region number per target (255 = none) or empty.
    pub fn set_shape(&mut self, targets: &[f32], scale: f64, regions: &[u8], strength: f64) {
        let field = ShapeField::new(targets, scale, regions);
        self.shape = if field.is_empty() { None } else { Some(field) };
        self.shape_strength = strength.clamp(0.0, 1.0);
    }

    /// Changes only the strength (0 to 1) of an existing shape.
    pub fn set_shape_strength(&mut self, strength: f64) {
        self.shape_strength = strength.clamp(0.0, 1.0);
    }

    /// One region number per node (255 = free); missing entries mean free.
    pub fn set_node_regions(&mut self, regions: &[u8]) {
        for i in 0..self.n {
            self.node_region[i] = regions.get(i).copied().unwrap_or(NO_REGION);
        }
    }

    /// Removes the shape.
    pub fn clear_shape(&mut self) {
        self.shape = None;
        self.shape_strength = 0.0;
    }

    pub fn reheat(&mut self, alpha: f64) {
        self.alpha = alpha;
    }

    pub fn node_count(&self) -> u32 {
        self.n as u32
    }

    pub fn alpha(&self) -> f64 {
        self.alpha
    }

    pub fn is_cooled(&self) -> bool {
        self.alpha < self.alpha_min
    }

    /// Runs up to `ticks` steps, stopping early once cooled. Returns the final alpha.
    pub fn tick(&mut self, ticks: u32) -> f64 {
        for _ in 0..ticks {
            if self.is_cooled() {
                break;
            }
            self.step();
        }
        self.alpha
    }

    /// Pins a node at (x, y, z). Used while dragging.
    pub fn fix_node(&mut self, id: u32, x: f64, y: f64, z: f64) {
        let i = id as usize;
        if i < self.n {
            self.fixed[i] = true;
            self.fixed_x[i] = x;
            self.fixed_y[i] = y;
            self.fixed_z[i] = z;
        }
    }

    pub fn release_node(&mut self, id: u32) {
        if let Some(f) = self.fixed.get_mut(id as usize) {
            *f = false;
        }
    }

    /// Overwrites start positions from interleaved `[x0, y0, z0, ...]` (warm start).
    pub fn set_positions(&mut self, positions: &[f32]) {
        let count = self.n.min(positions.len() / 3);
        for i in 0..count {
            self.x[i] = f64::from(positions[3 * i]);
            self.y[i] = f64::from(positions[3 * i + 1]);
            self.z[i] = f64::from(positions[3 * i + 2]);
            self.vx[i] = 0.0;
            self.vy[i] = 0.0;
            self.vz[i] = 0.0;
        }
    }

    /// Interleaved `[x0, y0, z0, x1, ...]` as f32, a copy.
    pub fn positions(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(self.n * 3);
        for i in 0..self.n {
            out.push(self.x[i] as f32);
            out.push(self.y[i] as f32);
            out.push(self.z[i] as f32);
        }
        out
    }
}

impl Layout3 {
    fn step(&mut self) {
        self.alpha += (self.alpha_target - self.alpha) * self.alpha_decay;
        self.apply_links();
        self.apply_many_body();
        self.apply_gravity();
        self.apply_shape();
        self.apply_center();
        let keep = 1.0 - self.velocity_decay;
        for i in 0..self.n {
            if self.fixed[i] {
                self.x[i] = self.fixed_x[i];
                self.y[i] = self.fixed_y[i];
                self.z[i] = self.fixed_z[i];
                self.vx[i] = 0.0;
                self.vy[i] = 0.0;
                self.vz[i] = 0.0;
                continue;
            }
            self.vx[i] *= keep;
            self.vy[i] *= keep;
            self.vz[i] *= keep;
            self.x[i] += self.vx[i];
            self.y[i] += self.vy[i];
            self.z[i] += self.vz[i];
        }
    }

    fn apply_links(&mut self) {
        for k in 0..self.src.len() {
            let (s, t) = (self.src[k] as usize, self.dst[k] as usize);
            let mut dx = self.x[t] + self.vx[t] - self.x[s] - self.vx[s];
            let mut dy = self.y[t] + self.vy[t] - self.y[s] - self.vy[s];
            let mut dz = self.z[t] + self.vz[t] - self.z[s] - self.vz[s];
            if dx == 0.0 {
                dx = self.rng.jiggle();
            }
            if dy == 0.0 {
                dy = self.rng.jiggle();
            }
            if dz == 0.0 {
                dz = self.rng.jiggle();
            }
            let mut l = (dx * dx + dy * dy + dz * dz).sqrt();
            l = (l - self.link_distance) / l * self.alpha * self.link_strength * self.base_strength[k];
            dx *= l;
            dy *= l;
            dz *= l;
            let b = self.bias[k];
            self.vx[t] -= dx * b;
            self.vy[t] -= dy * b;
            self.vz[t] -= dz * b;
            self.vx[s] += dx * (1.0 - b);
            self.vy[s] += dy * (1.0 - b);
            self.vz[s] += dz * (1.0 - b);
        }
    }

    fn apply_many_body(&mut self) {
        if self.repel_strength == 0.0 || self.n < 2 {
            return;
        }
        self.tree.build(&self.x, &self.y, &self.z);
        for i in 0..self.n {
            let (dvx, dvy, dvz) = self.tree.accumulate(
                i,
                &self.x,
                &self.y,
                &self.z,
                self.repel_strength,
                self.alpha,
                self.theta2,
                1.0,
                self.repel_max2,
                &mut self.rng,
            );
            self.vx[i] += dvx;
            self.vy[i] += dvy;
            self.vz[i] += dvz;
        }
    }

    /// Pulls every node towards the origin; keeps unlinked notes close.
    fn apply_gravity(&mut self) {
        if self.gravity == 0.0 {
            return;
        }
        let k = self.gravity * self.alpha;
        for i in 0..self.n {
            self.vx[i] -= self.x[i] * k;
            self.vy[i] -= self.y[i] * k;
            self.vz[i] -= self.z[i] * k;
        }
    }

    /// Pulls each node towards the nearest target point of the shape.
    fn apply_shape(&mut self) {
        let Some(shape) = &self.shape else { return };
        if self.shape_strength == 0.0 {
            return;
        }
        // The pull keeps working as the layout cools (a floor of a quarter), or the repel force would win back.
        let k = self.shape_strength * (SHAPE_PULL_FLOOR + (1.0 - SHAPE_PULL_FLOOR) * self.alpha.min(1.0)) * SHAPE_PULL;
        let free = shape.spacing();
        for i in 0..self.n {
            if let Some(t) = shape.nearest(self.x[i], self.y[i], self.z[i], self.node_region[i]) {
                let (dx, dy, dz) = (t[0] - self.x[i], t[1] - self.y[i], t[2] - self.z[i]);
                let d = (dx * dx + dy * dy + dz * dz).sqrt();
                if d > free {
                    // Capped so a strong pull can never overshoot the target (it stays stable at full strength).
                    let f = ((d - free) / d * k).min(SHAPE_PULL_MAX_STEP);
                    self.vx[i] += dx * f;
                    self.vy[i] += dy * f;
                    self.vz[i] += dz * f;
                }
            }
        }
    }

    fn apply_center(&mut self) {
        if self.n == 0 {
            return;
        }
        let n = self.n as f64;
        let mx = self.x.iter().sum::<f64>() / n * self.center_strength;
        let my = self.y.iter().sum::<f64>() / n * self.center_strength;
        let mz = self.z.iter().sum::<f64>() / n * self.center_strength;
        for i in 0..self.n {
            self.x[i] -= mx;
            self.y[i] -= my;
            self.z[i] -= mz;
        }
    }
}
