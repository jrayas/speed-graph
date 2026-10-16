//! Force-directed layout following the d3-force model (centre, many-body and
//! link forces, velocity decay, alpha cooling). See docs/layout-algorithm.md
//! for the exact formulas and where this deviates.

pub mod rng;

use crate::barnes_hut::QuadTree;
use crate::shape::{ShapeField, NO_REGION};
use rng::Rng;
use wasm_bindgen::prelude::*;

/// How hard a strength of 1 pulls: per tick, strength x this x the distance beyond the shape's edge.
const SHAPE_PULL: f64 = 2.0;
/// Largest share of the way to the target a node is pulled in one tick.
const SHAPE_PULL_MAX_STEP: f64 = 0.9;
/// Share of the pull that remains when the layout has cooled.
const SHAPE_PULL_FLOOR: f64 = 0.25;

#[wasm_bindgen]
pub struct Layout {
    n: usize,
    x: Vec<f64>,
    y: Vec<f64>,
    vx: Vec<f64>,
    vy: Vec<f64>,
    fixed: Vec<bool>,
    fixed_x: Vec<f64>,
    fixed_y: Vec<f64>,
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
    tree: QuadTree,
    rng: Rng,
}

#[wasm_bindgen]
impl Layout {
    /// `edges` is a flat `[source0, target0, source1, target1, ...]`. Invalid
    /// pairs (out of range, or a self-link) are ignored.
    #[wasm_bindgen(constructor)]
    pub fn new(node_count: u32, edges: &[u32], seed: u32) -> Layout {
        let n = node_count as usize;
        let mut rng = Rng::new(seed);

        // Start positions: d3's phyllotaxis spiral, rotated by a seeded angle
        // and nudged by a seeded jitter so different seeds give different layouts.
        let rotation = rng.next_f64() * std::f64::consts::TAU;
        let golden = std::f64::consts::PI * (3.0 - 5.0_f64.sqrt());
        let mut x = Vec::with_capacity(n);
        let mut y = Vec::with_capacity(n);
        for i in 0..n {
            let radius = 10.0 * (0.5 + i as f64).sqrt();
            let angle = i as f64 * golden + rotation;
            x.push(radius * angle.cos() + (rng.next_f64() - 0.5) * 2.0);
            y.push(radius * angle.sin() + (rng.next_f64() - 0.5) * 2.0);
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
        Layout {
            n,
            x,
            y,
            vx: vec![0.0; n],
            vy: vec![0.0; n],
            fixed: vec![false; n],
            fixed_x: vec![0.0; n],
            fixed_y: vec![0.0; n],
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
            tree: QuadTree::new(),
            rng,
        }
    }

    /// `gravity` pulls nodes to the centre (0 = off). `repel_max_distance` limits how far the
    /// repel force reaches (use `Infinity` for no limit).
    /// `repel_strength` is d3's many-body strength (negative repels). `theta`
    /// is the Barnes-Hut opening angle (0 = exact).
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

    /// Restarts cooling from `alpha` (1.0 is a full restart; use less for a gentle nudge).
    /// Gives the layout a shape: `targets` is `[x, y, z, ...]` in the shape's units (z is ignored here),
    /// multiplied by `scale`; `regions` is one region number per target (255 = none) or empty.
    pub fn set_shape(&mut self, targets: &[f32], scale: f64, regions: &[u8], strength: f64) {
        let mut flat = targets.to_vec();
        for i in 0..flat.len() / 3 {
            flat[3 * i + 2] = 0.0;
        }
        let field = ShapeField::new(&flat, scale, regions);
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

    /// Pins a node at (x, y), like d3's `fx`/`fy`. Used while dragging.
    pub fn fix_node(&mut self, id: u32, x: f64, y: f64) {
        let i = id as usize;
        if i < self.n {
            self.fixed[i] = true;
            self.fixed_x[i] = x;
            self.fixed_y[i] = y;
        }
    }

    pub fn release_node(&mut self, id: u32) {
        if let Some(f) = self.fixed.get_mut(id as usize) {
            *f = false;
        }
    }

    /// Overwrites start positions from interleaved `[x0, y0, ...]`. Entries beyond
    /// either array are left alone. Used to warm-start after the graph changes.
    pub fn set_positions(&mut self, positions: &[f32]) {
        let count = self.n.min(positions.len() / 2);
        for i in 0..count {
            self.x[i] = f64::from(positions[2 * i]);
            self.y[i] = f64::from(positions[2 * i + 1]);
            self.vx[i] = 0.0;
            self.vy[i] = 0.0;
        }
    }

    /// Interleaved `[x0, y0, x1, y1, ...]` as f32, a copy.
    pub fn positions(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(self.n * 2);
        for i in 0..self.n {
            out.push(self.x[i] as f32);
            out.push(self.y[i] as f32);
        }
        out
    }
}

impl Layout {
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
                self.vx[i] = 0.0;
                self.vy[i] = 0.0;
                continue;
            }
            self.vx[i] *= keep;
            self.vy[i] *= keep;
            self.x[i] += self.vx[i];
            self.y[i] += self.vy[i];
        }
    }

    fn apply_links(&mut self) {
        for k in 0..self.src.len() {
            let (s, t) = (self.src[k] as usize, self.dst[k] as usize);
            let mut dx = self.x[t] + self.vx[t] - self.x[s] - self.vx[s];
            let mut dy = self.y[t] + self.vy[t] - self.y[s] - self.vy[s];
            if dx == 0.0 {
                dx = self.rng.jiggle();
            }
            if dy == 0.0 {
                dy = self.rng.jiggle();
            }
            let mut l = (dx * dx + dy * dy).sqrt();
            l = (l - self.link_distance) / l * self.alpha * self.link_strength * self.base_strength[k];
            dx *= l;
            dy *= l;
            let b = self.bias[k];
            self.vx[t] -= dx * b;
            self.vy[t] -= dy * b;
            self.vx[s] += dx * (1.0 - b);
            self.vy[s] += dy * (1.0 - b);
        }
    }

    fn apply_many_body(&mut self) {
        if self.repel_strength == 0.0 || self.n < 2 {
            return;
        }
        self.tree.build(&self.x, &self.y);
        for i in 0..self.n {
            let (dvx, dvy) = self.tree.accumulate(
                i,
                &self.x,
                &self.y,
                self.repel_strength,
                self.alpha,
                self.theta2,
                1.0,
                self.repel_max2,
                &mut self.rng,
            );
            self.vx[i] += dvx;
            self.vy[i] += dvy;
        }
    }

    /// Pulls every node towards the origin, like d3's forceX and forceY at 0.
    /// Keeps unlinked notes (which the repel force would push far out) close by.
    fn apply_gravity(&mut self) {
        if self.gravity == 0.0 {
            return;
        }
        let k = self.gravity * self.alpha;
        for i in 0..self.n {
            self.vx[i] -= self.x[i] * k;
            self.vy[i] -= self.y[i] * k;
        }
    }

    /// Pulls each node towards the nearest target point of the shape (x and y only).
    fn apply_shape(&mut self) {
        let Some(shape) = &self.shape else { return };
        if self.shape_strength == 0.0 {
            return;
        }
        // The pull keeps working as the layout cools (a floor of a quarter), or the repel force would win back.
        let k = self.shape_strength * (SHAPE_PULL_FLOOR + (1.0 - SHAPE_PULL_FLOOR) * self.alpha.min(1.0)) * SHAPE_PULL;
        let free = shape.spacing();
        for i in 0..self.n {
            if let Some(t) = shape.nearest(self.x[i], self.y[i], 0.0, self.node_region[i]) {
                let (dx, dy) = (t[0] - self.x[i], t[1] - self.y[i]);
                let d = dx.hypot(dy);
                if d > free {
                    // Capped so a strong pull can never overshoot the target (it stays stable at full strength).
                    let f = ((d - free) / d * k).min(SHAPE_PULL_MAX_STEP);
                    self.vx[i] += dx * f;
                    self.vy[i] += dy * f;
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
        for i in 0..self.n {
            self.x[i] -= mx;
            self.y[i] -= my;
        }
    }
}
