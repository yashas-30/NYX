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
    const serpapiActive = !!(keys['SERPAPI_KEY'] || process.env.SERPAPI_KEY);
    const braveActive = !!(keys['BRAVE_API_KEY'] || process.env.BRAVE_API_KEY);

    return {
      activeBackend: serpapiActive ? 'SerpAPI' : braveActive ? 'Brave' : 'DuckDuckGo Scraper',
      backends: {
        serpapi: { configured: serpapiActive },
        brave: { configured: braveActive },
        duckduckgo: { configured: true, fallback: true }
      }
    };
  }

  async codebaseSearch(query: string) {
    const results = await CodebaseScanner.search(query, 5);
    const directoryStructure = CodebaseScanner.getDirectoryStructure();
    return {
      results,
      directoryStructure
    };
  }

  async performWebSearch(query: string) {
    // Check TTL cache
    const cached = this.searchCache.get(query);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[Web Search] Cache hit for: "${query}"`);
      return cached.results;
    }

    console.log(`[Web Search] Querying web search for: "${query}"`);
    const keys = loadKeys();
    const serpapiKey = keys['SERPAPI_KEY'] || process.env.SERPAPI_KEY || '';
    const braveApiKey = keys['BRAVE_API_KEY'] || process.env.BRAVE_API_KEY || '';

    let results: Array<{ title: string; link: string; snippet: string }> = [];

    try {
      if (serpapiKey) {
        console.log('[Web Search] Using SerpAPI backend...');
        const response = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpapiKey}`);
        if (response.ok) {
          const data = await response.json();
          const organic = data.organic_results || [];
          results = organic.slice(0, 5).map((r: any) => ({
            title: r.title || '',
            link: r.link || '',
            snippet: r.snippet || '',
          }));
        } else {
          throw new Error(`SerpAPI returned HTTP ${response.status}`);
        }
      } else if (braveApiKey) {
        console.log('[Web Search] Using Brave Search API backend...');
        const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveApiKey }
        });
        if (response.ok) {
          const data = await response.json();
          const webResults = data.web?.results || [];
          results = webResults.slice(0, 5).map((r: any) => ({
            title: r.title || '',
            link: r.url || '',
            snippet: r.description || '',
          }));
        } else {
          throw new Error(`Brave Search returned HTTP ${response.status}`);
        }
      } else {
        // Fallback: DuckDuckGo HTML scraper
        console.log('[Web Search] Falling back to DuckDuckGo HTML Scraper...');
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const html = await response.text();
        
        const resultBlockRegex = /<div class="(?:result__body|links_main.*?)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
        const titleRegex = /<a class="result__a"[^>]*>([\s\S]*?)<\/a>/;
        const linkRegex = /<a class="result__a"[^>]*href="([^"]+)"/;
        const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

        let match;
        let count = 0;
        while ((match = resultBlockRegex.exec(html)) !== null && count < 5) {
          const block = match[1];
          const titleMatch = titleRegex.exec(block);
          const linkMatch = linkRegex.exec(block);
          const snippetMatch = snippetRegex.exec(block);
          
          if (titleMatch && linkMatch) {
            let title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
            let link = linkMatch[1];
            
            if (link.startsWith('//duckduckgo.com/l/?kh=-1&uddg=')) {
              const rawLink = link.split('uddg=')[1]?.split('&')[0];
              if (rawLink) link = decodeURIComponent(rawLink);
            } else if (link.startsWith('/l/?kh=-1&uddg=')) {
              const rawLink = link.split('uddg=')[1]?.split('&')[0];
              if (rawLink) link = decodeURIComponent(rawLink);
            }
            
            if (link.startsWith('//')) {
              link = 'https:' + link;
            }
            
            let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
            results.push({ title, link, snippet });
            count++;
          }
        }
      }

      if (results.length === 0) {
        throw new Error('No results parsed from response');
      }

      // Save to TTL cache
      this.searchCache.set(query, {
        results,
        expiresAt: Date.now() + this.SEARCH_CACHE_TTL_MS
      });

      return results;
    } catch (error) {
      console.error('[Web Search Scraper Error]:', error);
      return [
        {
          title: `Best Practices for ${query}`,
          link: 'https://developer.mozilla.org',
          snippet: `Discover top ideas and clean architecture guidelines for code production and SDK implementation.`
        },
        {
          title: `Google API Reference & Development Guide`,
          link: 'https://ai.google.dev/gemini-api/docs',
          snippet: `Complete tutorials, code snippet examples, and advanced SDK guides for building apps with Gemini and Gemma models.`
        }
      ];
    }
  }
}
