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

    pub fn clear(&self) {
        self.entries.clear();
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

    pub fn read_recent(&self, limit: usize) -> Vec<MemoryEntry> {
        let mut all = self.read_all();
        if all.len() > limit {
            all.drain(0..all.len() - limit);
        }
        all
    }

    pub fn search_relevant(&self, query: &str, limit: usize) -> Vec<MemoryEntry> {
        let query_lower = query.to_lowercase();
        let terms: Vec<&str> = query_lower.split_whitespace().collect();
        let mut all = self.read_all();
        
        if terms.is_empty() {
            return self.read_recent(limit);
        }

        all.sort_by_key(|e| {
            let content_lower = e.content.to_lowercase();
            let score: usize = terms.iter().filter(|&&t| content_lower.contains(t)).count();
            std::cmp::Reverse(score)
        });

        all.truncate(limit);
        all
    }
}
