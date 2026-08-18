/**
 * agenticRAG.ts
 *
 * Agentic Retrieval-Augmented Generation for Lucifer.
 *
 * Unlike naive RAG (1 query → 1 search → inject), Agentic RAG:
 * 1. Decomposes complex questions into focused sub-queries
 * 2. Fires all sub-queries in PARALLEL (concurrently via Promise.all)
 * 3. Deduplicates and reranks results by relevance to original query
 * 4. Also queries TurboVec memory for personal/past context
 * 5. Returns a consolidated, ranked context block
 *
 * The Rust backend (`search_web_command`) already handles DuckDuckGo/Tavily.
 * This layer purely orchestrates at the TypeScript level.
 */

import { invoke } from '@tauri-apps/api/core';
import { startSpan, endSpan, LuciferSpan } from './observabilitySpans';
import { planDeepResearchQueries, planQueryWithModel } from '../../../core/services/intelligentQueryEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: 'web' | 'memory' | 'rag';
  relevanceScore: number;
  subQueryIndex: number;
}

export interface AgenticRAGResult {
  consolidatedContext: string;
  subQueries: string[];
  results: SearchResult[];
  totalResults: number;
  memoryResults: string[];
  fromCache: boolean;
}

export interface AgenticRAGOptions {
  provider?: string;         // 'duckduckgo' | 'tavily'
  tavilyApiKey?: string;
  maxSubQueries?: number;    // default: 5
  resultsPerQuery?: number;  // default: 10
  includeMemory?: boolean;   // default: true
  /** When true, concurrently fetches full page bodies for the top URLs (via Rust
   *  fetch_multiple_pages_command). Transforms shallow snippets into rich article
   *  content. Default: true — always fetch page bodies for research quality. */
  fetchPageContent?: boolean;
  /** Max characters to fetch per page body. Default: 50000 (≈10,000 words). */
  maxCharsPerPage?: number;
  /** Optional progress callback for streaming research progress to the UI. */
  onProgress?: (msg: string) => void;
  turnId: string;
  parentSpanId?: string;
}

/**
 * Clean user prompts into high-precision search engine queries.
 * Strips slash commands, conversational greetings, and preamble filler.
 *
 * Example:
 *   "hello who is the president of the us?" -> "who is the president of the us?"
 *   "hi! search for latest SpaceX launch date" -> "latest SpaceX launch date"
 */
export function sanitizeSearchQuery(query: string): string {
  let q = query.trim();

  // Strip memory context blocks & prompt wrappers
  q = q.replace(/--- Memory Context ---[\s\S]*?--- End Memory ---/gi, '');
  q = q.replace(/\[CONTEXT:[\s\S]*?\]/gi, '');
  q = q.replace(/^User:\s*/i, '');
  const userIdx = q.lastIndexOf('User:');
  if (userIdx !== -1) {
    q = q.slice(userIdx + 5);
  }

  // 1. Strip slash commands, research prefixes, and search prefixes
  q = q.replace(/^(?:\/web|\/search|\/deep|\/research|deep\s+research\s+(?:on|about)?|research\s+(?:on|about)?|search:|google:|lookup:|web:|research:)\s*/i, '');

  // 2. Strip conversational greetings at the start (e.g. "hello", "hi", "hey", "good morning")
  const greetingPattern = /^(?:hello|hi|hey|greetings|good\s+(?:morning|afternoon|evening)|yo|sup)\b[\s,!.:\-]*/i;
  q = q.replace(greetingPattern, '').trim();

  // 3. Strip conversational preamble / politeness phrases
  const preamblePatterns = [
    /^(?:can\s+you\s+)(?:please\s+)?(?:search\s+(?:the\s+web\s+for|for|online\s+for)|tell\s+me|find\s+(?:out\s+)?(?:about|for)?|look\s+up)\s*/i,
    /^(?:please\s+)?(?:search\s+(?:the\s+web\s+for|for|online\s+for)|tell\s+me|find\s+(?:out\s+)?(?:about|for)?|look\s+up)\s*/i,
    /^(?:could\s+you\s+)(?:please\s+)?(?:tell\s+me|find|search\s+for|look\s+up)\s*/i,
    /^(?:i\s+(?:want|would\s+like)\s+to\s+know)\s*/i,
  ];

  for (const pattern of preamblePatterns) {
    if (pattern.test(q)) {
      const stripped = q.replace(pattern, '').trim();
      if (stripped.length > 0) {
        q = stripped;
      }
    }
  }

  return q.trim() || query.trim();
}

