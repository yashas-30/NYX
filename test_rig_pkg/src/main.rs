use rig::providers::openai;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, rig_core::extractor::Extractor)]
struct Verification {
    analysis: String,
    code: String,
}

fn main() {}
