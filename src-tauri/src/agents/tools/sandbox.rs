// ─────────────────────────────────────────────────────────────────────────────
// NYX — Workspace Sandbox Boundary Enforcer (Sandboxed Security)
// ─────────────────────────────────────────────────────────────────────────────

use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct WorkspaceSandbox {
    pub root_dir: PathBuf,
}

impl WorkspaceSandbox {
    pub fn new<P: Into<PathBuf>>(root: P) -> Self {
        let root_dir = root.into();
        Self { root_dir }
    }

    /// Resolves and strictly validates that a path lies inside the workspace root.
    /// Resolves symlinks and prevents `../` path traversal attacks.
    pub fn validate_path(&self, relative_or_abs: &str) -> Result<PathBuf, String> {
        let trimmed = relative_or_abs.trim();
        if trimmed.is_empty() {
            return Err("Path cannot be empty".to_string());
        }

        let raw_path = Path::new(trimmed);
        let candidate = if raw_path.is_absolute() {
            raw_path.to_path_buf()
        } else {
            self.root_dir.join(raw_path)
        };

        // Canonicalize the root directory
        let canonical_root = self.root_dir.canonicalize()
            .map_err(|e| format!("Failed to resolve workspace root '{}': {}", self.root_dir.display(), e))?;

        // If file exists, canonicalize it directly
        let canonical_target = if candidate.exists() {
            candidate.canonicalize()
                .map_err(|e| format!("Failed to canonicalize path '{}': {}", candidate.display(), e))?
        } else {
            // For new files that don't exist yet, validate and canonicalize parent directory
            let parent = candidate.parent()
                .ok_or_else(|| format!("Path '{}' has no parent directory", candidate.display()))?;

            if !parent.exists() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory '{}': {}", parent.display(), e))?;
            }

            let canonical_parent = parent.canonicalize()
                .map_err(|e| format!("Failed to resolve parent directory '{}': {}", parent.display(), e))?;

            if let Some(file_name) = candidate.file_name() {
                canonical_parent.join(file_name)
            } else {
                return Err(format!("Invalid file name in path '{}'", candidate.display()));
            }
        };

        // Strict prefix containment check
        if !canonical_target.starts_with(&canonical_root) {
            return Err(format!(
                "Security Sandbox Violation: Path '{}' resolves outside the active workspace '{}'.",
                trimmed, self.root_dir.display()
            ));
        }

        Ok(canonical_target)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sandbox_path_validation() {
        let temp_dir = std::env::temp_dir().join("nyx_sandbox_test");
        let _ = std::fs::create_dir_all(&temp_dir);

        let sandbox = WorkspaceSandbox::new(&temp_dir);

        // 1. Valid internal file
        let valid = sandbox.validate_path("subfolder/test.txt");
        assert!(valid.is_ok(), "Expected valid internal path");

        // 2. Invalid traversal escape
        let invalid = sandbox.validate_path("../outside.txt");
        assert!(invalid.is_err(), "Expected error on traversal escape");
        assert!(invalid.unwrap_err().contains("Security Sandbox Violation"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

