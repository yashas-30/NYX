use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

pub struct AgentMemory {
    pub system_prompt: String,
    pub messages: Vec<Message>,
}

impl AgentMemory {
    pub fn new(system_prompt: &str) -> Self {
        Self {
            system_prompt: system_prompt.to_string(),
            messages: vec![],
        }
    }

    pub fn add_user_message(&mut self, content: &str) {
        self.messages.push(Message {
            role: "user".to_string(),
            content: content.to_string(),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    pub fn add_assistant_message(&mut self, content: &str, tool_calls: Option<Vec<Value>>) {
        self.messages.push(Message {
            role: "assistant".to_string(),
            content: content.to_string(),
            tool_calls,
            tool_call_id: None,
        });
    }

    pub fn add_tool_message(&mut self, tool_call_id: &str, content: &str) {
        self.messages.push(Message {
            role: "tool".to_string(),
            content: content.to_string(),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.to_string()),
        });
    }

    pub fn to_llm_messages(&self) -> Vec<Value> {
        let mut out = vec![];
        out.push(serde_json::json!({
            "role": "system",
            "content": self.system_prompt
        }));

        for msg in &self.messages {
            let mut j = serde_json::json!({
                "role": msg.role,
                "content": msg.content
            });
            if let Some(ref tcs) = msg.tool_calls {
                j["tool_calls"] = serde_json::json!(tcs);
            }
            if let Some(ref tid) = msg.tool_call_id {
                j["tool_call_id"] = serde_json::json!(tid);
            }
            out.push(j);
        }
        out
    }
}
