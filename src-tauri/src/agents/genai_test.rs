use genai::chat::{ChatRequest, ChatMessage, Tool, ToolCall, ChatOptions};

pub fn check_types() {
    let req = ChatRequest::new(vec![]);
    let tool = Tool::new("test");
}
