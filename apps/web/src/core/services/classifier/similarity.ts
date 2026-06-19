/**
 * @file similarity.ts
 * @description Semantic similarity scoring for intent classification.
 *   Bag-of-words vectorizer with keyword boost and anti-keyword penalty.
 */

import type { IntentEmbedding } from './types';
import { INTENT_EMBEDDINGS } from './intent-embeddings';

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

// ---------------------------------------------------------------------------
// Simple bag-of-words vectorizer (replace with sentence-transformers in prod)
// ---------------------------------------------------------------------------

export function textToVector(text: string): number[] {
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  const vocab = Array.from(
    new Set(
      INTENT_EMBEDDINGS.flatMap((e) =>
        e.vectors
          .join(' ')
          .split(/\W+/)
          .filter((w) => w.length > 2)
      )
    )
  );
  return vocab.map((word) => words.filter((w) => w === word).length);
}

// ---------------------------------------------------------------------------
// Compute semantic score for a prompt against an intent embedding
// ---------------------------------------------------------------------------

export function computeSemanticScore(prompt: string, embedding: IntentEmbedding): number {
  const promptVec = textToVector(prompt);
  let maxScore = 0;

  for (const vector of embedding.vectors) {
    const vec = textToVector(vector);
    const sim = cosineSimilarity(promptVec, vec);
    maxScore = Math.max(maxScore, sim);
  }

  // Keyword boost
  const keywordHits = embedding.keywords.filter((kw) =>
    new RegExp(`\\b${kw}\\b`, 'i').test(prompt)
  ).length;
  const keywordBoost = Math.min(keywordHits * 0.15, 0.4);

  // Anti-keyword penalty
  const antiHits = embedding.antiKeywords.filter((kw) =>
    new RegExp(`\\b${kw}\\b`, 'i').test(prompt)
  ).length;
  const antiPenalty = Math.min(antiHits * 0.2, 0.5);

  return Math.max(0, maxScore + keywordBoost - antiPenalty);
}
