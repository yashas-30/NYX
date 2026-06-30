use lancedb::{connect, Connection, Table};
use std::sync::Arc;
use tokio::sync::Mutex;
use arrow_schema::{DataType, Field, Schema};
use arrow_array::{Array, RecordBatch, StringArray, Float32Array, FixedSizeListArray};
use futures_util::StreamExt;
use lancedb::query::{QueryBase, ExecutableQuery};

pub struct LanceDbStore {
    db: Arc<Mutex<Option<Connection>>>,
    table: Arc<Mutex<Option<Table>>>,
}

impl LanceDbStore {
    pub fn new() -> Self {
        Self {
            db: Arc::new(Mutex::new(None)),
            table: Arc::new(Mutex::new(None)),
        }
    }

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
            Ok(t) => t,
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

        Ok(())
    }

    pub async fn search_hybrid(&self, query_vector: Vec<f32>, limit: usize) -> Result<Vec<String>, String> {
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

        let mut matched_texts = Vec::new();
        
        while let Some(batch_res) = results.next().await {
            let batch = batch_res.map_err(|e| format!("Batch error: {}", e))?;
            let text_col = batch.column_by_name("text")
                .ok_or("Text column missing")?
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or("Failed to cast text column")?;

            for i in 0..text_col.len() {
                if !text_col.is_null(i) {
                    matched_texts.push(text_col.value(i).to_string());
                }
            }
        }

        Ok(matched_texts)
    }
}
