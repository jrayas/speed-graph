//! Small seeded random number generator (splitmix64). No external crate.

pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng(u64::from(seed) ^ 0x9E37_79B9_7F4A_7C15)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in [0, 1).
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// d3-force's "jiggle": a tiny random offset used to break exact ties.
    pub fn jiggle(&mut self) -> f64 {
        (self.next_f64() - 0.5) * 1e-6
    }
}
