use genai::Client;
use genai::chat::{ChatRequest, ChatMessage};
use genai::resolver::{AuthData, AuthResolver};
use futures_util::StreamExt;

#[tokio::main]
async fn main() {
    let api_key = std::env::var("GEMINI_API_KEY").unwrap_or_default();
    let resolver = AuthResolver::from_resolver_fn(move |_| {
        Ok(Some(AuthData::from_single(api_key.clone())))
    });
    let client = Client::builder().with_auth_resolver(resolver).build();

    let req = ChatRequest::new(vec![
        ChatMessage::user("Hi"),
    ]);

    match client.exec_chat_stream("gemini-3.1-flash-lite", req, None).await {
        Ok(mut stream) => {
            while let Some(res) = stream.stream.next().await {
                match res {
                    Ok(event) => println!("{:?}", event),
                    Err(e) => println!("Stream error: {}", e),
                }
            }
        }
        Err(e) => println!("Error: {}", e),
    }
}
