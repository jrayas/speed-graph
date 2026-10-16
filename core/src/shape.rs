//! Shape field: a cloud of target points that nodes are pulled towards.
//!
//! The plugin turns a pack shape into target points (see plugin/src/packs/shapes.ts) and hands them
//! over as a flat `[x0, y0, z0, x1, ...]` array. Here they are put in a uniform grid so the nearest
//! target to any position is found in roughly constant time. Targets can belong to numbered regions;
//! a node with a region only looks at that region's targets, a node without one looks at all of them.

/// Region number meaning "no region": the node may go anywhere in the shape.
pub const NO_REGION: u8 = 255;

struct Grid {
    pts: Vec<[f64; 3]>,
    lo: [f64; 3],
    cell: f64,
    dims: [usize; 3],
    start: Vec<u32>,
    items: Vec<u32>,
}

impl Grid {
    fn build(pts: Vec<[f64; 3]>) -> Grid {
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        for p in &pts {
            for a in 0..3 {
                lo[a] = lo[a].min(p[a]);
                hi[a] = hi[a].max(p[a]);
            }
        }
        if pts.is_empty() {
            return Grid { pts, lo: [0.0; 3], cell: 1.0, dims: [1, 1, 1], start: vec![0, 0], items: Vec::new() };
        }
        let extent = (0..3).map(|a| hi[a] - lo[a]).fold(0.0_f64, f64::max).max(1e-9);
        // About two points per cell on average, never fewer than one cell per axis.
        let target_cells = (pts.len() as f64 / 2.0).max(1.0);
        let cell = (extent.powi(3) / target_cells).cbrt().max(extent / 64.0).max(1e-9);
        let mut dims = [1usize; 3];
        for a in 0..3 {
            dims[a] = (((hi[a] - lo[a]) / cell).floor() as usize + 1).clamp(1, 64);
        }
        let total = dims[0] * dims[1] * dims[2];
        let mut counts = vec![0u32; total + 1];
        let cell_of: Vec<usize> = pts
            .iter()
            .map(|p| {
                let c = Grid::locate_in(&lo, cell, &dims, p[0], p[1], p[2]);
                c[0] + dims[0] * (c[1] + dims[1] * c[2])
            })
            .collect();
        for &c in &cell_of {
            counts[c + 1] += 1;
        }
        for i in 0..total {
            counts[i + 1] += counts[i];
        }
        let start = counts.clone();
        let mut fill = counts;
        let mut items = vec![0u32; pts.len()];
        for (i, &c) in cell_of.iter().enumerate() {
            items[fill[c] as usize] = i as u32;
            fill[c] += 1;
        }
        Grid { pts, lo, cell, dims, start, items }
    }

    fn locate_in(lo: &[f64; 3], cell: f64, dims: &[usize; 3], x: f64, y: f64, z: f64) -> [usize; 3] {
        let q = [x, y, z];
        let mut c = [0usize; 3];
        for a in 0..3 {
            let v = ((q[a] - lo[a]) / cell).floor();
            c[a] = if v.is_nan() || v < 0.0 { 0 } else { (v as usize).min(dims[a] - 1) };
        }
        c
    }

    /// The nearest point to (x, y, z), or None when the grid is empty.
    fn nearest(&self, x: f64, y: f64, z: f64) -> Option<[f64; 3]> {
        if self.pts.is_empty() {
            return None;
        }
        let c = Grid::locate_in(&self.lo, self.cell, &self.dims, x, y, z);
        let max_ring = self.dims[0].max(self.dims[1]).max(self.dims[2]);
        let mut best = f64::INFINITY;
        let mut best_i = u32::MAX;
        for ring in 0..=max_ring {
            let r = ring as isize;
            for dz in -r..=r {
                let cz = c[2] as isize + dz;
                if cz < 0 || cz >= self.dims[2] as isize {
                    continue;
                }
                for dy in -r..=r {
                    let cy = c[1] as isize + dy;
                    if cy < 0 || cy >= self.dims[1] as isize {
                        continue;
                    }
                    // Only the shell of the cube: interior cells were seen in earlier rings.
                    let on_shell_zy = dz.abs() == r || dy.abs() == r;
                    let step = if on_shell_zy { 1 } else { (2 * r).max(1) };
                    let mut dx = -r;
                    while dx <= r {
                        let cx = c[0] as isize + dx;
                        if cx >= 0 && cx < self.dims[0] as isize {
                            let cell = cx as usize + self.dims[0] * (cy as usize + self.dims[1] * cz as usize);
                            for k in self.start[cell]..self.start[cell + 1] {
                                let i = self.items[k as usize];
                                let p = self.pts[i as usize];
                                let d = (p[0] - x).powi(2) + (p[1] - y).powi(2) + (p[2] - z).powi(2);
                                if d < best || (d == best && i < best_i) {
                                    best = d;
                                    best_i = i;
                                }
                            }
                        }
                        dx += step;
                    }
                }
            }
            // Anything in an unseen ring is at least `ring * cell` away (also for points outside the box).
            if best_i != u32::MAX && best.sqrt() <= ring as f64 * self.cell {
                break;
            }
        }
        if best_i == u32::MAX {
            None
        } else {
            Some(self.pts[best_i as usize])
        }
    }
}

