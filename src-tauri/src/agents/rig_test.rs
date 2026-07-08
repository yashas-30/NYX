use rig::providers;

fn main() {
    let _ = providers::openai::Client::new("key");
    let _ = providers::gemini::Client::new("key");
}
