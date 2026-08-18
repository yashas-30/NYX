/**
 * hierarchicalMemory.ts
 *
 * Three-tier hierarchical memory system for Lucifer.
 *
 * Tier 1 — Episodic (conversation-scoped, short-term):
 *   Stored in the Rust SQLite DB via `get_episodic_memories`.
 *   Decays automatically (Rust side already has timestamps).
 *   Retrieved by session recency.
 *
 * Tier 2 — Semantic (user-scoped facts & preferences):
 *   Named entities extracted from conversations.
 *   Stored in `memory_entities` table via `get_memory_entities`.
 *   Queried by keyword relevance to current topic.
 *
 * Tier 3 — Procedural (successful strategies & learned patterns):
 *   Pure TypeScript in-memory store (Zustand persisted to localStorage).
 *   "When I searched for X with provider Y and got good results, store that."
 *   Used to bias the model router and search strategy for future turns.
 *
 * Retrieval is ALWAYS parallel across all three tiers (Promise.all).
 * Results are merged and ranked before injecting into the prompt.
 */

import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { startSpan, endSpan } from './observabilitySpans';

// ── Tier 3: Procedural memory types ──────────────────────────────────────────

export interface ProceduralMemoryEntry {
  id: string;
  pattern: string;         // What the task/topic was about
  strategy: string;        // What worked (e.g. "use tavily + gemini-flash for news queries")
  successCount: number;
  failCount: number;
  lastUsedMs: number;
  createdMs: number;
  tags: string[];          // e.g. ['news', 'search', 'tavily']
}

interface ProceduralMemoryState {
  entries: ProceduralMemoryEntry[];
  addEntry: (entry: Omit<ProceduralMemoryEntry, 'id' | 'createdMs' | 'lastUsedMs' | 'successCount' | 'failCount'>) => void;
  recordSuccess: (id: string) => void;
  recordFailure: (id: string) => void;
  queryByTags: (tags: string[], limit?: number) => ProceduralMemoryEntry[];
  queryByPattern: (pattern: string, limit?: number) => ProceduralMemoryEntry[];
}

const MAX_PROCEDURAL = 200;