/// Average distance from a target to its nearest other target, measured on up to 128 of them.
fn mean_neighbour_distance(pts: &[[f64; 3]]) -> f64 {
    if pts.len() < 2 {
        return 0.0;
    }
    let step = (pts.len() / 128).max(1);
    let (mut sum, mut count) = (0.0, 0.0);
    for i in (0..pts.len()).step_by(step) {
        let mut best = f64::INFINITY;
        for (j, q) in pts.iter().enumerate() {
            if j != i {
                let d = (q[0] - pts[i][0]).powi(2) + (q[1] - pts[i][1]).powi(2) + (q[2] - pts[i][2]).powi(2);
                best = best.min(d);
            }
        }
        sum += best.sqrt();
        count += 1.0;
    }
    sum / count
}

pub struct ShapeField {
    all: Grid,
    regions: Vec<Grid>,
    /// Typical distance between neighbouring targets: a node this close to a target counts as inside the shape.
    spacing: f64,
}

impl ShapeField {
    /// `targets` is `[x, y, z, ...]` in the shape's own units; every coordinate is multiplied by `scale`.
    /// `regions` is one region number per target (or empty for none).
    pub fn new(targets: &[f32], scale: f64, regions: &[u8]) -> ShapeField {
        let count = targets.len() / 3;
        let point = |i: usize| [f64::from(targets[3 * i]) * scale, f64::from(targets[3 * i + 1]) * scale, f64::from(targets[3 * i + 2]) * scale];
        let all: Vec<[f64; 3]> = (0..count).filter(|&i| point(i).iter().all(|v| v.is_finite())).map(point).collect();
        let mut by_region: Vec<Vec<[f64; 3]>> = Vec::new();
        if regions.len() >= count {
            for (i, &r) in regions.iter().enumerate().take(count) {
                let p = point(i);
                if r == NO_REGION || !p.iter().all(|v| v.is_finite()) {
                    continue;
                }
                while by_region.len() <= r as usize {
                    by_region.push(Vec::new());
                }
                by_region[r as usize].push(p);
            }
        }
        let spacing = mean_neighbour_distance(&all);
        ShapeField { all: Grid::build(all), regions: by_region.into_iter().map(Grid::build).collect(), spacing }
    }

    /// Notes closer than this to a target are free: the pull only starts beyond it.
    pub fn spacing(&self) -> f64 {
        self.spacing
    }

    pub fn is_empty(&self) -> bool {
        self.all.pts.is_empty()
    }

