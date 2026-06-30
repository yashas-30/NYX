use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub source_node: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone)]
pub struct Blackboard {
    /// Lock-free storage of the active task context
    pub entries: Arc<DashMap<String, MemoryEntry>>,
}

impl Blackboard {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(DashMap::new()),
        }
    }

    pub fn write_entry(&self, id: String, source_node: String, content: String) {
        let entry = MemoryEntry {
            id: id.clone(),
            source_node,
            content,
            timestamp: chrono::Utc::now().timestamp(),
        };
        self.entries.insert(id, entry);
    }

    pub fn read_all(&self) -> Vec<MemoryEntry> {
        let mut all: Vec<MemoryEntry> = self.entries.iter().map(|kv| kv.value().clone()).collect();
        all.sort_by_key(|e| e.timestamp);
        all
    }
}