export const useProceduralMemoryStore = create<ProceduralMemoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) => {
        set((state) => ({
          entries: [
            ...state.entries.slice(-(MAX_PROCEDURAL - 1)),
            {
              ...entry,
              id: Math.random().toString(36).slice(2, 9),
              createdMs: Date.now(),
              lastUsedMs: Date.now(),
              successCount: 0,
              failCount: 0,
            },
          ],
        }));
      },

      recordSuccess: (id) => {
        set((state) => ({
          entries: state.entries.map(e =>
            e.id === id ? { ...e, successCount: e.successCount + 1, lastUsedMs: Date.now() } : e
          ),
        }));
      },

      recordFailure: (id) => {
        set((state) => ({
          entries: state.entries.map(e =>
            e.id === id ? { ...e, failCount: e.failCount + 1, lastUsedMs: Date.now() } : e
          ),
        }));
      },

      queryByTags: (tags, limit = 5) => {
        const entries = get().entries;
        return entries
          .filter(e => tags.some(t => e.tags.includes(t)))
          .sort((a, b) => {
            // Sort by: success rate desc, then recency desc
            const aRate = a.successCount / Math.max(1, a.successCount + a.failCount);
            const bRate = b.successCount / Math.max(1, b.successCount + b.failCount);
            return bRate !== aRate ? bRate - aRate : b.lastUsedMs - a.lastUsedMs;
          })
          .slice(0, limit);
      },

      queryByPattern: (pattern, limit = 5) => {
        const lowerPattern = pattern.toLowerCase();
        const entries = get().entries;
        return entries
          .filter(e => e.pattern.toLowerCase().includes(lowerPattern) ||
                       lowerPattern.includes(e.pattern.toLowerCase()))
          .sort((a, b) => b.lastUsedMs - a.lastUsedMs)
          .slice(0, limit);
      },
    }),
    {
      name: 'nyx-procedural-memory',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ── Retrieval result types ────────────────────────────────────────────────────

export interface MemoryRetrievalResult {
  episodic: Array<{ summary: string; keyTopics: string; sessionId: string; createdAt: number }>;
  semantic: Array<{ name: string; type: string; description: string; confidence: number }>;
  procedural: ProceduralMemoryEntry[];
  consolidatedBlock: string;
  isEmpty: boolean;
}

// ── Keyword relevance filter for semantic and episodic tiers ───────────────────

function entityRelevanceScore(entity: { entity_name: string; description: string }, query: string): number {
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  if (queryWords.length === 0) return 0;
  const text = `${entity.entity_name} ${entity.description}`.toLowerCase();
  let hits = 0;
  for (const w of queryWords) {
    if (text.includes(w)) hits++;
  }
  return hits / queryWords.length;
}

function episodicRelevanceScore(
  item: { summary: string; key_topics: string },
  query: string,
  topicTags: string[]
): number {
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const isExplicitMemoryAsk = /\b(?:recall|remember|memory|earlier|previous\s+conversation|what\s+did\s+we\s+talk\s+about|last\s+time|past\s+session)\b/i.test(query);
  if (isExplicitMemoryAsk) return 0.9;
  if (queryWords.length === 0 && topicTags.length === 0) return 0;

  const targetText = `${item.summary} ${item.key_topics}`.toLowerCase();
  let hits = 0;
  const checkWords = Array.from(new Set([...queryWords, ...topicTags.map(t => t.toLowerCase())]));
  for (const w of checkWords) {
    if (targetText.includes(w)) hits++;
  }
  return checkWords.length > 0 ? hits / checkWords.length : 0;
}

// ── Main retrieval function ───────────────────────────────────────────────────

/**
 * Retrieve relevant memory from all three tiers in parallel.
 *
 * @param query The current user message (used for relevance scoring)
 * @param topicTags Topic words extracted by ConversationContextAnalyzer
 * @param turnId For span tracking
 * @param parentSpanId For span nesting
 */
export async function retrieveHierarchicalMemory(
  query: string,
  topicTags: string[],
  turnId: string,
  parentSpanId?: string
): Promise<MemoryRetrievalResult> {
  const memSpan = startSpan('memory_read', 'Hierarchical Memory Retrieval', turnId, parentSpanId);

  try {
    // PARALLEL retrieval from all 4 tiers (Episodic, Semantic, Procedural, TurboVec Vector RAG)
    const [episodicRaw, semanticRaw, proceduralEntries, turbovecRaw] = await Promise.all([
      // Tier 1: Episodic
      invoke<Array<{ id: string; session_id: string; summary: string; key_topics: string; created_at: number }>>(
        'get_episodic_memories',
        { limit: 8 }
      ).catch(() => []),

      // Tier 2: Semantic entities
      invoke<Array<{ id: string; entity_name: string; entity_type: string; description: string; confidence: number; last_seen: number }>>(
        'get_memory_entities',
        { limit: 50 }
      ).catch(() => []),

      // Tier 3: Procedural (synchronous Zustand read)
      Promise.resolve(
        useProceduralMemoryStore.getState().queryByTags(
          topicTags.length > 0 ? topicTags : [query.split(' ')[0]],
          5
        )
      ),

      // Tier 4: TurboVec Vector RAG Memory
      invoke<Array<{ text: string; metadata: string }>>(
        'turbovec_search_memory',
        { query, limit: 3 }
      ).catch(() => []),
    ]);

    // Filter episodic strictly by relevance to the query / topics
    const relevantEpisodic = episodicRaw
      .map(m => ({ ...m, score: episodicRelevanceScore(m, query, topicTags) }))
      .filter(m => m.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // Filter semantic by relevance to current query
    const relevantSemantic = semanticRaw
      .map(e => ({ ...e, score: entityRelevanceScore(e, query) }))
      .filter(e => e.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Build the consolidated context block (only with relevant facts)
    const episodicBlock = relevantEpisodic.length > 0
      ? `**Relevant Past Context:**\n${relevantEpisodic.map(m =>
          `- ${m.summary} (topics: ${m.key_topics})`
        ).join('\n')}`
      : '';

    const semanticBlock = relevantSemantic.length > 0
      ? `**Relevant Facts & User Preferences:**\n${relevantSemantic.map(e =>
          `- [${e.entity_type}] ${e.entity_name}: ${e.description}`
        ).join('\n')}`
      : '';

    const proceduralBlock = proceduralEntries.length > 0
      ? `**Learned Strategies:**\n${proceduralEntries.map(p =>
          `- ${p.strategy} (success rate: ${Math.round(p.successCount / Math.max(1, p.successCount + p.failCount) * 100)}%)`
        ).join('\n')}`
      : '';

    const turbovecBlock = turbovecRaw && turbovecRaw.length > 0
      ? `**Relevant Research & Vector Memory:**\n${turbovecRaw.map(v =>
          `- ${v.text.slice(0, 300).replace(/\n+/g, ' ')}`
        ).join('\n')}`
      : '';

    const sections = [episodicBlock, semanticBlock, proceduralBlock, turbovecBlock].filter(Boolean);
    const consolidatedBlock = sections.length > 0
      ? `<supplemental_background_memory label="RELEVANT HISTORICAL MEMORY">\n${sections.join('\n\n')}\n</supplemental_background_memory>`
      : '';

    const result: MemoryRetrievalResult = {
      episodic: relevantEpisodic.map(m => ({
        summary: m.summary,
        keyTopics: m.key_topics,
        sessionId: m.session_id,
        createdAt: m.created_at,
      })),
      semantic: relevantSemantic.map(e => ({
        name: e.entity_name,
        type: e.entity_type,
        description: e.description,
        confidence: e.confidence,
      })),
      procedural: proceduralEntries,
      consolidatedBlock,
      isEmpty: sections.length === 0,
    };

    endSpan(memSpan, 'ok', {
      resultCount: result.episodic.length + result.semantic.length + result.procedural.length,
      metadata: {
        episodic: result.episodic.length,
        semantic: result.semantic.length,
        procedural: result.procedural.length,
      },
    });

    return result;

  } catch (err) {
    endSpan(memSpan, 'error', { error: String(err) });
    return {
      episodic: [],
      semantic: [],
      procedural: [],
      consolidatedBlock: '',
      isEmpty: true,
    };
  }
}

/**
 * Store a successful interaction as a procedural memory entry.
 * Call after a turn completes successfully.
 */
export function learnFromSuccess(
  query: string,
  modelId: string,
  provider: string,
  usedSearch: boolean,
  searchProvider?: string,
  topicTags?: string[]
): void {
  const strategy = [
    `Used ${modelId} (${provider})`,
    usedSearch ? `with ${searchProvider ?? 'duckduckgo'} search` : 'without search',
  ].join(' ');

  const tags = [
    ...(topicTags ?? []).slice(0, 5),
    provider,
    usedSearch ? 'search' : 'direct',
  ];

  useProceduralMemoryStore.getState().addEntry({
    pattern: query.slice(0, 60),
    strategy,
    tags,
  });
}