/**
 * Extract clean, high-relevance search topic keywords from user prompts of any length.
 * Universal and domain-agnostic — strips meta-instructions, conversational filler, and structural requests.
 */
export function extractCoreKeywords(query: string): string {
  let text = sanitizeSearchQuery(query);

  // Strip meta-instructions & prompt formatting requests
  text = text.replace(/(?:i\s+want|give\s+me|provide|need)\s+(?:a\s+)?(?:deep|long|detailed|comprehensive|full|step\s+by\s+step)[\s\S]*$/i, '');
  text = text.replace(/(?:step\s+by\s+step\s+guide|strategy|detailed\s+explanation|mandatory|necessary|common\s+mistakes|risk\s+management|data)[\s\S]*$/i, '');

  const stopWords = new Set([
    'i', 'want', 'and', 'the', 'a', 'an', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'up', 'about', 'into', 'over', 'after', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'but', 'if', 'then', 'else', 'when', 'than', 'this',
    'that', 'these', 'those', 'there', 'what', 'which', 'who', 'whom', 'how', 'many', 'more', 'much',
    'all', 'any', 'both', 'each', 'few', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'actually',
    'he', 'she', 'they', 'them', 'his', 'her', 'their', 'doing', 'survive', 'time', 'economy',
    'deep', 'research', 'search', 'look', 'find', 'tell', 'show', 'give'
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (words.length === 0) return text.trim() || query.slice(0, 40);

  return Array.from(new Set(words)).slice(0, 6).join(' ');
}


// ── Query decomposition ───────────────────────────────────────────────────────

/**
 * Universal Query Decomposer powered by Qwen 2.5 1.5B on GPU.
 * Uses Intelligent Query Formulation Engine to decompose prompt into orthogonal, targeted research sub-queries.
 */
async function decomposeQuery(query: string, isDeepResearchMode: boolean = false): Promise<string[]> {
  const q = sanitizeSearchQuery(query);
  if (!q || q.trim().length === 0) return [];

  try {
    const plan = await planQueryWithModel(q, {
      provider: 'nyx-native',
      modelId: 'qwen2.5-1.5b-instruct',
      timeoutMs: 6000,
    });
    if (plan && plan.deepResearchQueries && plan.deepResearchQueries.length > 0) {
      return Array.from(new Set([q, ...plan.deepResearchQueries]));
    }
  } catch (err) {
    console.warn('[agenticRAG] Model decomposition fallback:', err);
  }

  const planned = planDeepResearchQueries(q, isDeepResearchMode ? 6 : 4);
  if (planned.length > 0) {
    return Array.from(new Set([q, ...planned]));
  }

  return [q];
}




// ── Result deduplication & reranking ─────────────────────────────────────────


const SHORT_WHITELIST = new Set(['us', 'uk', 'eu', 'ai', 'ml', 'db', 'io', 'os', 'ip', 'pr', 'ca', 'va', 'un', 'qa', 'who', 'ceo', 'potus']);

function simpleRelevanceScore(result: string, originalQuery: string): number {
  const queryWords = originalQuery
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3 || SHORT_WHITELIST.has(w));

  if (queryWords.length === 0) return 0.5;

  const resultLower = result.toLowerCase();
  let score = 0;

  for (const word of queryWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const count = (resultLower.match(regex) || []).length;
    score += count * (1 / queryWords.length);
  }

  // Exact phrase match bonus
  const cleanQuery = originalQuery.toLowerCase().replace(/[?.,!]/g, '').trim();
  if (cleanQuery.length > 5 && resultLower.includes(cleanQuery)) {
    score += 2.0;
  }

  return Math.min(score, 1);
}


function deduplicateResults(rawResults: Array<{ text: string; url?: string; subQueryIdx: number }>): Array<{
  text: string; url?: string; subQueryIdx: number;
}> {
  const seen = new Set<string>();
  const domainCounts = new Map<string, number>();

  return rawResults.filter(r => {
    // Exclude wikipedia per user request (prevents stale encyclopedic definitions from dominating real-time context)
    if (r.url && r.url.toLowerCase().includes('wikipedia.org')) {
      return false;
    }

    // Fingerprint: first 100 chars lowercased
    const fp = r.text.toLowerCase().slice(0, 100).replace(/\s+/g, ' ');
    if (seen.has(fp)) return false;

    // Enforce max 2 results per domain to guarantee open web domain diversity
    if (r.url) {
      try {
        const domain = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '');
        const count = domainCounts.get(domain) || 0;
        if (count >= 2) return false;
        domainCounts.set(domain, count + 1);
      } catch {
        // Continue if URL parse fails
      }
    }

    seen.add(fp);
    return true;
  });
}

