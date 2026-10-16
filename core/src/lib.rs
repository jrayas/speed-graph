//! Speed Graph core. Phase 1: a trivial function to prove the pipeline.
//! Only typed arrays of numbers cross the JS/Rust boundary.

use wasm_bindgen::prelude::*;

pub mod barnes_hut;
pub mod cluster {}
pub mod layout;
pub mod layout3d;
pub mod shape;

pub use layout::Layout;
pub use layout3d::Layout3;

/// Sums a slice of numbers. Used to prove the TypeScript -> Worker -> Wasm round trip.
#[wasm_bindgen]
pub fn sum_f64(values: &[f64]) -> f64 {
    values.iter().sum()
}

#[cfg(test)]
mod tests {
    use super::sum_f64;

    #[test]
    fn sums_values() {
        assert_eq!(sum_f64(&[1.0, 2.5, 3.5]), 7.0);
    }

    #[test]
    fn empty_is_zero() {
        assert_eq!(sum_f64(&[]), 0.0);
    }
}
