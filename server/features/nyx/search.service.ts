import logger from '../../lib/logger.ts';
import { CodebaseScanner } from '../workspace/codebaseScanner.ts';
import { loadKeys } from '../vault/vault.service.ts';
import fetch from 'node-fetch'; // assuming fetch is globally available or imported
import * as fs from 'fs';
import * as path from 'path';

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
    const keys = loadKeys();
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
    const keys = loadKeys();
    const apiKey = keys['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY;
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
    const keys = loadKeys();
    const apiKey = keys['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY;
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

    // Check TTL cache
    const cacheKey = `${query}_${shouldSummarize}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info(`[Web Search] Cache hit for: "${cacheKey}"`);
      return cached.results;
    }

    const keys = loadKeys();
    const serpapiKey = keys['SERPAPI_KEY'] || process.env.SERPAPI_KEY || '';
    const braveApiKey = keys['BRAVE_API_KEY'] || process.env.BRAVE_API_KEY || '';
    const bingApiKey = keys['BING_API_KEY'] || process.env.BING_API_KEY || '';

    let results: Array<{
      title: string;
      link: string;
      snippet: string;
      content?: string;
      score: number;
    }> = [];

    try {
      if (serpapiKey) {
        logger.info('[Web Search] Using SerpAPI primary backend...');
        const response = await fetch(
          `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpapiKey}`
        );
        if (response.ok) {
          const data: any = await response.json();
          results = (data.organic_results || []).map((r: any) => ({
            title: r.title || '',
            link: r.link || '',
            snippet: r.snippet || '',
            score: this.scoreCredibility(r.link || ''),
          }));
        } else {
          throw new Error('SerpAPI failed');
        }
      } else {
        throw new Error('No SerpAPI key, falling back');
      }
    } catch (e1) {
      try {
        if (braveApiKey) {
          logger.info('[Web Search] Fallback to Brave API...');
          const response = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
            { headers: { Accept: 'application/json', 'X-Subscription-Token': braveApiKey } }
          );
          if (response.ok) {
            const data: any = await response.json();
            results = (data.web?.results || []).map((r: any) => ({
              title: r.title || '',
              link: r.url || '',
              snippet: r.description || '',
              score: this.scoreCredibility(r.url || ''),
            }));
          } else {
            throw new Error('Brave API failed');
          }
        } else {
          throw new Error('No Brave key');
        }
      } catch (e2) {
        logger.info('[Web Search] Fallback to DuckDuckGo Scraper...');
        const response = await fetch(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            },
          }
        );
        if (response.ok) {
          const html = await response.text();
          const blocks = html.split(/class="[^"]*result__body[^"]*"/);
          for (let i = 1; i < blocks.length; i++) {
            const titleMatch = /class="result__a"[^>]*>([\s\S]*?)<\/a>/.exec(blocks[i]);
            const snippetMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(blocks[i]);
            if (titleMatch) {
              const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
              let link =
                (/href="([^"]+)"/.exec(titleMatch[0]) || /href="([^"]+)"/.exec(blocks[i]))?.[1] ||
                '';
              if (link.includes('uddg='))
                link = decodeURIComponent(link.split('uddg=')[1]?.split('&')[0] || link);
              if (link.startsWith('//')) link = 'https:' + link;
              const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
              results.push({ title, link, snippet, score: this.scoreCredibility(link) });
            }
          }
        }
      }
    }

    // Sort by credibility score and limit to top 5
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, 5);

    // Extract full content for top 2 results via crawl4ai
    for (let i = 0; i < Math.min(2, results.length); i++) {
      let content = await this.fetchContentWithCrawl4AI(results[i].link);
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

    // Save to TTL cache
    this.searchCache.set(cacheKey, {
      results,
      expiresAt: Date.now() + this.getQueryTTL(query),
    });
    this.saveCacheToDisk();

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
  async performWebSearch(rawQuery: string) {
    return this.performConversationalSearch(rawQuery);
  }
}