// ── Parse raw search output into SearchResult array ───────────────────────────

function parseSearchOutput(
  rawText: string,
  subQueryIndex: number,
  originalQuery: string
): SearchResult[] {
  if (!rawText || rawText === 'No web search results found for query.') return [];

  // Strip temporal grounding header lines inserted by Rust backend
  // e.g. "⚡ REAL-TIME SEARCH RESULTS (retrieved: 2026-08-06 10:25 UTC) — ..."
  //      "📚 WEB SEARCH RESULTS (retrieved: 2026-08-06 10:25 UTC):"
  //      "Retrieved: Thursday, August 6, 2026 at 10:25 AM IST"
  //      "INSTRUCTION: Answer the user's question..."
  const headerPatterns = [
    /^[⚡📚]\s*(REAL-TIME|WEB)\s+SEARCH\s+RESULTS/,
    /^Retrieved:/,
    /^INSTRUCTION:/,
  ];

  const cleanedText = rawText
    .split('\n')
    .filter(line => !headerPatterns.some(p => p.test(line.trim())))
    .join('\n');

  // The Rust backend returns results formatted as:
  // [Source N] Title\nURL: https://...\nContent: snippet text
  const blocks = cleanedText.split(/\n\n+/);
  const results: SearchResult[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n').filter(Boolean);
    if (lines.length < 1) continue;

    const titleLine = lines[0];
    const urlLine = lines.find(l => l.startsWith('URL:') || l.startsWith('http'));

    // Filter out structural lines to get snippet
    const snippetLines = lines.filter(l => {
      const trimmed = l.trim();
      return !trimmed.match(/^\[(Source\s+)?\d+\]/) &&
        !trimmed.startsWith('URL:') &&
        !trimmed.startsWith('http') &&
        trimmed.length > 0;
    });

    const titleMatch = titleLine.match(/^\[(Source\s+)?(\d+)\]\s+(.+)/);
    const title = titleMatch ? titleMatch[3] : titleLine;
    let url = urlLine?.replace(/^URL:\s*/, '').trim() ?? '';
    if (!url || !url.startsWith('http')) {
      const match = block.match(/https?:\/\/[^\s\)\>\]]+/);
      if (match) {
        url = match[0].replace(/[\.,\)]+$/, '');
      }
    }


    // Strip 'Content: ' prefix from snippet lines (new backend format)
    let snippet = snippetLines
      .map(l => l.replace(/^Content:\s*/, ''))
      .join(' ')
      .trim()
      .slice(0, 3000);

    if (!snippet) {
      snippet = title;
    }

    if (!title && !snippet) continue;

    results.push({
      id: `web_${subQueryIndex}_${results.length}`,
      title: title || snippet,
      url,
      snippet,
      source: 'web',
      relevanceScore: simpleRelevanceScore(title + ' ' + snippet, originalQuery),
      subQueryIndex,
    });
  }

  return results;
}

// ── Main Agentic RAG function ─────────────────────────────────────────────────

/**
 * Core agentic search function.
 */
