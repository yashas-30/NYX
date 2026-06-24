use genai::{Client, resolver::{AuthResolver, AuthData}};
use genai::chat::{ChatRequest, ChatMessage};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = "AIzaSyANL8GftltteJhBnEwVoMa_38IxmvFBR1o".to_string();
    let client = Client::builder()
        .with_auth_resolver(AuthResolver::from_resolver_fn(move |_kind| {
            Ok(Some(AuthData::from_single(api_key.clone())))
        }))
        .build();

    let req = ChatRequest::new(vec![ChatMessage::user("hello")]);

    match client.exec_chat_stream("gemini-3.1-flash-lite", req, None).await {
        Ok(_) => println!("Success!"),
        Err(e) => println!("Error: {}", e),
    }
    
    Ok(())
}
