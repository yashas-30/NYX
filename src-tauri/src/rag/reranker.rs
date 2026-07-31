use std::collections::HashMap;
use crate::rag::embeddings::Embedder;

#[derive(Debug, Clone)]
pub struct ScrapedChunk {
    pub source_id: usize,
    pub title: String,
    pub url: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct RankedChunk {
    pub chunk: ScrapedChunk,
    pub hybrid_score: f32,
    pub bm25_score: f32,
    pub cosine_score: f32,
}

pub struct SnippetReranker;

impl SnippetReranker {
    fn tokenize(text: &str) -> Vec<String> {
        text.to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| s.len() > 1)
            .map(|s| s.to_string())
            .collect()
    }

    pub fn compute_bm25(query: &str, chunks: &[ScrapedChunk]) -> Vec<f32> {
        let query_tokens = Self::tokenize(query);
        if query_tokens.is_empty() || chunks.is_empty() {
            return vec![0.0; chunks.len()];
        }

        let num_docs = chunks.len() as f32;
        let doc_tokens: Vec<Vec<String>> = chunks.iter().map(|c| Self::tokenize(&c.text)).collect();
        let total_words: usize = doc_tokens.iter().map(|d| d.len()).sum();
        let avgdl = total_words as f32 / num_docs.max(1.0);

        let mut df: HashMap<String, f32> = HashMap::new();
        for token in &query_tokens {
            if !df.contains_key(token) {
                let count = doc_tokens.iter().filter(|doc| doc.contains(token)).count();
                df.insert(token.clone(), count as f32);
            }
        }

        let k1: f32 = 1.2;
        let b: f32 = 0.75;

        doc_tokens.iter().map(|doc| {
            let doc_len = doc.len() as f32;
            let mut score = 0.0;

            for q_term in &query_tokens {
                let n_q = df.get(q_term).copied().unwrap_or(0.0);
                if n_q == 0.0 { continue; }

                let idf = ((num_docs - n_q + 0.5) / (n_q + 0.5) + 1.0).ln();
                let tf = doc.iter().filter(|&t| t == q_term).count() as f32;

                let numerator = tf * (k1 + 1.0);
                let denominator = tf + k1 * (1.0 - b + b * (doc_len / avgdl.max(1.0)));

                score += idf * (numerator / denominator);
            }
            score
        }).collect()
    }

    pub fn compute_cosine_similarities(query_vec: &[f32], chunk_vecs: &[Vec<f32>]) -> Vec<f32> {
        let q_norm = query_vec.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-9);

        chunk_vecs.iter().map(|c_vec| {
            let dot_product: f32 = query_vec.iter().zip(c_vec.iter()).map(|(a, b)| a * b).sum();
            let c_norm = c_vec.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-9);
            dot_product / (q_norm * c_norm)
        }).collect()
    }

    pub async fn rerank_and_select_top_k(
        query: &str,
        chunks: Vec<ScrapedChunk>,
        embedder: &Embedder,
        top_k: usize,
    ) -> Result<Vec<RankedChunk>, String> {
        if chunks.is_empty() {
            return Ok(Vec::new());
        }

        let raw_bm25 = Self::compute_bm25(query, &chunks);
        let max_bm25 = raw_bm25.iter().copied().fold(0.0f32, f32::max);
        let min_bm25 = raw_bm25.iter().copied().fold(f32::INFINITY, f32::min);
        let bm25_range = (max_bm25 - min_bm25).max(1e-5);

        let norm_bm25: Vec<f32> = raw_bm25.iter().map(|&s| (s - min_bm25) / bm25_range).collect();

        let mut embed_texts = vec![query.to_string()];
        embed_texts.extend(chunks.iter().map(|c| c.text.clone()));

        let embeddings = embedder.embed(embed_texts).await?;
        if embeddings.is_empty() {
            return Ok(chunks.into_iter().take(top_k).map(|chunk| RankedChunk {
                chunk,
                hybrid_score: 1.0,
                bm25_score: 1.0,
                cosine_score: 1.0,
            }).collect());
        }

        let query_vec = &embeddings[0];
        let chunk_vecs = &embeddings[1..];

        let cosine_sims = Self::compute_cosine_similarities(query_vec, chunk_vecs);

        let alpha = 0.65;
        let mut ranked: Vec<RankedChunk> = chunks.into_iter().enumerate().map(|(idx, chunk)| {
            let cos = cosine_sims.get(idx).copied().unwrap_or(0.0);
            let bm25 = norm_bm25.get(idx).copied().unwrap_or(0.0);
            let hybrid = alpha * cos + (1.0 - alpha) * bm25;

            RankedChunk {
                chunk,
                hybrid_score: hybrid,
                bm25_score: raw_bm25.get(idx).copied().unwrap_or(0.0),
                cosine_score: cos,
            }
        }).collect();

        ranked.sort_by(|a, b| b.hybrid_score.partial_cmp(&a.hybrid_score).unwrap_or(std::cmp::Ordering::Equal));

        let selected = ranked.into_iter().take(top_k).collect();
        Ok(selected)
    }
}
