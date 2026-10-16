//! Barnes-Hut quadtree for the many-body (repel) force.
//!
//! Flat arrays, rebuilt from scratch every tick. Cell 0 is the root, so a child
//! index of 0 means "no child". A leaf holds a chain of points at the same
//! position (or, at the depth limit, in the same tiny cell) linked through `next`.

use crate::layout::rng::Rng;

pub mod octree;

const NONE: u32 = u32::MAX;
const MAX_DEPTH: u32 = 48;

#[derive(Default)]
pub struct QuadTree {
    children: Vec<[u32; 4]>,
    mass: Vec<u32>,
    sx: Vec<f64>,
    sy: Vec<f64>,
    head: Vec<u32>,
    next: Vec<u32>,
    x0: f64,
    y0: f64,
    size: f64,
    stack: Vec<(u32, f64)>,
}

fn quadrant(px: f64, py: f64, xm: f64, ym: f64) -> usize {
    usize::from(px >= xm) | (usize::from(py >= ym) << 1)
}

impl QuadTree {
    pub fn new() -> Self {
        Self::default()
    }

    fn new_cell(&mut self) -> usize {
        self.children.push([0; 4]);
        self.mass.push(0);
        self.sx.push(0.0);
        self.sy.push(0.0);
        self.head.push(NONE);
        self.children.len() - 1
    }

    /// Number of cells currently in the tree (for tests and memory checks).
    pub fn cell_count(&self) -> usize {
        self.children.len()
    }

    pub fn build(&mut self, xs: &[f64], ys: &[f64]) {
        self.children.clear();
        self.mass.clear();
        self.sx.clear();
        self.sy.clear();
        self.head.clear();
        let n = xs.len();
        self.next.clear();
        self.next.resize(n, NONE);
        if n == 0 {
            return;
        }
        let (mut min_x, mut min_y) = (f64::INFINITY, f64::INFINITY);
        let (mut max_x, mut max_y) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
        for i in 0..n {
            min_x = min_x.min(xs[i]);
            max_x = max_x.max(xs[i]);
            min_y = min_y.min(ys[i]);
            max_y = max_y.max(ys[i]);
        }
        self.x0 = min_x;
        self.y0 = min_y;
        self.size = (max_x - min_x).max(max_y - min_y).max(1e-6);
        self.new_cell();
        for i in 0..n {
            self.insert(i, xs, ys);
        }
    }

    fn insert(&mut self, i: usize, xs: &[f64], ys: &[f64]) {
        let (px, py) = (xs[i], ys[i]);
        let (mut cell, mut x0, mut y0, mut size, mut depth) = (0usize, self.x0, self.y0, self.size, 0u32);
        loop {
            if self.mass[cell] == 0 {
                self.head[cell] = i as u32;
                self.next[i] = NONE;
                self.mass[cell] = 1;
                self.sx[cell] = px;
                self.sy[cell] = py;
                return;
            }
            if self.head[cell] != NONE {
                let j = self.head[cell] as usize;
                if depth >= MAX_DEPTH || (xs[j] == px && ys[j] == py) {
                    self.next[i] = self.head[cell];
                    self.head[cell] = i as u32;
                    self.mass[cell] += 1;
                    self.sx[cell] += px;
                    self.sy[cell] += py;
                    return;
                }
                // Split: move the existing chain (all at one position) into a child.
                let half = size * 0.5;
                let q = quadrant(xs[j], ys[j], x0 + half, y0 + half);
                let child = self.new_cell();
                self.head[child] = self.head[cell];
                self.mass[child] = self.mass[cell];
                self.sx[child] = self.sx[cell];
                self.sy[child] = self.sy[cell];
                self.head[cell] = NONE;
                self.children[cell][q] = child as u32;
            }
            self.mass[cell] += 1;
            self.sx[cell] += px;
            self.sy[cell] += py;
            let half = size * 0.5;
            let q = quadrant(px, py, x0 + half, y0 + half);
            if q & 1 == 1 {
                x0 += half;
            }
            if q & 2 == 2 {
                y0 += half;
            }
            size = half;
            depth += 1;
            let mut child = self.children[cell][q];
            if child == 0 {
                child = self.new_cell() as u32;
                self.children[cell][q] = child;
            }
            cell = child as usize;
        }
    }

