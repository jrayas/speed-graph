use fastgraph_core::Layout3;

fn ring_edges(n: u32) -> Vec<u32> {
    let mut e = Vec::new();
    for i in 0..n {
        e.extend([i, (i + 1) % n]);
        if i % 7 == 0 {
            e.extend([i, (i + n / 2) % n]);
        }
    }
    e
}

fn run(n: u32, seed: u32, ticks: u32) -> Vec<f32> {
    let mut layout = Layout3::new(n, &ring_edges(n), seed);
    layout.tick(ticks);
    layout.positions()
}

fn dist(p: &[f32], a: usize, b: usize) -> f32 {
    ((p[3 * a] - p[3 * b]).powi(2) + (p[3 * a + 1] - p[3 * b + 1]).powi(2) + (p[3 * a + 2] - p[3 * b + 2]).powi(2)).sqrt()
}

/// Standard deviation of one axis (0 = x, 1 = y, 2 = z).
fn spread(p: &[f32], axis: usize) -> f32 {
    let n = p.len() / 3;
    let mean = (0..n).map(|i| p[3 * i + axis]).sum::<f32>() / n as f32;
    ((0..n).map(|i| (p[3 * i + axis] - mean).powi(2)).sum::<f32>() / n as f32).sqrt()
}

#[test]
fn same_seed_gives_identical_positions() {
    assert_eq!(run(300, 7, 150), run(300, 7, 150));
}

#[test]
fn different_seeds_give_different_positions() {
    assert_ne!(run(300, 7, 150), run(300, 8, 150));
}

#[test]
fn start_positions_are_finite_and_use_all_three_axes() {
    let p = Layout3::new(500, &[], 1).positions();
    assert_eq!(p.len(), 1500);
    assert!(p.iter().all(|v| v.is_finite()));
    let (sx, sy, sz) = (spread(&p, 0), spread(&p, 1), spread(&p, 2));
    assert!(sx > 1.0 && sy > 1.0 && sz > 1.0, "{sx} {sy} {sz}");
    assert!(sz / sx > 0.5 && sz / sx < 2.0, "start shape is flat: {sx} {sy} {sz}");
}

#[test]
fn stays_finite_and_bounded_and_cools() {
    let n = 500;
    let mut layout = Layout3::new(n, &ring_edges(n), 3);
    layout.tick(10_000);
    assert!(layout.is_cooled());
    let p = layout.positions();
    assert!(p.iter().all(|v| v.is_finite()));
    assert!(p.iter().all(|v| v.abs() < 1.0e5), "layout exploded");
}

#[test]
fn the_settled_layout_fills_all_three_axes() {
    let n = 400;
    let mut layout = Layout3::new(n, &ring_edges(n), 5);
    layout.tick(10_000);
    let p = layout.positions();
    let (sx, sy, sz) = (spread(&p, 0), spread(&p, 1), spread(&p, 2));
    assert!(sz > 0.3 * sx && sz > 0.3 * sy, "collapsed to a plane: {sx} {sy} {sz}");
}

#[test]
fn centre_force_keeps_the_mean_near_the_origin() {
    let n = 300;
    let mut layout = Layout3::new(n, &ring_edges(n), 11);
    layout.tick(200);
    let p = layout.positions();
    for axis in 0..3 {
        let mean: f32 = (0..n as usize).map(|i| p[3 * i + axis]).sum::<f32>() / n as f32;
        assert!(mean.abs() < 1.0, "axis {axis} mean {mean}");
    }
}

#[test]
fn link_force_pulls_a_pair_to_the_link_distance() {
    let mut layout = Layout3::new(2, &[0, 1], 1);
    layout.set_params(1.0, 0.0, 1.0, 50.0, 0.9, 0.4, 0.0, f64::INFINITY);
    layout.tick(10_000);
    let d = dist(&layout.positions(), 0, 1);
    assert!((d - 50.0).abs() < 1.0, "distance {d}");
}

#[test]
fn repel_pushes_unlinked_nodes_apart() {
    let mut with = Layout3::new(2, &[], 1);
    let mut without = Layout3::new(2, &[], 1);
    without.set_params(1.0, 0.0, 1.0, 30.0, 0.9, 0.4, 0.0, f64::INFINITY);
    with.tick(100);
    without.tick(100);
    assert!(dist(&with.positions(), 0, 1) > dist(&without.positions(), 0, 1) + 1.0);
}

