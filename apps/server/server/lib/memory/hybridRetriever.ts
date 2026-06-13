import MiniSearch from 'minisearch';
import logger from '../logger.js';

export interface RetrievedChunk {
  id: string;
  content: string;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

export class HybridRetriever {
  private miniSearch: MiniSearch;
  private documents: Map<string, { id: string; content: string; sessionId: string }>;

  constructor() {
    this.miniSearch = new MiniSearch({
      fields: ['content'],
      storeFields: ['id', 'content', 'sessionId'],
      searchOptions: {
        boost: { content: 2 },
        fuzzy: 0.2,
      },
    });
    this.documents = new Map();
  }

  addDocument(id: string, content: string, sessionId: string) {
    if (this.documents.has(id)) return;
    const doc = { id, content, sessionId };
    this.documents.set(id, doc);
    try {
      this.miniSearch.add(doc);
    } catch {
      // Already added
    }
  }

  keywordSearch(query: string, limit: number = 10): RetrievedChunk[] {
    const results = this.miniSearch.search(query).slice(0, limit);
    return results.map((r, i) => ({
      id: r.id,
      content: r.content as string,
      score: 1 / (i + 1), // Reciprocal rank
      source: 'keyword' as const,
    }));
  }

  // Reciprocal Rank Fusion
  static rrf(vectorResults: RetrievedChunk[], keywordResults: RetrievedChunk[], k: number = 60): RetrievedChunk[] {
    const scores = new Map<string, { score: number; chunk: RetrievedChunk }>();

    const addRank = (results: RetrievedChunk[]) => {
      results.forEach((r, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        const existing = scores.get(r.id);
        if (existing) {
          existing.score += rrfScore;
        } else {
          scores.set(r.id, { score: rrfScore, chunk: { ...r, source: 'hybrid' } });
        }
      });
    };

    addRank(vectorResults);
    addRank(keywordResults);

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(v => ({ ...v.chunk, score: v.score }));
  }

  async hybridSearch(
    query: string,
    embedding: number[],
    vectorTable: any,
    limit: number = 5
  ): Promise<RetrievedChunk[]> {
    // 1. Vector search
    let vectorResults: RetrievedChunk[] = [];
    try {
      const vResults = await vectorTable.search(embedding).limit(limit * 2).execute();
      vectorResults = vResults
        .filter((r: any) => r.id !== 'init' && r.content)
        .map((r: any, i: number) => ({
          id: r.id,
          content: r.content,
          score: 1 / (i + 1),
          source: 'vector' as const,
        }));
      // Index retrieved docs into MiniSearch for cross-search
      for (const r of vectorResults) {
        this.addDocument(r.id, r.content, '');
      }
    } catch (e: any) {
      logger.warn('[HybridRetriever] Vector search failed:', e.message);
    }

    // 2. Keyword search
    const keywordResults = this.keywordSearch(query, limit * 2);

    // 3. RRF merge
    const merged = HybridRetriever.rrf(vectorResults, keywordResults);
    return merged.slice(0, limit);
  }
}

// Singleton instance
export const hybridRetriever = new HybridRetriever();
