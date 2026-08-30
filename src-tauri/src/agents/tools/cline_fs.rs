// ─────────────────────────────────────────────────────────────────────────────
// NYX — Cline-Standard Sandboxed Filesystem Tools
// ─────────────────────────────────────────────────────────────────────────────

use super::sandbox::WorkspaceSandbox;
use serde::{Deserialize, Serialize};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReadResult {
    pub path: String,
    pub lines_count: usize,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffMatchError {
    pub error: String,
    pub nearest_context: Option<String>,
}

pub struct ClineFsTools {
    pub sandbox: WorkspaceSandbox,
}

impl ClineFsTools {
    pub fn new(sandbox: WorkspaceSandbox) -> Self {
        Self { sandbox }
    }

    /// Reads a file and returns its content formatted with line numbers
    pub async fn read_file(&self, path_str: &str) -> Result<FileReadResult, String> {
        let valid_path = self.sandbox.validate_path(path_str)?;
        let raw = fs::read_to_string(&valid_path)
            .await
            .map_err(|e| format!("Failed to read file '{}': {}", path_str, e))?;

        let lines: Vec<&str> = raw.lines().collect();
        let total_lines = lines.len();

        let mut numbered_content = String::new();
        for (i, line) in lines.iter().enumerate() {
            numbered_content.push_str(&format!("{:4} | {}\n", i + 1, line));
        }

        Ok(FileReadResult {
            path: path_str.to_string(),
            lines_count: total_lines,
            content: numbered_content,
        })
    }

    /// Writes content to a file (creates or overwrites) within the sandbox
    pub async fn write_to_file(&self, path_str: &str, content: &str) -> Result<String, String> {
        let valid_path = self.sandbox.validate_path(path_str)?;

        if let Some(parent) = valid_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Failed to create directories for '{}': {}", path_str, e))?;
            }
        }

        fs::write(&valid_path, content)
            .await
            .map_err(|e| format!("Failed to write file '{}': {}", path_str, e))?;

        Ok(format!("Successfully wrote {} bytes to '{}'.", content.len(), path_str))
    }

    /// Performs surgical search-and-replace edits on a file with error context feedback
    pub async fn replace_in_file(
        &self,
        path_str: &str,
        search_block: &str,
        replace_block: &str,
    ) -> Result<String, String> {
        let valid_path = self.sandbox.validate_path(path_str)?;
        let original_content = fs::read_to_string(&valid_path)
            .await
            .map_err(|e| format!("Failed to read file for diff edit '{}': {}", path_str, e))?;

        // Normalize CRLF to LF for matching
        let norm_original = original_content.replace("\r\n", "\n");
        let norm_search = search_block.replace("\r\n", "\n");
        let norm_replace = replace_block.replace("\r\n", "\n");

        if !norm_original.contains(&norm_search) {
            // Find closest context lines to help model self-correct
            let search_first_line = norm_search.lines().next().unwrap_or("").trim();
            let mut nearest_lines = Vec::new();
            if !search_first_line.is_empty() {
                for (idx, line) in norm_original.lines().enumerate() {
                    if line.contains(search_first_line) || search_first_line.contains(line.trim()) {
                        let start = idx.saturating_sub(3);
                        let end = (idx + 4).min(norm_original.lines().count());
                        for (j, l) in norm_original.lines().enumerate().take(end).skip(start) {
                            nearest_lines.push(format!("{:4} | {}", j + 1, l));
                        }
                        break;
                    }
                }
            }

            let context_hint = if !nearest_lines.is_empty() {
                format!("\nNearest matching context in file:\n{}", nearest_lines.join("\n"))
            } else {
                String::new()
            };

            return Err(format!(
                "Error: SEARCH block was not found in '{}'. Ensure exact whitespace and line match.{}",
                path_str, context_hint
            ));
        }

        // Apply replacement (single instance replacement to avoid ambiguous edits)
        let updated_content = norm_original.replacen(&norm_search, &norm_replace, 1);

        fs::write(&valid_path, updated_content)
            .await
            .map_err(|e| format!("Failed to save modified file '{}': {}", path_str, e))?;

        Ok(format!("Successfully applied surgical diff replacement in '{}'.", path_str))
    }

    /// Deletes a file within the sandbox
    pub async fn delete_file(&self, path_str: &str) -> Result<String, String> {
        let valid_path = self.sandbox.validate_path(path_str)?;
        if !valid_path.exists() {
            return Err(format!("Cannot delete '{}': file does not exist.", path_str));
        }

        if valid_path.is_dir() {
            fs::remove_dir_all(&valid_path)
                .await
                .map_err(|e| format!("Failed to delete directory '{}': {}", path_str, e))?;
            Ok(format!("Successfully deleted directory '{}'.", path_str))
        } else {
            fs::remove_file(&valid_path)
                .await
                .map_err(|e| format!("Failed to delete file '{}': {}", path_str, e))?;
            Ok(format!("Successfully deleted file '{}'.", path_str))
        }
    }

    /// Lists directory contents within the sandbox
    pub async fn list_directory(&self, path_str: &str, recursive: bool) -> Result<Vec<String>, String> {
        let valid_path = self.sandbox.validate_path(path_str)?;
        let mut results = Vec::new();

        if recursive {
            let mut stack = vec![valid_path];
            while let Some(current_dir) = stack.pop() {
                if let Ok(mut entries) = fs::read_dir(&current_dir).await {
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        let path = entry.path();
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" {
                            continue;
                        }

                        if let Ok(ft) = entry.file_type().await {
                            let rel_path = path.strip_prefix(&self.sandbox.root_dir)
                                .unwrap_or(&path)
                                .to_string_lossy()
                                .to_string();

                            if ft.is_dir() {
                                results.push(format!("{}/ [dir]", rel_path));
                                stack.push(path);
                            } else {
                                results.push(rel_path);
                            }
                        }
                    }
                }
            }
        } else {
            let mut entries = fs::read_dir(&valid_path)
                .await
                .map_err(|e| format!("Failed to list directory '{}': {}", path_str, e))?;

            while let Ok(Some(entry)) = entries.next_entry().await {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if let Ok(ft) = entry.file_type().await {
                    if ft.is_dir() {
                        results.push(format!("{}/ [dir]", file_name));
                    } else {
                        results.push(file_name);
                    }
                }
            }
        }

        Ok(results)
    }

    /// Grep searches text across sandbox files
    pub async fn grep_search(&self, query: &str, path_filter: Option<&str>) -> Result<Vec<String>, String> {
        let base_dir = if let Some(sub) = path_filter {
            self.sandbox.validate_path(sub)?
        } else {
            self.sandbox.root_dir.clone()
        };

        let mut matches = Vec::new();
        let mut stack = vec![base_dir];

        while let Some(dir) = stack.pop() {
            if let Ok(mut entries) = fs::read_dir(&dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
                        continue;
                    }

                    if let Ok(ft) = entry.file_type().await {
                        if ft.is_dir() {
                            stack.push(path);
                        } else if ft.is_file() {
                            if let Ok(content) = fs::read_to_string(&path).await {
                                for (i, line) in content.lines().enumerate() {
                                    if line.contains(query) {
                                        let rel_path = path.strip_prefix(&self.sandbox.root_dir)
                                            .unwrap_or(&path)
                                            .to_string_lossy();
                                        matches.push(format!("{}:{}: {}", rel_path, i + 1, line.trim()));
                                        if matches.len() >= 50 {
                                            return Ok(matches);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(matches)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cline_fs_operations() {
        let temp_dir = std::env::temp_dir().join("nyx_cline_test");
        let _ = std::fs::create_dir_all(&temp_dir);

        let sandbox = WorkspaceSandbox::new(&temp_dir);
        let tools = ClineFsTools::new(sandbox);

        // 1. Write file
        let write_res = tools.write_to_file("main.rs", "fn main() {\n    println!(\"Hello\");\n}\n").await;
        assert!(write_res.is_ok(), "Expected write to succeed");

        // 2. Read file with line numbering
        let read_res = tools.read_file("main.rs").await;
        assert!(read_res.is_ok(), "Expected read to succeed");
        let read_val = read_res.unwrap();
        assert_eq!(read_val.lines_count, 3);
        assert!(read_val.content.contains("1 | fn main()"));

        // 3. Surgical diff replacement
        let replace_res = tools.replace_in_file("main.rs", "println!(\"Hello\");", "println!(\"Hello NYX\");").await;
        assert!(replace_res.is_ok(), "Expected replace to succeed");

        let read_after = tools.read_file("main.rs").await.unwrap();
        assert!(read_after.content.contains("println!(\"Hello NYX\");"));

        // 4. Mismatch failure with error hint
        let bad_replace = tools.replace_in_file("main.rs", "nonexistent_block();", "noop").await;
        assert!(bad_replace.is_err(), "Expected replace to fail on mismatch");

        // 5. Delete file
        let del_res = tools.delete_file("main.rs").await;
        assert!(del_res.is_ok(), "Expected delete to succeed");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

