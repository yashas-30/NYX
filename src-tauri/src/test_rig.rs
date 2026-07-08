use rig::providers::ollama;

fn main() {
    let client = ollama::Client::new("http://localhost:11434");
    println!("Ollama client created");
}
