use serde_json::Value;

pub struct SafetyGuard;

impl SafetyGuard {
    /// Validates a tool call payload before it is executed.
    /// Returns Ok(()) if the call is safe, or Err(String) with a detailed violation message.
    pub fn validate_tool_call(name: &str, args: &Value) -> Result<(), String> {
        match name {
            "create_file" => {
                // Prevent path traversal outside the sandboxed directory
                if let Some(filename) = args.get("filename").and_then(|v| v.as_str()) {
                    if filename.contains("..") || filename.starts_with("/") || filename.starts_with("\\") {
                        return Err(format!("Security violation: path traversal detected in filename '{}'", filename));
                    }
                }
            }
            "synthesize_voice" => {
                // Prevent PowerShell injection in voice TTS
                if let Some(text) = args.get("text").and_then(|v| v.as_str()) {
                    let text_lower = text.to_lowercase();
                    if text_lower.contains("start-process") 
                        || text_lower.contains("invoke-expression") 
                        || text_lower.contains("iex")
                        || text_lower.contains("wget")
                        || text_lower.contains("curl") 
                    {
                        return Err("Security violation: prohibited command injection in voice text payload".to_string());
                    }
                }
            }
            "web_search" => {
                // Example guard for excessive result counts that might crash the memory or blow up tokens
                if let Some(num_results) = args.get("num_results").and_then(|v| v.as_u64()) {
                    if num_results > 20 {
                        return Err(format!("Security violation: requested {} search results, maximum allowed is 20", num_results));
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
}