    /// Velocity change for point `i` from the repel force of all other points.
    /// Follows d3-force's many-body force: `theta2 = 0` makes it exact.
    #[allow(clippy::too_many_arguments)]
    pub fn accumulate(
        &mut self,
        i: usize,
        xs: &[f64],
        ys: &[f64],
        strength: f64,
        alpha: f64,
        theta2: f64,
        dist_min2: f64,
        dist_max2: f64,
        rng: &mut Rng,
    ) -> (f64, f64) {
        let (px, py) = (xs[i], ys[i]);
        let (mut vx, mut vy) = (0.0, 0.0);
        let mut stack = std::mem::take(&mut self.stack);
        stack.clear();
        if !self.mass.is_empty() {
            stack.push((0, self.size));
        }
        while let Some((cell, size)) = stack.pop() {
            let cell = cell as usize;
            let m = self.mass[cell];
            if m == 0 {
                continue;
            }
            let mf = f64::from(m);
            let dx = self.sx[cell] / mf - px;
            let dy = self.sy[cell] / mf - py;
            let mut l = dx * dx + dy * dy;
            if size * size / theta2 < l {
                if l < dist_max2 {
                    if l < dist_min2 {
                        l = (dist_min2 * l).sqrt();
                    }
                    let w = strength * alpha * mf / l;
                    vx += dx * w;
                    vy += dy * w;
                }
                continue;
            }
            // Like d3: a nearby leaf beyond the maximum distance is skipped;
            // a nearby internal cell is still opened.
            if self.head[cell] != NONE {
                if l >= dist_max2 {
                    continue;
                }
                let mut j = self.head[cell];
                while j != NONE {
                    let ju = j as usize;
                    if ju != i {
                        let mut dx = xs[ju] - px;
                        let mut dy = ys[ju] - py;
                        let mut l = dx * dx + dy * dy;
                        if dx == 0.0 {
                            dx = rng.jiggle();
                            l += dx * dx;
                        }
                        if dy == 0.0 {
                            dy = rng.jiggle();
                            l += dy * dy;
                        }
                        if l < dist_min2 {
                            l = (dist_min2 * l).sqrt();
                        }
                        let w = strength * alpha / l;
                        vx += dx * w;
                        vy += dy * w;
                    }
                    j = self.next[ju];
                }
            } else {
                for &c in &self.children[cell] {
                    if c != 0 {
                        stack.push((c, size * 0.5));
                    }
                }
            }
        }
        self.stack = stack;
        (vx, vy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn random_points(n: usize, seed: u32) -> (Vec<f64>, Vec<f64>) {
        let mut rng = Rng::new(seed);
        let xs = (0..n).map(|_| rng.next_f64() * 1000.0).collect();
        let ys = (0..n).map(|_| rng.next_f64() * 1000.0).collect();
        (xs, ys)
    }

    fn brute(i: usize, xs: &[f64], ys: &[f64], strength: f64, alpha: f64) -> (f64, f64) {
        let (mut vx, mut vy) = (0.0, 0.0);
        for j in 0..xs.len() {
            if j == i {
                continue;
            }
            let (dx, dy) = (xs[j] - xs[i], ys[j] - ys[i]);
            let mut l = dx * dx + dy * dy;
            if l < 1.0 {
                l = l.sqrt();
            }
            let w = strength * alpha / l;
            vx += dx * w;
            vy += dy * w;
        }
        (vx, vy)
    }

    #[test]
    fn root_mass_equals_point_count() {
        let (xs, ys) = random_points(500, 1);
        let mut tree = QuadTree::new();
        tree.build(&xs, &ys);
        assert_eq!(tree.mass[0], 500);
    }

    #[test]
    fn exact_mode_matches_brute_force() {
        let (xs, ys) = random_points(300, 2);
        let mut tree = QuadTree::new();
        tree.build(&xs, &ys);
        let mut rng = Rng::new(9);
        for i in 0..xs.len() {
            let (bx, by) = tree.accumulate(i, &xs, &ys, -30.0, 1.0, 0.0, 1.0, f64::INFINITY, &mut rng);
            let (ex, ey) = brute(i, &xs, &ys, -30.0, 1.0);
            assert!((bx - ex).abs() <= 1e-9 * (1.0 + ex.abs()), "x mismatch at {i}");
            assert!((by - ey).abs() <= 1e-9 * (1.0 + ey.abs()), "y mismatch at {i}");
        }
    }

    #[test]
    fn approximation_error_is_small() {
        let (xs, ys) = random_points(1000, 3);
        let mut tree = QuadTree::new();
        tree.build(&xs, &ys);
        let mut rng = Rng::new(9);
        let (mut diff, mut total) = (0.0, 0.0);
        for i in 0..xs.len() {
            let (bx, by) = tree.accumulate(i, &xs, &ys, -30.0, 1.0, 0.81, 1.0, f64::INFINITY, &mut rng);
            let (ex, ey) = brute(i, &xs, &ys, -30.0, 1.0);
            diff += ((bx - ex).powi(2) + (by - ey).powi(2)).sqrt();
            total += (ex * ex + ey * ey).sqrt();
        }
        assert!(diff / total < 0.05, "relative error {}", diff / total);
    }

    #[test]
    fn coincident_points_do_not_loop_forever() {
        let xs = vec![5.0; 200];
        let ys = vec![5.0; 200];
        let mut tree = QuadTree::new();
        tree.build(&xs, &ys);
        assert_eq!(tree.mass[0], 200);
        assert!(tree.cell_count() < 10);
        let mut rng = Rng::new(1);
        let (vx, vy) = tree.accumulate(0, &xs, &ys, -30.0, 1.0, 0.81, 1.0, f64::INFINITY, &mut rng);
        assert!(vx.is_finite() && vy.is_finite());
    }
}
