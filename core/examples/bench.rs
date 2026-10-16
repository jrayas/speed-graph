//! Native benchmark. Usage:
//! cargo run --release --example bench -- <vault dir> <node count>
//! Reads the vault written by bench/generate-vault.mjs (files `note-<id>.md`
//! containing `[[note-<id>]]` links) and runs the layout until it cools.

use fastgraph_core::Layout;
use std::{env, fs, time::Instant};

fn main() {
    let args: Vec<String> = env::args().collect();
    let dir = args.get(1).expect("vault dir");
    let n: u32 = args.get(2).expect("node count").parse().expect("number");

    let mut edges: Vec<u32> = Vec::new();
    for folder in fs::read_dir(dir).unwrap().flatten() {
        if !folder.file_name().to_string_lossy().starts_with("folder-") {
            continue;
        }
        for file in fs::read_dir(folder.path()).unwrap().flatten() {
            let name = file.file_name().to_string_lossy().into_owned();
            let id: u32 = name.trim_start_matches("note-").trim_end_matches(".md").parse().unwrap();
            let text = fs::read_to_string(file.path()).unwrap();
            for part in text.split("[[note-").skip(1) {
                let target: u32 = part.split("]]").next().unwrap().parse().unwrap();
                edges.extend([id, target]);
            }
        }
    }
    println!("nodes {n}, edges {}", edges.len() / 2);

    let t = Instant::now();
    let mut layout = Layout::new(n, &edges, 1);
    println!("construct: {:.1} ms", t.elapsed().as_secs_f64() * 1e3);

    let t = Instant::now();
    let mut ticks = 0u32;
    while !layout.is_cooled() {
        layout.tick(1);
        ticks += 1;
    }
    let total = t.elapsed().as_secs_f64() * 1e3;
    println!("{ticks} ticks to cool: {total:.0} ms total, {:.2} ms per tick", total / f64::from(ticks));
    let p = layout.positions();
    println!("all finite: {}", p.iter().all(|v| v.is_finite()));
}