#[test]
fn linked_nodes_end_up_closer_than_unlinked_ones() {
    let edges = [0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3];
    let mut layout = Layout3::new(6, &edges, 4);
    layout.tick(10_000);
    let p = layout.positions();
    let within = (dist(&p, 0, 1) + dist(&p, 1, 2) + dist(&p, 3, 4) + dist(&p, 4, 5)) / 4.0;
    let between = (dist(&p, 0, 3) + dist(&p, 1, 4) + dist(&p, 2, 5)) / 3.0;
    assert!(within < between, "within {within}, between {between}");
}

#[test]
fn fixed_node_stays_put_while_others_move() {
    let n = 50;
    let mut layout = Layout3::new(n, &ring_edges(n), 6);
    layout.fix_node(0, 123.0, -45.0, 67.0);
    layout.tick(100);
    let p = layout.positions();
    assert_eq!((p[0], p[1], p[2]), (123.0, -45.0, 67.0));
    layout.release_node(0);
    layout.reheat(1.0);
    layout.tick(50);
    let q = layout.positions();
    assert_ne!((q[0], q[1], q[2]), (123.0, -45.0, 67.0));
}

#[test]
fn set_positions_warm_starts_and_ignores_extra_entries() {
    let mut layout = Layout3::new(2, &[], 1);
    layout.set_positions(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    assert_eq!(layout.positions(), vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    layout.set_positions(&[9.0, 9.0, 9.0]);
    assert_eq!(&layout.positions()[..3], &[9.0, 9.0, 9.0]);
}

#[test]
fn gravity_keeps_unlinked_nodes_closer_to_the_centre() {
    let radius = |gravity: f64| {
        let mut layout = Layout3::new(300, &[], 2);
        layout.set_params(1.0, -30.0, 1.0, 30.0, 0.9, 0.4, gravity, f64::INFINITY);
        layout.tick(10_000);
        let p = layout.positions();
        (0..300usize).map(|i| (p[3 * i].powi(2) + p[3 * i + 1].powi(2) + p[3 * i + 2].powi(2)).sqrt()).sum::<f32>() / 300.0
    };
    assert!(radius(0.1) < radius(0.0) * 0.6, "gravity did not pull nodes in");
}

#[test]
fn ignores_invalid_edges_and_handles_empty_graphs() {
    let mut layout = Layout3::new(3, &[0, 0, 5, 1, 1, 2, 9], 1);
    layout.tick(50);
    assert!(layout.positions().iter().all(|v| v.is_finite()));
    let mut empty = Layout3::new(0, &[], 1);
    empty.tick(10);
    assert!(empty.positions().is_empty());
    let mut one = Layout3::new(1, &[], 1);
    one.tick(10);
    assert!(one.positions().iter().all(|v| v.is_finite()));
}

#[test]
fn many_coincident_nodes_do_not_produce_nan() {
    let mut layout = Layout3::new(400, &[], 2);
    layout.set_params(1.0, -30.0, 1.0, 30.0, 0.9, 0.4, 0.0, f64::INFINITY);
    layout.set_positions(&vec![5.0; 1200]);
    layout.tick(300);
    assert!(layout.positions().iter().all(|v| v.is_finite()));
}

// ---- shape force -------------------------------------------------------------------------

/// A flat square of target points in the z = 0 plane, x and y from -1 to 1.
fn plane_targets() -> Vec<f32> {
    let mut t = Vec::new();
    for i in 0..21 {
        for j in 0..21 {
            t.extend([i as f32 / 10.0 - 1.0, j as f32 / 10.0 - 1.0, 0.0]);
        }
    }
    t
}

#[test]
fn shape_pulls_nodes_onto_a_plane_and_strength_zero_does_nothing() {
    let none = {
        let mut l = Layout3::new(300, &ring_edges(300), 7);
        l.set_shape(&plane_targets(), 60.0, &[], 0.0);
        l.tick(250);
        l.positions()
    };
    let flat = {
        let mut l = Layout3::new(300, &ring_edges(300), 7);
        l.set_shape(&plane_targets(), 60.0, &[], 0.8);
        l.tick(250);
        l.positions()
    };
    assert_eq!(none, run(300, 7, 250), "strength 0 must equal no shape");
    assert!(flat.iter().all(|v| v.is_finite()));
    let (zn, zf) = (spread(&none, 2), spread(&flat, 2));
    assert!(zf < zn * 0.5, "plane did not flatten: z spread {zf} vs {zn}");
    assert!(spread(&flat, 0) > 5.0, "the plane collapsed to a point");
}

#[test]
fn shape_strength_changes_the_pull_and_clear_removes_it() {
    let z_after = |strength: f64| {
        let mut l = Layout3::new(300, &ring_edges(300), 7);
        l.set_shape(&plane_targets(), 60.0, &[], strength);
        l.tick(250);
        spread(&l.positions(), 2)
    };
    let (weak, strong) = (z_after(0.2), z_after(0.9));
    assert!(strong < weak, "stronger pull should flatten more: {strong} vs {weak}");
    let mut l = Layout3::new(300, &ring_edges(300), 7);
    l.set_shape(&plane_targets(), 60.0, &[], 0.9);
    l.clear_shape();
    l.tick(250);
    assert_eq!(l.positions(), run(300, 7, 250));
}

#[test]
fn regions_send_nodes_to_their_own_part_of_the_shape() {
    // left cluster of targets for region 0, right cluster for region 1
    let mut targets = Vec::new();
    let mut regions = Vec::new();
    for i in 0..30 {
        let a = i as f32 * 0.7;
        targets.extend([-1.0 + 0.1 * a.cos(), 0.1 * a.sin(), 0.05 * (a * 1.3).sin()]);
        regions.push(0u8);
        targets.extend([1.0 + 0.1 * a.cos(), 0.1 * a.sin(), 0.05 * (a * 1.3).sin()]);
        regions.push(1u8);
    }
    let n = 120u32;
    let mut l = Layout3::new(n, &[], 3); // no links: only the shape and repel act
    l.set_shape(&targets, 80.0, &regions, 0.9);
    let node_regions: Vec<u8> = (0..n).map(|i| (i % 2) as u8).collect();
    l.set_node_regions(&node_regions);
    l.tick(300);
    let p = l.positions();
    let mean_x = |r: usize| (0..n as usize).filter(|i| i % 2 == r).map(|i| p[3 * i]).sum::<f32>() / (n as f32 / 2.0);
    assert!(mean_x(0) < -40.0, "region 0 not on the left: {}", mean_x(0));
    assert!(mean_x(1) > 40.0, "region 1 not on the right: {}", mean_x(1));
}

#[test]
fn bad_shape_input_is_safe() {
    let mut l = Layout3::new(50, &[], 1);
    l.set_shape(&[], 10.0, &[], 1.0); // empty: no shape
    l.tick(20);
    l.set_shape(&[f32::NAN, f32::INFINITY, 0.0], 10.0, &[], 1.0); // only bad targets: no shape
    l.tick(20);
    l.set_shape(&[1.0, 2.0], 10.0, &[], 1.0); // incomplete triple is ignored
    l.tick(20);
    l.set_shape(&plane_targets(), 60.0, &[], 5.0); // strength is clamped
    l.tick(50);
    assert!(l.positions().iter().all(|v| v.is_finite()));
}

#[test]
fn anchored_notes_go_to_their_own_spot_in_3d() {
    let mut l = Layout3::new(60, &ring_edges(60), 2);
    l.set_shape(&plane_targets(), 60.0, &[], 1.0);
    let mut anchors = vec![0.0f32; 60 * 3];
    let mut flags = vec![0u8; 60];
    anchors[0] = 10.0;
    anchors[1] = -25.0;
    anchors[2] = 15.0;
    flags[0] = 1;
    l.set_anchors(&anchors, &flags);
    l.tick(400);
    let p = l.positions();
    assert!((p[0] - 10.0).abs() < 3.0 && (p[1] + 25.0).abs() < 3.0 && (p[2] - 15.0).abs() < 3.0, "{} {} {}", p[0], p[1], p[2]);
    assert!(p.iter().all(|v| v.is_finite()));
}
