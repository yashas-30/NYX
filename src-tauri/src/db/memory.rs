use std::sync::Arc;
use tokio::sync::Mutex;
use turbovec::TurboQuantIndex;

pub struct HermesMemoryState {
    pub index: Arc<Mutex<Option<TurboQuantIndex>>>,
    pub metadata: Arc<Mutex<Vec<MemoryMeta>>>,
}

pub struct MemoryMeta {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: i64,
}

impl Default for HermesMemoryState {
    fn default() -> Self {
        Self {
            index: Arc::new(Mutex::new(None)),
            metadata: Arc::new(Mutex::new(Vec::new())),
        }
    }
}
