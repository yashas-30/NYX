use lancedb::{connect, Connection, Table};
use lancedb::index::Index;
use lance_index::scalar::FullTextSearchQuery;
use std::sync::Arc;
use tokio::sync::Mutex;
use arrow_schema::{DataType, Field, Schema};
use arrow_array::{Array, RecordBatch, StringArray, Float32Array, FixedSizeListArray};
use futures_util::StreamExt;
use lancedb::query::{QueryBase, ExecutableQuery};
use std::collections::HashMap;
use tracing::info;

pub struct LanceDbStore {
    db: Arc<Mutex<Option<Connection>>>,
    table: Arc<Mutex<Option<Table>>>,
    /// Tracks whether any rows have been inserted (set atomically on first insert).
    /// Allows the conductor to skip RAG search without acquiring any async lock.
    entry_count: Arc<std::sync::atomic::AtomicUsize>,
    /// Whether the FTS index has been created yet.
    fts_indexed: Arc<std::sync::atomic::AtomicBool>,
}

impl LanceDbStore {
    pub fn new() -> Self {
        Self {
            db: Arc::new(Mutex::new(None)),
            table: Arc::new(Mutex::new(None)),
            entry_count: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            fts_indexed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }
}

impl Default for LanceDbStore {
    fn default() -> Self {
        Self::new()
    }
}

impl LanceDbStore {
    pub async fn init(&self, db_path: &str) -> Result<(), String> {
        let connection = connect(db_path).execute().await
            .map_err(|e| format!("Failed to connect to lancedb: {}", e))?;
        
        let schema = Arc::new(Schema::new(vec![
            Field::new("id", DataType::Utf8, false),
            Field::new("text", DataType::Utf8, false),
            Field::new("vector", DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float32, true)),
                384,
            ), false),
            Field::new("metadata", DataType::Utf8, true),
        ]));

        let table_name = "documents";
        let table = match connection.open_table(table_name).execute().await {
            Ok(t) => {
                info!("Opened existing LanceDB table '{}'", table_name);
                t
            }
            Err(_) => {
                let empty_id = StringArray::from(Vec::<String>::new());
                let empty_text = StringArray::from(Vec::<String>::new());
                let empty_vector_values = Float32Array::from(Vec::<f32>::new());
                let empty_vector = FixedSizeListArray::try_new(
                    Arc::new(Field::new("item", DataType::Float32, true)),
                    384,
                    Arc::new(empty_vector_values),
                    None
                ).unwrap();
                let empty_metadata = StringArray::from(Vec::<String>::new());

                let batch = RecordBatch::try_new(
                    schema.clone(),
                    vec![
                        Arc::new(empty_id),
                        Arc::new(empty_text),
                        Arc::new(empty_vector),
                        Arc::new(empty_metadata),
                    ]
                ).unwrap();

                info!("Creating new LanceDB table '{}'", table_name);
                connection.create_table(table_name, vec![batch]).execute().await
                    .map_err(|e| format!("Failed to create table: {}", e))?
            }
        };

        *self.db.lock().await = Some(connection);
        *self.table.lock().await = Some(table);
        Ok(())
    }

    pub async fn insert(&self, id: String, text: String, vector: Vec<f32>, metadata: String) -> Result<(), String> {
        let table_guard = self.table.lock().await;
        let table = table_guard.as_ref().ok_or("Table not initialized")?;

        let schema = Arc::new(Schema::new(vec![
            Field::new("id", DataType::Utf8, false),
            Field::new("text", DataType::Utf8, false),
            Field::new("vector", DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float32, true)),
                384,
            ), false),
            Field::new("metadata", DataType::Utf8, true),
        ]));

        let id_array = StringArray::from(vec![id]);
        let text_array = StringArray::from(vec![text]);
        let vector_values = Float32Array::from(vector);
        let vector_array = FixedSizeListArray::try_new(
            Arc::new(Field::new("item", DataType::Float32, true)),
            384,
            Arc::new(vector_values),
            None
        ).map_err(|e| format!("Vector format error: {}", e))?;
        let metadata_array = StringArray::from(vec![metadata]);

        let batch = RecordBatch::try_new(
            schema,
            vec![
                Arc::new(id_array),
                Arc::new(text_array),
                Arc::new(vector_array),
                Arc::new(metadata_array),
            ]
        ).map_err(|e| format!("RecordBatch error: {}", e))?;

        table.add(vec![batch]).execute().await
            .map_err(|e| format!("Failed to insert records: {}", e))?;

        // Mark that we now have at least one entry
        self.entry_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        // Any new inserts invalidate the FTS index — mark as needing rebuild.
        self.fts_indexed.store(false, std::sync::atomic::Ordering::Relaxed);

        Ok(())
    }

    /// Builds the FTS (BM25/Tantivy) index on the `text` column.
    /// Must be called after all inserts are complete — typically at the end
    /// of `index_workspace()`. Safe to call multiple times (LanceDB replaces).
    pub async fn build_fts_index(&self) -> Result<(), String> {
        let table_guard = self.table.lock().await;
        let table = table_guard.as_ref().ok_or("Table not initialized")?;

        table.create_index(&["text"], Index::FTS(Default::default()))
            .execute()
            .await
            .map_err(|e| format!("Failed to build FTS index: {}", e))?;

        self.fts_indexed.store(true, std::sync::atomic::Ordering::Relaxed);
        info!("LanceDB FTS (BM25/Tantivy) index built on 'text' column");
        Ok(())
    }

    /// Returns true if any entries have been indexed.
    /// Called by CodebaseScanner::is_indexed() — zero async overhead.
    pub fn has_entries(&self) -> bool {
        self.entry_count.load(std::sync::atomic::Ordering::Relaxed) > 0
    }

    /// Pure vector (HNSW) search. Returns `(text, metadata)` pairs ranked by
    /// cosine similarity (closest first).
    pub async fn search_vector(&self, query_vector: Vec<f32>, limit: usize) -> Result<Vec<(String, String)>, String> {
        let table_guard = self.table.lock().await;
        let table = table_guard.as_ref().ok_or("Table not initialized")?;

        let mut results = table
            .query()
            .limit(limit)
            .nearest_to(&query_vector[..])
            .map_err(|e| format!("Query setup error: {}", e))?
            .execute()
            .await
            .map_err(|e| format!("Query execution error: {}", e))?;

        let mut matched = Vec::new();
        
        while let Some(batch_res) = results.next().await {
            let batch = batch_res.map_err(|e| format!("Batch error: {}", e))?;
            let text_col = batch.column_by_name("text")
                .ok_or("Text column missing")?
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or("Failed to cast text column")?;
            let metadata_col = batch.column_by_name("metadata")
                .ok_or("Metadata column missing")?
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or("Failed to cast metadata column")?;

            for i in 0..text_col.len() {
                if !text_col.is_null(i) {
                    let text = text_col.value(i).to_string();
                    let metadata = if metadata_col.is_null(i) {
                        String::new()
                    } else {
                        metadata_col.value(i).to_string()
                    };
                    matched.push((text, metadata));
                }
            }
        }

        Ok(matched)
    }

    /// BM25 full-text search. Returns `(text, metadata)` pairs ranked by
    /// keyword relevance (Tantivy/BM25 scoring).
    /// Falls back to empty results if FTS index hasn't been built yet.
    pub async fn search_fts(&self, query_text: &str, limit: usize) -> Result<Vec<(String, String)>, String> {
        if !self.fts_indexed.load(std::sync::atomic::Ordering::Relaxed) {
            // FTS index not built yet — return empty rather than error
            return Ok(Vec::new());
        }

        let table_guard = self.table.lock().await;
        let table = table_guard.as_ref().ok_or("Table not initialized")?;

        let mut results = table
            .query()
            .full_text_search(
                FullTextSearchQuery::new(query_text.to_string()),
            )
            .limit(limit)
            .execute()
            .await
            .map_err(|e| format!("FTS query error: {}", e))?;

        let mut matched = Vec::new();

        while let Some(batch_res) = results.next().await {
            let batch = batch_res.map_err(|e| format!("FTS batch error: {}", e))?;
            let text_col = batch.column_by_name("text")
                .ok_or("Text column missing in FTS result")?
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or("Failed to cast text column")?;
            let metadata_col = batch.column_by_name("metadata")
                .ok_or("Metadata column missing in FTS result")?
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or("Failed to cast metadata column")?;

            for i in 0..text_col.len() {
                if !text_col.is_null(i) {
                    let text = text_col.value(i).to_string();
                    let metadata = if metadata_col.is_null(i) {
                        String::new()
                    } else {
                        metadata_col.value(i).to_string()
                    };
                    matched.push((text, metadata));
                }
            }
        }

        Ok(matched)
    }

    /// Hybrid search: runs vector + BM25 searches in parallel, then merges
    /// results using Reciprocal Rank Fusion (RRF, k=60).
    ///
    /// RRF score = Σ 1/(k + rank) — documents in both lists get boosted.
    /// This catches both semantic matches (vector) and exact identifiers (BM25).
    pub async fn search_hybrid(
        &self,
        query_text: &str,
        query_vector: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<(String, String)>, String> {
        // Run both searches concurrently
        let (vec_results, fts_results) = tokio::join!(
            self.search_vector(query_vector, limit * 2),
            self.search_fts(query_text, limit * 2),
        );

        let vec_results = vec_results.unwrap_or_default();
        let fts_results = fts_results.unwrap_or_default();

        // --- Reciprocal Rank Fusion (k=60) ---
        // Score each unique (text, metadata) pair by its rank position in each list.
        // Use text as the key since it's the chunk content.
        const K: f64 = 60.0;
        let mut rrf_scores: HashMap<String, f64> = HashMap::new();
        // We also need to store the metadata for each key
        let mut meta_map: HashMap<String, String> = HashMap::new();

        for (rank, (text, meta)) in vec_results.iter().enumerate() {
            let score = 1.0 / (K + (rank + 1) as f64);
            *rrf_scores.entry(text.clone()).or_insert(0.0) += score;
            meta_map.entry(text.clone()).or_insert_with(|| meta.clone());
        }

        for (rank, (text, meta)) in fts_results.iter().enumerate() {
            let score = 1.0 / (K + (rank + 1) as f64);
            *rrf_scores.entry(text.clone()).or_insert(0.0) += score;
            meta_map.entry(text.clone()).or_insert_with(|| meta.clone());
        }

        // Sort by descending RRF score
        let mut ranked: Vec<(String, f64)> = rrf_scores.into_iter().collect();
        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let results = ranked.into_iter()
            .take(limit)
            .map(|(text, _score)| {
                let meta = meta_map.remove(&text).unwrap_or_default();
                (text, meta)
            })
            .collect();

        Ok(results)
    }
}
