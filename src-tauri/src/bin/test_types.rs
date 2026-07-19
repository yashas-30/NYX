use rig::providers::gemini;
use rig::streaming::StreamingPrompt;
use rig::client::CompletionClient;
use futures_util::StreamExt;

#[tokio::main]
async fn main() {
    let client = gemini::Client::new("fake").unwrap();
        
    let agent = client.agent("gemini-1.5-pro").build();
    let mut stream = agent.stream_prompt("test").await;
    while let Some(chunk_res) = stream.next().await {
        println!("Chunk: {:?}", chunk_res);
    }
}
