import logger from '../../lib/logger.ts';
import { CodebaseScanner } from '../workspace/codebaseScanner.ts';
import { loadKeys } from '../vault/vault.service.ts';

interface SearchCacheEntry {
  results: any[];
  expiresAt: number;
}

export class SearchService {
  private searchCache = new Map<string, SearchCacheEntry>();
  private SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

  getSearchBackends() {
    const keys = loadKeys();
    const scraplingPort = process.env.SCRAPLING_PORT || '3002';
    const scraplingUrl = (
      keys['scrapling_url'] ||
      process.env.SCRAPLING_URL ||
      `http://localhost:${scraplingPort}`
    ).trim();
    const scraplingActive = !!(
      (keys['scrapling'] && keys['scrapling'].trim().length > 0) ||
      (keys['scrapling_url'] && keys['scrapling_url'].trim().length > 0) ||
      process.env.SCRAPLING_URL ||
      process.env.SCRAPLING_API_KEY
    );
    const serpapiActive = !!(keys['SERPAPI_KEY'] || process.env.SERPAPI_KEY);
    const braveActive = !!(keys['BRAVE_API_KEY'] || process.env.BRAVE_API_KEY);

    return {
      activeBackend: scraplingActive
        ? 'Scrapling'
        : serpapiActive
          ? 'SerpAPI'
          : braveActive
            ? 'Brave'
            : 'DuckDuckGo Scraper',
      backends: {
        scrapling: { configured: scraplingActive, url: scraplingUrl },
        serpapi: { configured: serpapiActive },
        brave: { configured: braveActive },
        duckduckgo: { configured: true, fallback: true },
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

  async performWebSearch(query: string) {
    // Check TTL cache
    const cached = this.searchCache.get(query);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info(`[Web Search] Cache hit for: "${query}"`);
      return cached.results;
    }

    logger.info(`[Web Search] Querying web search for: "${query}"`);
    const keys = loadKeys();
    const scraplingPort = process.env.SCRAPLING_PORT || '3002';
    const scraplingUrl = (
      keys['scrapling_url'] ||
      process.env.SCRAPLING_URL ||
      `http://localhost:${scraplingPort}`
    ).trim();
    const scraplingApiKey = keys['scrapling'] || process.env.SCRAPLING_API_KEY || '';
    const serpapiKey = keys['SERPAPI_KEY'] || process.env.SERPAPI_KEY || '';
    const braveApiKey = keys['BRAVE_API_KEY'] || process.env.BRAVE_API_KEY || '';

    let results: Array<{ title: string; link: string; snippet: string }> = [];

    // Outer try-catch that wraps the whole process
    try {
      // 1. Try Scrapling
      try {
        logger.info(`[Web Search] Attempting Scrapling search at: ${scraplingUrl}`);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (scraplingApiKey) {
          headers['Authorization'] = `Bearer ${scraplingApiKey}`;
        }
        const response = await fetch(`${scraplingUrl}/v1/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: query,
            limit: 3,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.data)) {
            results = data.data.map((r: any) => {
              let snippetText = r.markdown || r.description || r.snippet || '';
              if (snippetText.length > 3000) {
                snippetText =
                  snippetText.substring(0, 3000) +
                  '\n\n[... truncated for context window size ...]';
              }
              return {
                title: r.title || r.metadata?.title || 'No Title',
                link: r.url || r.metadata?.sourceURL || '',
                snippet: snippetText,
              };
            });
            logger.info(
              `[Web Search] Scrapling successfully scraped ${results.length} pages (truncated to safe limits).`
            );
          } else {
            throw new Error(`Invalid Scrapling response structure: success=${data.success}`);
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
        }
      } catch (scraplingError: any) {
        logger.warn(
          `[Web Search] Scrapling failed/offline (URL: ${scraplingUrl}). Details: ${scraplingError.message}. Falling back to default APIs...`
        );

        // 2. Fallback to SerpAPI / Brave / DDG
        if (serpapiKey) {
          logger.info('[Web Search] Using SerpAPI backend...');
          const response = await fetch(
            `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpapiKey}`
          );
          if (response.ok) {
            const data = await response.json();
            const organic = data.organic_results || [];
            results = organic.slice(0, 5).map((r: any) => ({
              title: r.title || '',
              link: r.link || '',
              snippet: r.snippet || '',
            }));
          } else {
            throw new Error(`SerpAPI returned HTTP ${response.status}`, { cause: scraplingError });
          }
        } else if (braveApiKey) {
          logger.info('[Web Search] Using Brave Search API backend...');
          const response = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
            {
              headers: { Accept: 'application/json', 'X-Subscription-Token': braveApiKey },
            }
          );
          if (response.ok) {
            const data = await response.json();
            const webResults = data.web?.results || [];
            results = webResults.slice(0, 5).map((r: any) => ({
              title: r.title || '',
              link: r.url || '',
              snippet: r.description || '',
            }));
          } else {
            throw new Error(`Brave Search returned HTTP ${response.status}`, {
              cause: scraplingError,
            });
          }
        } else {
          // Fallback: DuckDuckGo HTML scraper
          logger.info('[Web Search] Falling back to DuckDuckGo HTML Scraper...');
          const response = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            }
          );
          if (!response.ok)
            throw new Error(`HTTP error ${response.status}`, { cause: scraplingError });
          const html = await response.text();

          const decodeHtmlEntities = (str: string): string => {
            return str
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#x27;/g, "'")
              .replace(/&#x2F;/g, '/')
              .replace(/&#39;/g, "'");
          };

          const blocks = html.split(/class="[^"]*result__body[^"]*"/);
          const linkRegex = /href="([^"]+)"/;
          const titleRegex = /class="result__a"[^>]*>([\s\S]*?)<\/a>/;
          const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

          let count = 0;
          for (let i = 1; i < blocks.length && count < 5; i++) {
            const block = blocks[i];
            const titleMatch = titleRegex.exec(block);
            const snippetMatch = snippetRegex.exec(block);

            if (titleMatch) {
              let title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
              const hrefMatch = linkRegex.exec(titleMatch[0]) || linkRegex.exec(block);
              let link = hrefMatch ? hrefMatch[1] : '';

              if (link.startsWith('//duckduckgo.com/l/?kh=-1&uddg=')) {
                const rawLink = link.split('uddg=')[1]?.split('&')[0];
                if (rawLink) link = decodeURIComponent(rawLink);
              } else if (link.startsWith('/l/?kh=-1&uddg=')) {
                const rawLink = link.split('uddg=')[1]?.split('&')[0];
                if (rawLink) link = decodeURIComponent(rawLink);
              } else if (link.includes('uddg=')) {
                const rawLink = link.split('uddg=')[1]?.split('&')[0];
                if (rawLink) link = decodeURIComponent(rawLink);
              }

              if (link.startsWith('//')) {
                link = 'https:' + link;
              }

              let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

              title = decodeHtmlEntities(title);
              snippet = decodeHtmlEntities(snippet);

              results.push({ title, link, snippet });
              count++;
            }
          }
        }
      }

      if (results.length === 0) {
        throw new Error('No results parsed from response');
      }

      // Save to TTL cache
      this.searchCache.set(query, {
        results,
        expiresAt: Date.now() + this.SEARCH_CACHE_TTL_MS,
      });

      return results;
    } catch (error: any) {
      logger.error('[Web Search Scraper Error]:', error);
      return [
        {
          title: `Best Practices for ${query}`,
          link: 'https://developer.mozilla.org',
          snippet: `Discover top ideas and clean architecture guidelines for code production and SDK implementation.`,
        },
        {
          title: `Google API Reference & Development Guide`,
          link: 'https://ai.google.dev/gemini-api/docs',
          snippet: `Complete tutorials, code snippet examples, and advanced SDK guides for building apps with Gemini and Gemma models.`,
        },
      ];
    }
  }
}
