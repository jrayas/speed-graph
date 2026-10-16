use fastgraph_core::Layout;

/// Deterministic ring plus a few chords, for n nodes.
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
    let mut layout = Layout::new(n, &ring_edges(n), seed);
    layout.tick(ticks);
    layout.positions()
}

fn dist(p: &[f32], a: usize, b: usize) -> f32 {
    ((p[2 * a] - p[2 * b]).powi(2) + (p[2 * a + 1] - p[2 * b + 1]).powi(2)).sqrt()
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
fn start_positions_are_seeded_and_finite() {
    let a = Layout::new(100, &[], 1).positions();
    let b = Layout::new(100, &[], 1).positions();
    let c = Layout::new(100, &[], 2).positions();
    assert_eq!(a, b);
    assert_ne!(a, c);
    assert!(a.iter().all(|v| v.is_finite()));
}

#[test]
fn stays_finite_and_bounded_and_cools() {
    let n = 500;
    let mut layout = Layout::new(n, &ring_edges(n), 3);
    layout.tick(10_000);
    assert!(layout.is_cooled());
    let p = layout.positions();
    assert!(p.iter().all(|v| v.is_finite()));
    assert!(p.iter().all(|v| v.abs() < 1.0e5), "layout exploded");
}

fn mean_move(before: &[f32], after: &[f32]) -> f32 {
    let n = before.len() / 2;
    (0..n).map(|i| ((before[2 * i] - after[2 * i]).powi(2) + (before[2 * i + 1] - after[2 * i + 1]).powi(2)).sqrt()).sum::<f32>() / n as f32
}

#[test]
fn motion_dies_down_as_it_cools() {
    let n = 200;
    let mut layout = Layout::new(n, &ring_edges(n), 5);
    let a = layout.positions();
    layout.tick(5);
    let early = mean_move(&a, &layout.positions());
    layout.tick(250);
    let b = layout.positions();
    layout.tick(5);
    let late = mean_move(&b, &layout.positions());
    assert!(late < early * 0.1, "early {early}, late {late}");
    // Once cooled, further ticks change nothing.
    layout.tick(10_000);
    assert!(layout.is_cooled());
    let done = layout.positions();
    layout.tick(10);
    assert_eq!(done, layout.positions());
}

#[test]
fn centre_force_keeps_the_mean_near_the_origin() {
    let n = 300;
    let mut layout = Layout::new(n, &ring_edges(n), 11);
    layout.tick(200);
    let p = layout.positions();
    let mx: f32 = (0..n as usize).map(|i| p[2 * i]).sum::<f32>() / n as f32;
    let my: f32 = (0..n as usize).map(|i| p[2 * i + 1]).sum::<f32>() / n as f32;
    assert!(mx.abs() < 1.0 && my.abs() < 1.0, "mean ({mx}, {my})");
}

#[test]
fn link_force_pulls_a_pair_to_the_link_distance() {
    let mut layout = Layout::new(2, &[0, 1], 1);
    // No repel, so only the link force acts.
    layout.set_params(1.0, 0.0, 1.0, 50.0, 0.9, 0.4, 0.0, f64::INFINITY);
    layout.tick(10_000);
    let d = dist(&layout.positions(), 0, 1);
    assert!((d - 50.0).abs() < 1.0, "distance {d}");
}

#[test]
fn repel_pushes_unlinked_nodes_apart() {
    let mut with = Layout::new(2, &[], 1);
    let mut without = Layout::new(2, &[], 1);
    without.set_params(1.0, 0.0, 1.0, 30.0, 0.9, 0.4, 0.0, f64::INFINITY);
    with.tick(100);
    without.tick(100);
    assert!(dist(&with.positions(), 0, 1) > dist(&without.positions(), 0, 1) + 1.0);
}

#[test]
fn linked_nodes_end_up_closer_than_unlinked_ones() {
    // Two separate triangles, then compare within-triangle and between-triangle distances.
    let edges = [0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3];
    let mut layout = Layout::new(6, &edges, 4);
    layout.tick(10_000);
    let p = layout.positions();
    let within = (dist(&p, 0, 1) + dist(&p, 1, 2) + dist(&p, 3, 4) + dist(&p, 4, 5)) / 4.0;
    let between = (dist(&p, 0, 3) + dist(&p, 1, 4) + dist(&p, 2, 5)) / 3.0;
    assert!(within < between, "within {within}, between {between}");
}

#[test]
fn ignores_invalid_edges_and_handles_empty_graphs() {
    let mut layout = Layout::new(3, &[0, 0, 5, 1, 1, 2, 9], 1);
    layout.tick(50);
    assert!(layout.positions().iter().all(|v| v.is_finite()));
    let mut empty = Layout::new(0, &[], 1);
    empty.tick(10);
    assert!(empty.positions().is_empty());
    let mut one = Layout::new(1, &[], 1);
    one.tick(10);
    assert!(one.positions().iter().all(|v| v.is_finite()));
}

#[test]
fn many_coincident_nodes_do_not_produce_nan() {
    // Many nodes, no edges, centre-heavy: stresses the jiggle path.
    let mut layout = Layout::new(400, &[], 2);
    layout.set_params(1.0, -30.0, 1.0, 30.0, 0.9, 0.4, 0.0, f64::INFINITY);
    layout.tick(300);
    assert!(layout.positions().iter().all(|v| v.is_finite()));
}

#[test]
fn fixed_node_stays_put_while_others_move() {
    let n = 50;
    let mut layout = Layout::new(n, &ring_edges(n), 6);
    layout.fix_node(0, 123.0, -45.0);
    layout.tick(100);
    let p = layout.positions();
    assert_eq!((p[0], p[1]), (123.0, -45.0));
    // The pinned node still pulls its neighbours towards it.
    assert!(dist(&p, 0, 1) < 400.0);
    layout.release_node(0);
    layout.reheat(1.0);
    layout.tick(50);
    assert_ne!((layout.positions()[0], layout.positions()[1]), (123.0, -45.0));
}

#[test]
fn set_positions_warm_starts_and_ignores_extra_entries() {
    let mut layout = Layout::new(3, &[], 1);
    layout.set_positions(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]);
    assert_eq!(layout.positions(), vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    layout.set_positions(&[9.0, 9.0]);
    assert_eq!(&layout.positions()[..2], &[9.0, 9.0]);
}

fn mean_radius(p: &[f32]) -> f32 {
    let n = p.len() / 2;
    (0..n).map(|i| (p[2 * i].powi(2) + p[2 * i + 1].powi(2)).sqrt()).sum::<f32>() / n as f32
}

#[test]
fn gravity_keeps_unlinked_nodes_closer_to_the_centre() {
    let run_with = |gravity: f64| {
        let mut layout = Layout::new(300, &[], 2);
        layout.set_params(1.0, -30.0, 1.0, 30.0, 0.9, 0.4, gravity, f64::INFINITY);
        layout.tick(10_000);
        mean_radius(&layout.positions())
    };
    assert!(run_with(0.1) < run_with(0.0) * 0.6, "gravity did not pull nodes in");
}

#[test]
fn repel_stops_beyond_its_maximum_distance() {
    // Two nodes 100 apart, the left one pinned. With a reach of 50 the free node feels nothing;
    // with no limit it is pushed away. The centre force is off so it cannot interfere.
    let moved = |reach: f64| {
        let mut layout = Layout::new(2, &[], 1);
        layout.set_params(0.0, -30.0, 1.0, 30.0, 0.9, 0.4, 0.0, reach);
        layout.set_positions(&[-50.0, 0.0, 50.0, 0.0]);
        layout.fix_node(0, -50.0, 0.0);
        layout.tick(20);
        (layout.positions()[2] - 50.0).abs()
    };
    assert!(moved(50.0) < 0.5, "limited repel still moved the node by {}", moved(50.0));
    assert!(moved(f64::INFINITY) > 1.0, "unlimited repel did not move the node");
}

// ---- shape force (2D) --------------------------------------------------------------------

#[test]
fn shape_pulls_nodes_onto_a_ring_in_2d() {
    // 90 target points on a circle of radius 1 (z is ignored in 2D), scaled to 80
    let mut targets = Vec::new();
    for i in 0..90 {
        let a = i as f32 / 90.0 * std::f32::consts::TAU;
        targets.extend([a.cos(), a.sin(), 0.7]);
    }
    let radius_error = |strength: f64| {
        let mut l = Layout::new(200, &[], 5);
        l.set_shape(&targets, 80.0, &[], strength);
        l.tick(300);
        let p = l.positions();
        assert!(p.iter().all(|v| v.is_finite()));
        (0..200).map(|i| ((p[2 * i].powi(2) + p[2 * i + 1].powi(2)).sqrt() - 80.0).abs()).sum::<f32>() / 200.0
    };
    let (off, on) = (radius_error(0.0), radius_error(0.9));
    // nodes still repel each other, so they sit near the ring rather than exactly on it
    assert!(on < off * 0.2, "ring fit {on} vs unshaped {off}");
}

#[test]
fn shape_in_2d_can_be_cleared_and_ignores_bad_input() {
    let mut a = Layout::new(100, &[], 2);
    a.set_shape(&[0.0, 0.0, 0.0, 1.0, 1.0, 0.0], 50.0, &[], 1.0);
    a.clear_shape();
    a.tick(100);
    let mut b = Layout::new(100, &[], 2);
    b.tick(100);
    assert_eq!(a.positions(), b.positions());
    a.set_shape(&[f32::NAN, 0.0, 0.0], 10.0, &[], 1.0);
    a.tick(10);
    assert!(a.positions().iter().all(|v| v.is_finite()));
}