    /// Nearest target for a node in `region` (or anywhere if it has none, or its region is empty).
    pub fn nearest(&self, x: f64, y: f64, z: f64, region: u8) -> Option<[f64; 3]> {
        if region != NO_REGION {
            if let Some(g) = self.regions.get(region as usize) {
                if let Some(p) = g.nearest(x, y, z) {
                    return Some(p);
                }
            }
        }
        self.all.nearest(x, y, z)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn brute(pts: &[[f64; 3]], q: [f64; 3]) -> [f64; 3] {
        *pts.iter()
            .min_by(|a, b| {
                let da = (a[0] - q[0]).powi(2) + (a[1] - q[1]).powi(2) + (a[2] - q[2]).powi(2);
                let db = (b[0] - q[0]).powi(2) + (b[1] - q[1]).powi(2) + (b[2] - q[2]).powi(2);
                da.partial_cmp(&db).unwrap()
            })
            .unwrap()
    }

    fn cloud(n: usize) -> (Vec<f32>, Vec<[f64; 3]>) {
        let mut s = 12345u64;
        let mut next = || {
            s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            ((s >> 33) as f64 / (1u64 << 31) as f64) * 2.0 - 1.0
        };
        let mut flat = Vec::new();
        let mut pts = Vec::new();
        for _ in 0..n {
            let p = [next() as f32, next() as f32, next() as f32];
            flat.extend_from_slice(&p);
            pts.push([f64::from(p[0]), f64::from(p[1]), f64::from(p[2])]);
        }
        (flat, pts)
    }

    #[test]
    fn nearest_matches_brute_force_inside_and_far_outside() {
        let (flat, pts) = cloud(700);
        let f = ShapeField::new(&flat, 1.0, &[]);
        let queries = [[0.0, 0.0, 0.0], [0.3, -0.7, 0.2], [5.0, 5.0, 5.0], [-9.0, 0.1, 0.0], [0.0, 0.0, 40.0], [1.0, 1.0, -1.0]];
        for q in queries {
            assert_eq!(f.nearest(q[0], q[1], q[2], NO_REGION).unwrap(), brute(&pts, q), "query {q:?}");
        }
    }

    #[test]
    fn scale_multiplies_coordinates() {
        let f = ShapeField::new(&[1.0, 0.0, 0.0], 10.0, &[]);
        assert_eq!(f.nearest(0.0, 0.0, 0.0, NO_REGION).unwrap(), [10.0, 0.0, 0.0]);
    }

    #[test]
    fn regions_restrict_the_search_and_fall_back() {
        // two points: region 0 at x = -1, region 1 at x = +1
        let flat = [-1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let f = ShapeField::new(&flat, 1.0, &[0, 1]);
        assert_eq!(f.nearest(0.9, 0.0, 0.0, 0).unwrap(), [-1.0, 0.0, 0.0]); // forced to its own region
        assert_eq!(f.nearest(-0.9, 0.0, 0.0, 1).unwrap(), [1.0, 0.0, 0.0]);
        assert_eq!(f.nearest(0.9, 0.0, 0.0, NO_REGION).unwrap(), [1.0, 0.0, 0.0]); // free node goes to the nearest
        assert_eq!(f.nearest(0.9, 0.0, 0.0, 7).unwrap(), [1.0, 0.0, 0.0]); // unknown region falls back to all
    }

    #[test]
    fn spacing_is_the_typical_gap_between_targets() {
        // points 2 apart on a line
        let flat: Vec<f32> = (0..50).flat_map(|i| [i as f32 * 2.0, 0.0, 0.0]).collect();
        let f = ShapeField::new(&flat, 1.0, &[]);
        assert!((f.spacing() - 2.0).abs() < 1e-9, "{}", f.spacing());
        assert!((ShapeField::new(&flat, 5.0, &[]).spacing() - 10.0).abs() < 1e-9); // follows the scale
        assert_eq!(ShapeField::new(&[1.0, 1.0, 1.0], 1.0, &[]).spacing(), 0.0);
    }

    #[test]
    fn empty_and_bad_input_are_safe() {
        let f = ShapeField::new(&[], 1.0, &[]);
        assert!(f.is_empty());
        assert!(f.nearest(0.0, 0.0, 0.0, NO_REGION).is_none());
        let g = ShapeField::new(&[f32::NAN, 0.0, 0.0, 2.0, 0.0, 0.0], 1.0, &[]);
        assert_eq!(g.nearest(0.0, 0.0, 0.0, NO_REGION).unwrap(), [2.0, 0.0, 0.0]); // NaN target dropped
        assert!(f.nearest(f64::NAN, 0.0, 0.0, NO_REGION).is_none());
        let single = ShapeField::new(&[0.5, 0.5, 0.5], 1.0, &[]);
        assert_eq!(single.nearest(100.0, -100.0, 3.0, NO_REGION).unwrap(), [0.5, 0.5, 0.5]);
    }
}
