import logger from '../../lib/logger.js';
import { parse } from 'node-html-parser';
import { CodebaseScanner } from '../workspace/codebaseScanner.js';
import { getKeysSync } from '../vault/vault.service.js';
// fetch is available globally in Node.js 18+ — no import needed
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { db } from '../../db/client.js';
import { searchQueries, searchResults } from '../../db/schema.js';
import { env } from '../../config/env.js';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
}

interface SearchCacheEntry {
  results: any[];
  expiresAt: number;
}

const CACHE_FILE = path.join(process.cwd(), 'server', 'data', 'search_cache.json');

export class SearchService {
  private searchCache = new Map<string, SearchCacheEntry>();

  constructor() {
    this.loadCacheFromDisk();
  }

  private loadCacheFromDisk() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        for (const key of Object.keys(parsed)) {
          if (parsed[key].expiresAt > Date.now()) {
            this.searchCache.set(key, parsed[key]);
          }
        }
      }
    } catch (e) {
      logger.warn(`[SearchCache] Failed to load cache from disk: ${e}`);
    }
  }

  private saveCacheToDisk() {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: any = {};
      for (const [key, val] of this.searchCache.entries()) {
        if (val.expiresAt > Date.now()) {
          obj[key] = val;
        } else {
          this.searchCache.delete(key);
        }
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      logger.warn(`[SearchCache] Failed to save cache to disk: ${e}`);
    }
  }

  // Helper to determine TTL based on query volatility
  private getQueryTTL(query: string): number {
    const isVolatile = /(latest|newest|version|now|today|202[0-9])/i.test(query);
    return isVolatile ? 1 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 1 hour or 24 hours
  }

  getSearchBackends() {
    const keys = getKeysSync();
    return {
      activeBackend: keys['SERPAPI_KEY'] ? 'SerpAPI' : 'DuckDuckGo',
      backends: {
        serpapi: { configured: !!keys['SERPAPI_KEY'] },
        duckduckgo: { configured: true, fallback: true },
        brave: { configured: !!keys['BRAVE_API_KEY'] },
        bing: { configured: !!keys['BING_API_KEY'] },
      },
    };
  }

  async codebaseSearch(query: string) {
    const results = await CodebaseScanner.search(query, 5);
    const directoryStructure = CodebaseScanner.getDirectoryStructure();
    return {
      results,
      directoryStructure,
    };
  }

  private async extractQueryWithLLM(rawQuery: string): Promise<string> {
    const keys = getKeysSync();
    const apiKey = keys['GEMINI_API_KEY'] || env.GEMINI_API_KEY;
    if (!apiKey) return rawQuery; // fallback to raw

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Extract a search-engine optimized query from the following conversational prompt. Respond ONLY with the optimized query keywords, no quotes, no conversational text.\n\nPrompt: ${rawQuery}`,
                  },
                ],
              },
            ],
          }),
        }
      );
      if (response.ok) {
        const data: any = await response.json();
        const optimized = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return optimized || rawQuery;
      }
    } catch (e) {
      logger.warn(`[QueryOptimizer] Failed to optimize query: ${e}`);
    }
    return rawQuery;
  }

  private async summarizeWithLLM(content: string, query: string): Promise<string> {
    const keys = getKeysSync();
    const apiKey = keys['GEMINI_API_KEY'] || env.GEMINI_API_KEY;
    if (!apiKey || content.trim().length < 500) return content;

    try {
      logger.info(`[SearchSummarizer] Summarizing web content for query: ${query}`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are a search summarizer. Extract the most relevant technical information, facts, and key points from this web page content that answers the query "${query}". Be extremely concise and focus only on the facts. Return the summary in markdown format.\n\nContent:\n${content.substring(0, 15000)}`,
                  },
                ],
              },
            ],
          }),
        }
      );
      if (response.ok) {
        const data: any = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return summary || content;
      }
    } catch (e) {
      logger.warn(`[SearchSummarizer] Failed to summarize: ${e}`);
    }
    return content;
  }

  private scoreCredibility(url: string): number {
    let score = 0;
    const urlLower = url.toLowerCase();

    // Whitelist
    if (urlLower.includes('developer.mozilla.org')) score += 10;
    if (urlLower.includes('github.com')) score += 8;
    if (urlLower.includes('stackoverflow.com')) score += 8;
    if (urlLower.includes('react.dev')) score += 10;
    if (urlLower.includes('docs.')) score += 5;

    // Blacklist
    if (urlLower.includes('w3schools.com')) score -= 5;
    if (urlLower.includes('geeksforgeeks.org')) score -= 2;
    if (urlLower.includes('tutorialspoint.com')) score -= 5;

    return score;
  }

  private async fetchContentWithCrawl4AI(url: string): Promise<string> {
    try {
      logger.info(`[ContentExtractor] Extracting content via crawl4ai for: ${url}`);
      const response = await fetch('http://localhost:1122/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data: any = await response.json();
        return data.markdown || data.content || '';
      }
    } catch (error) {
      logger.warn(`[ContentExtractor] crawl4ai failed for ${url}, fallback to empty string`);
    }
    return ''; // Return empty so it falls back to snippet
  }

  private async performBaseSearch(rawQuery: string, shouldSummarize: boolean) {
    const query = await this.extractQueryWithLLM(rawQuery);
    logger.info(`[Web Search] Optimized Query: "${query}" (Original: "${rawQuery}")`);

    // Check TTL cache (in-memory)
    const cacheKey = `${query}_${shouldSummarize}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info(`[Web Search] Cache hit for: "${cacheKey}"`);
      return cached.results;
    }

    let results: Array<{
      title: string;
      link: string;
      snippet: string;
      content?: string;
      score: number;
    }> = [];

    try {
      const scraplingPort = env.SCRAPLING_PORT || 3002;
      logger.info('[Web Search] Calling Scrapling server...');

      const response = await fetch(`http://127.0.0.1:${scraplingPort}/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          limit: 5,
          engine: 'google',
          type: 'text',
          timeout: 30,
        }),
      });

      if (!response.ok) {
        throw new Error(`Scrapling returned ${response.status}`);
      }

      const data: any = await response.json();
      const pythonResults = data.results || [];

      results = pythonResults.map((r: any) => ({
        title: r.title || '',
        link: r.url || '',
        snippet: r.markdown ? r.markdown.substring(0, 300) + '...' : '',
        content: r.markdown || '',
        score: r.rank ? 10 - r.rank : 0, // Invert rank to score
      }));
    } catch (e) {
      logger.error(`[Web Search] Scrapling failed: ${e}`);
      return [];
    }

    // Process and summarize content
    for (let i = 0; i < results.length; i++) {
      let content = results[i].content || '';
      if (content && content.trim().length > 100) {
        if (shouldSummarize) {
          content = await this.summarizeWithLLM(content, query);
        } else {
          content =
            content.substring(0, 8000) + (content.length > 8000 ? '\n\n[... truncated ...]' : '');
        }
        results[i].content = content;
      }
    }

    // Save to TTL cache (in-memory)
    this.searchCache.set(cacheKey, {
      results,
      expiresAt: Date.now() + this.getQueryTTL(query),
    });
    this.saveCacheToDisk();

    // Persist to database for history
    try {
      const queryId = randomUUID();
      await db.insert(searchQueries).values({
        id: queryId,
        query: rawQuery,
        engine: 'google/scrapling',
        type: 'text',
        timestamp: Date.now(),
      });

      if (results.length > 0) {
        await db.insert(searchResults).values(
          results.map((r, index) => ({
            id: randomUUID(),
            queryId,
            url: r.link,
            title: r.title,
            markdown: r.content || r.snippet,
            rank: index + 1,
          }))
        );
      }
    } catch (dbErr) {
      logger.error(`[Web Search] Failed to persist search history: ${dbErr}`);
    }

    return results;
  }

  // Used by Chat Page (Conversational context)
  async performConversationalSearch(rawQuery: string) {
    return this.performBaseSearch(rawQuery, true);
  }

  // Used by Coder Page (Technical documentation lookup)
  async performTechnicalSearch(rawQuery: string) {
    return this.performBaseSearch(rawQuery, false);
  }

  // Backwards compatibility for existing performWebSearch
  async performWebSearch(query: string): Promise<SearchResult[]> {
    const backends = [
      () => searchDuckDuckGo(query),
      () => searchBrave(query),
      () => searchSearXNG(query),
    ];

    for (const backend of backends) {
      try {
        const results = await backend();
        if (results.length > 0) return results;
      } catch (err) {
        logger.error({ err: String(err) }, '[Web Search] Backend failed:');
      }
    }
    return [];
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000)
    }
  );

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const root = parse(html);

  const results: SearchResult[] = [];
  const resultBlocks = root.querySelectorAll('.result');

  for (const block of resultBlocks.slice(0, 5)) {
    const titleEl = block.querySelector('.result__a');
    const snippetEl = block.querySelector('.result__snippet');

    if (titleEl && snippetEl) {
      let link = titleEl.getAttribute('href') || '';
      if (link.includes('duckduckgo.com/l/')) {
        const uddgMatch = link.match(/uddg=([^&]+)/);
        if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);
      }

      results.push({
        title: titleEl.text.trim(),
        link,
        snippet: snippetEl.text.trim(),
        source: 'duckduckgo'
      });
    }
  }

  return results;
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error('Brave API key not configured');

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(10000)
    }
  );

  const data = await response.json();
  return (data.web?.results || []).map((r: any) => ({
    title: r.title,
    link: r.url,
    snippet: r.description,
    source: 'brave'
  }));
}

async function searchSearXNG(query: string): Promise<SearchResult[]> {
  const instance = process.env.SEARXNG_URL || 'https://search.sapti.me';
  const response = await fetch(
    `${instance}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo`,
    { signal: AbortSignal.timeout(15000) }
  );

  const data = await response.json();
  return (data.results || []).slice(0, 5).map((r: any) => ({
    title: r.title,
    link: r.url,
    snippet: r.content,
    source: 'searxng'
  }));
}