export async function agenticSearch(
  rawQuery: string,
  options: AgenticRAGOptions
): Promise<AgenticRAGResult> {
  const originalQuery = sanitizeSearchQuery(rawQuery);
  const {
    provider = 'duckduckgo',
    tavilyApiKey,
    maxSubQueries = 5,
    resultsPerQuery = 10,
    includeMemory = true,
    fetchPageContent = true,
    maxCharsPerPage = 50000,
    onProgress,
    turnId,
    parentSpanId,
  } = options;

  const ragSpan = startSpan('agentic_rag', 'Agentic RAG', turnId, parentSpanId);

  try {
    // STEP 1: Decompose query into focused sub-queries using Qwen 2.5 1.5B
    const subQueries = (await decomposeQuery(originalQuery, false)).slice(0, maxSubQueries);

    // STEP 2: Fire all sub-queries in PARALLEL
    const searchSpans: LuciferSpan[] = [];
    const searchPromises = subQueries.map(async (sq, idx) => {
      const searchSpan = startSpan('search', `Search: "${sq.slice(0, 40)}"`, turnId, ragSpan.spanId, {
        searchProvider: provider,
        searchQuery: sq,
      });
      searchSpans.push(searchSpan);

      try {
        const raw = await invoke<string>('search_web_command', {
          query: sq,
          numResults: resultsPerQuery,
          searchProvider: tavilyApiKey ? provider : 'duckduckgo',
          apiKey: tavilyApiKey,
        });
        endSpan(searchSpan, 'ok', { resultCount: (raw.match(/\[\d+\]/g) || []).length });
        return { raw, idx };
      } catch (err) {
        // Try DuckDuckGo as fallback
        try {
          const raw = await invoke<string>('search_web_command', {
            query: sq,
            numResults: resultsPerQuery,
            searchProvider: 'duckduckgo',
            apiKey: undefined,
          });
          endSpan(searchSpan, 'fallback', { resultCount: (raw.match(/\[\d+\]/g) || []).length });
          return { raw, idx };
        } catch {
          endSpan(searchSpan, 'error', { error: String(err) });
          return { raw: '', idx };
        }
      }
    });

    // STEP 3: Multi-Source Memory Query in parallel with web search (User Long-Term + TurboVec Vector RAG + Episodic Memory)
    let memoryResults: string[] = [];
    if (includeMemory) {
      const memSpan = startSpan('memory_read', 'Memory Query', turnId, ragSpan.spanId);
      try {
        const cleanOriginalQuery = originalQuery.replace(/<[^>]+>/g, '').trim();
        const queryWords = cleanOriginalQuery.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const isExplicitMemoryAsk = /\b(?:recall|remember|memory|earlier|previous\s+conversation|what\s+did\s+we\s+talk\s+about|last\s+time)\b/i.test(cleanOriginalQuery);

        const [longTerm, episodic, turbovec] = await Promise.all([
          invoke<Array<{ id: string; fact: string; category?: string }>>('db_get_memories').catch(() => []),
          invoke<Array<{ summary: string; key_topics: string }>>('get_episodic_memories', { limit: 10 }).catch(() => []),
          invoke<Array<{ text: string; metadata: string }>>('turbovec_search_memory', { query: cleanOriginalQuery, limit: 4 }).catch(() => []),
        ]);

        const ltMem = longTerm
          .filter(m => isExplicitMemoryAsk || (queryWords.length > 0 && queryWords.some(w => m.fact.toLowerCase().includes(w))))
          .slice(0, 3)
          .map(m => `[User Long-Term Memory (${m.category || 'Fact'})] ${m.fact}`);

        const tvMem = turbovec
          .filter(tv => {
            const isRawChat = tv.text.startsWith('USER:') || tv.text.startsWith('ASSISTANT:');
            if (isRawChat && !isExplicitMemoryAsk) return false;
            return tv.text.trim().length > 0;
          })
          .slice(0, 3)
          .map(tv => `[TurboVec Vector Memory] (${tv.metadata}): ${tv.text}`);

        const epMem = episodic
          .filter(m => {
            if (!m.summary || /Session Task:\s*(?:hi|hello|hey|ping|test)\b/i.test(m.summary)) return false;
            if (isExplicitMemoryAsk) return true;
            const target = `${m.summary} ${m.key_topics}`.toLowerCase();
            return queryWords.length > 0 && queryWords.some(w => target.includes(w));
          })
          .slice(0, 2)
          .map(m => `[Episodic Memory] ${m.summary} (topics: ${m.key_topics})`);

        memoryResults = [...ltMem, ...tvMem, ...epMem].filter(Boolean);
        endSpan(memSpan, 'ok', { resultCount: memoryResults.length });
      } catch {
        endSpan(memSpan, 'error');
      }
    }


    // Wait for all searches to complete
    const searchOutputs = await Promise.all(searchPromises);

    // STEP 4: Parse and flatten results
    // STEP 4: Parse and flatten results + preserve entity image attachments
    const allRaw: Array<{ text: string; url?: string; subQueryIdx: number }> = [];
    let entityImageBlock = '';

    for (const { raw, idx } of searchOutputs) {
      if (!raw) continue;
      if (!entityImageBlock && raw.includes('[ENTITY IMAGE ATTACHMENT]')) {
        const start = raw.indexOf('[ENTITY IMAGE ATTACHMENT]');
        const end = raw.indexOf('[/ENTITY IMAGE ATTACHMENT]');
        if (start !== -1 && end !== -1) {
          entityImageBlock = '\n\n' + raw.substring(start, end + '[/ENTITY IMAGE ATTACHMENT]'.length);
        }
      }

      const parsed = parseSearchOutput(raw, idx, originalQuery);
      for (const r of parsed) {
        allRaw.push({ text: `${r.title}\n${r.snippet}`, url: r.url, subQueryIdx: idx });
      }
    }

    // STEP 5: Deduplicate
    const deduped = deduplicateResults(allRaw);

    // STEP 6: Rerank by relevance to ORIGINAL query
    const scored = deduped
      .map(r => ({ ...r, score: simpleRelevanceScore(r.text, originalQuery) }))
      .sort((a, b) => b.score - a.score);

    // Filter out irrelevant garbage results (score < 0.15) if better candidates exist
    // Utilize 32k context: yield up to 15 high-relevance search snippets
    const relevantOnly = scored.filter(r => r.score >= 0.15);
    const reranked = (relevantOnly.length > 0 ? relevantOnly : scored).slice(0, 15);

    // STEP 7: Build structured results array
    const structuredResults: SearchResult[] = reranked.map((r, i) => {
      const lines = r.text.split('\n');
      const title = lines[0] ?? '';
      const snippet = lines.slice(1).join(' ').trim().slice(0, 3000);
      return {
        id: `res_${i}`,
        title,
        url: r.url ?? '',
        snippet,
        source: 'web',
        relevanceScore: r.score,
        subQueryIndex: r.subQueryIdx,
      };
    });

    // STEP 7b: Optionally fetch full page bodies for the top URLs with strict 4s timeout
    if (fetchPageContent && structuredResults.length > 0) {
      const maxPages = Math.min(structuredResults.length, 5);
      const pageSpan = startSpan('page_fetch', `Fetching ${maxPages} full page bodies`, turnId, ragSpan.spanId);
      try {
        const urlsToFetch = structuredResults
          .filter(r => r.url && r.url.startsWith('http'))
          .slice(0, maxPages)
          .map(r => r.url);

        if (urlsToFetch.length > 0) {
          onProgress?.(`📄 Reading ${urlsToFetch.length} web pages in full...`);
          const fetchTimeout = new Promise<Array<[string, string | null]>>((res) => setTimeout(() => res([]), 4000));
          const batchRes = await Promise.race([
            invoke<Array<[string, string | null]>>('fetch_multiple_pages_command', {
              urls: urlsToFetch,
              maxCharsPerPage: Math.min(maxCharsPerPage, 15000),
            }),
            fetchTimeout,
          ]);

          // Build a URL→content map from the batch result
          const pageContentMap = new Map<string, string>();
          for (const [url, content] of batchRes) {
            if (content && content.trim().length > 200) {
              pageContentMap.set(url, content.trim());
            }
          }

          // Augment structured results: replace snippet with full page body
          for (const res of structuredResults) {
            const pageBody = pageContentMap.get(res.url);
            if (pageBody) {
              res.snippet = pageBody.slice(0, maxCharsPerPage);
            }
          }
          const pagesRead = pageContentMap.size;
          onProgress?.(`✅ Successfully read ${pagesRead} of ${urlsToFetch.length} pages`);
          endSpan(pageSpan, 'ok', { metadata: { pagesWithContent: pagesRead } });
        } else {
          endSpan(pageSpan, 'ok', { metadata: { pagesWithContent: 0 } });
        }
      } catch (pageErr) {
        console.warn('[agenticSearch] Page body fetch failed (non-fatal), using snippets:', pageErr);
        endSpan(pageSpan, 'error', { error: String(pageErr) });
      }
    }

    // STEP 8: Build high-density consolidated context string
    const resultBlocks = structuredResults
      .map((r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url || 'N/A'}\nContent: ${r.snippet}`)
      .join('\n\n---\n\n');

    const memBlock = memoryResults.length > 0
      ? `\n\n--- Personal Memory Context ---\n${memoryResults.join('\n')}`
      : '';

    const consolidatedContext = [
      resultBlocks || 'No results found.',
      entityImageBlock,
      memBlock,
    ].filter(Boolean).join('\n');


    const result: AgenticRAGResult = {
      consolidatedContext,
      subQueries,
      results: structuredResults,
      totalResults: structuredResults.length,
      memoryResults,
      fromCache: false,
    };

    endSpan(ragSpan, 'ok', {
      resultCount: structuredResults.length,
      metadata: { subQueryCount: subQueries.length, memoryResults: memoryResults.length },
    });

    return result;

  } catch (err) {
    endSpan(ragSpan, 'error', { error: String(err) });
    throw err;
  }
}

// ── Agentic Deep Research Engine ──────────────────────────────────────────────

export interface DeepResearchOptions extends AgenticRAGOptions {
  depth?: 'standard' | 'deep'; // standard = 1 hop, deep = 2-hop reflection loop
  maxPages?: number;           // default: 25
}

export interface DeepResearchResult extends AgenticRAGResult {
  deepResearchReportContext: string;
  scrapedUrls: string[];
  reflectionHops: number;
}

/**
 * Executes a multi-hop Agentic Deep Research workflow.
 * 1. Plan & decompose topic into subqueries
 * 2. Concurrently scrape top web page bodies via Rust `fetch_multiple_pages_command`
 * 3. Reflect & evaluate gaps; execute 2nd-hop follow-up search if missing data
 * 4. Synthesize consolidated multi-source Markdown research context
 */
export async function executeDeepResearch(
  rawQuery: string,
  options: DeepResearchOptions
): Promise<DeepResearchResult> {
  const originalQuery = sanitizeSearchQuery(rawQuery);
  const { turnId, depth = 'deep', maxPages = 25, parentSpanId, onProgress } = options;
  const deepSpan = startSpan('deep_research', `Deep Research: "${originalQuery.slice(0, 40)}"`, turnId, parentSpanId);

  try {
    // ── HOP 1: Run agentic search with 10 distinct sub-queries for broad coverage ──
    onProgress?.(`🧠 Decomposing topic into 10 distinct research angles...`);
    const ragResult = await agenticSearch(rawQuery, {
      ...options,
      maxSubQueries: 10,
      resultsPerQuery: 10,
      maxCharsPerPage: 50000,
      fetchPageContent: true,
      onProgress,
    });

    const firstHopUrls = ragResult.results
      .map(r => r.url)
      .filter(u => u && u.startsWith('http'))
      .slice(0, maxPages);

    onProgress?.(`✅ First hop complete: ${ragResult.results.length} results from ${ragResult.subQueries.length} distinct sub-queries`);

    // Build initial scraped map from agenticSearch's fetched page content and rich snippets
    let scrapedMap: Array<[string, string]> = ragResult.results
      .filter(r => r.url && r.snippet && r.snippet.length > 40)
      .map(r => [r.url, r.snippet] as [string, string]);

    // ── HOP 2: Reflection + gap-fill searches (5 additional distinct angles) ──
    let reflectionHops = 1;
    const seenUrls = new Set(scrapedMap.map(([u]) => u));

    if (depth === 'deep') {
      reflectionHops = 2;

      // Dynamic model-driven reflection queries generated by native Qwen 2.5 1.5B
      const coreTopic = extractCoreKeywords(originalQuery);

      const hop2Queries = await invoke<string[]>('generate_search_queries_with_model', {
        prompt: `Research topic: "${coreTopic}". Generate 3 to 4 specific follow-up search queries to research missing information and different aspects of this topic.`,
        provider: 'nyx-native',
        modelId: 'qwen2.5-1.5b-instruct',
        apiKey: undefined,
      }).catch(() => [coreTopic]);

      const validGapQueries = hop2Queries.length > 0 ? hop2Queries : [coreTopic];

      onProgress?.(`🔄 Running reflection hop — analyzing model-generated gap angles...`);

      // Run all gap queries in parallel with deduplicated logs
      const hop2Results = await Promise.allSettled(
        validGapQueries.map(async (gapQuery, idx) => {
          onProgress?.(`🔍 Gap search [Angle ${idx + 1}]: "${gapQuery}"`);
          try {
            const raw = await invoke<string>('search_web_command', {
              query: gapQuery,
              numResults: 8,
              searchProvider: options.provider === 'tavily' ? 'tavily' : 'duckduckgo',
              apiKey: options.tavilyApiKey,
            });
            return parseSearchOutput(raw, 99, originalQuery);
          } catch {
            return [];
          }
        })
      );



      // Collect new unique URLs from all gap queries
      const newUrls: string[] = [];
      for (const result of hop2Results) {
        if (result.status === 'fulfilled') {
          for (const r of result.value) {
            if (r.url && r.url.startsWith('http') && !seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              newUrls.push(r.url);
            }
          }
        }
      }

      // Fetch full page content for new URLs (up to 15 additional pages)
      const urlsToFetchHop2 = newUrls.slice(0, 15);
      if (urlsToFetchHop2.length > 0) {
        onProgress?.(`📄 Reading ${urlsToFetchHop2.length} additional pages from gap searches...`);
        try {
          const batch2 = await invoke<Array<[string, string | null]>>('fetch_multiple_pages_command', {
            urls: urlsToFetchHop2,
            maxCharsPerPage: 50000,
          });
          let hop2Added = 0;
          for (const [u, text] of batch2) {
            if (text && text.trim().length > 300) {
              scrapedMap.push([u, text.trim()]);
              hop2Added++;
            }
          }
          onProgress?.(`✅ Gap-fill added ${hop2Added} new sources`);
        } catch (hop2Err) {
          console.warn('[executeDeepResearch] 2nd hop fetch failed (non-fatal):', hop2Err);
        }
      }
    }

    // ── Synthesize: build the consolidated research context block ────────────
    onProgress?.(`📝 Synthesizing ${scrapedMap.length} web sources and memory into research context...`);

    const allScrapedUrls = scrapedMap.map(([u]) => u);
    const deepContextBlocks = scrapedMap.map(([url, markdownText], idx) => {
      const matchingTitle = ragResult.results.find(r => r.url === url)?.title ?? `Source ${idx + 1}`;
      // Include up to 50K chars per source
      const content = markdownText.slice(0, 50000);
      return `### [Source ${idx + 1}] ${matchingTitle}\nURL: ${url}\n\n${content}`;
    });

    const memoryBlock = ragResult.memoryResults && ragResult.memoryResults.length > 0
      ? `## TURBOVEC VECTOR RAG & EPISODIC MEMORY DATA\n${ragResult.memoryResults.join('\n\n')}\n\n---\n`
      : '';

    const deepResearchReportContext = [
      `# DEEP RESEARCH CONSOLIDATED CONTEXT`,
      `Research Topic: "${originalQuery}"`,
      `Research Hops: ${reflectionHops} | Total Sources Read: ${scrapedMap.length} | Sub-queries: ${ragResult.subQueries.length} | Memory Items: ${ragResult.memoryResults?.length ?? 0}`,
      `Sub-queries executed: ${ragResult.subQueries.map((q, i) => `\n  ${i + 1}. ${q}`).join('')}`,
      ``,
      memoryBlock,
      deepContextBlocks.join('\n\n---\n\n'),
    ].filter(Boolean).join('\n\n');

    endSpan(deepSpan, 'ok', {
      metadata: { sourcesScraped: scrapedMap.length, reflectionHops, totalUrls: allScrapedUrls.length },
    });

    return {
      ...ragResult,
      deepResearchReportContext,
      scrapedUrls: allScrapedUrls,
      reflectionHops,
    };
  } catch (err) {
    endSpan(deepSpan, 'error', { error: String(err) });
    throw err;
  }
}

