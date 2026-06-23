import { apiFetch } from './coderApi';

export interface SearchResult {
  success: boolean;
  error?: string;
  results?: Array<{
    path: string;
    relativePath?: string;
    content: string;
    score: number;
    relevanceScore?: number;
    snippet?: string;
  }>;
  directoryStructure?: string;
  files?: Array<{
    path: string;
    score: number;
    snippet?: string;
  }>;
  total?: number;
  query?: string;
}

export interface WebSearchResult {
  success: boolean;
  error?: string;
  results?: Array<{
    title: string;
    url?: string;
    link?: string;
    snippet: string;
    source?: string;
    raw_content?: string;
  }>;
  query?: string;
}

export async function searchCodebase(
  query: string,
  signal?: AbortSignal,
  options?: { topK?: number; threshold?: number }
): Promise<SearchResult> {
  const res = await apiFetch('/api/v1/nyx/codebase-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...options }),
    signal,
  });
  return res.json();
}

export async function searchWeb(
  query: string,
  signal?: AbortSignal,
  options?: { topK?: number; recency?: 'day' | 'week' | 'month' | 'year' }
): Promise<WebSearchResult> {
  try {
    const { useNyxStore } = await import('@src/shared/store/useNyxStore');
    const store = useNyxStore.getState();
    const provider = store.searchProvider || 'duckduckgo';
    const apiKeys = store.apiKeys || {};

    if (provider === 'tavily' && apiKeys['tavily']) {
      return await searchTavily(query, apiKeys['tavily'], signal);
    } else if (provider === 'jina' && apiKeys['jina']) {
      return await searchJina(query, apiKeys['jina'], signal);
    } else {
      // Fallback to DuckDuckGo (via CORS proxy)
      return await searchDuckDuckGo(query, signal);
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Search failed', query };
  }
}

async function searchTavily(query: string, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_raw_content: true,
      max_results: 5,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Tavily search failed: ${res.statusText}`);
  const data = await res.json();
  
  return {
    success: true,
    query,
    results: data.results?.map((r: any) => ({
      title: r.title,
      url: r.url,
      link: r.url,
      snippet: r.content || r.snippet,
      raw_content: r.raw_content,
    })) || []
  };
}

async function searchJina(query: string, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    },
    signal,
  });
  if (!res.ok) throw new Error(`Jina search failed: ${res.statusText}`);
  const data = await res.json();
  
  return {
    success: true,
    query,
    results: data.data?.map((r: any) => ({
      title: r.title,
      url: r.url,
      link: r.url,
      snippet: r.description || r.content?.substring(0, 300),
      raw_content: r.content,
    })) || []
  };
}

async function searchDuckDuckGo(query: string, signal?: AbortSignal): Promise<WebSearchResult> {
  // Use duckduckgo lite HTML version via allorigins
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(ddgUrl)}`;
  
  const res = await fetch(proxyUrl, { signal });
  if (!res.ok) throw new Error(`DuckDuckGo proxy failed: ${res.statusText}`);
  const data = await res.json();
  const html = data.contents;
  
  const results: any[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const resultNodes = doc.querySelectorAll('.result');
  
  let count = 0;
  for (const node of Array.from(resultNodes)) {
    if (count >= 5) break;
    const titleNode = node.querySelector('.result__title a');
    const snippetNode = node.querySelector('.result__snippet');
    const urlNode = node.querySelector('.result__url');
    
    if (titleNode && urlNode) {
      let href = urlNode.getAttribute('href') || '';
      if (href.startsWith('/l/?uddg=')) {
        const urlParams = new URLSearchParams(href.split('?')[1]);
        href = decodeURIComponent(urlParams.get('uddg') || href);
      } else if (!href.startsWith('http')) {
        href = `https://${href.trim()}`;
      }

      results.push({
        title: titleNode.textContent?.trim() || '',
        url: href,
        link: href,
        snippet: snippetNode?.textContent?.trim() || '',
      });
      count++;
    }
  }

  // Fetch full content for top 3 results using free Jina Reader
  const topResults = results.slice(0, 3);
  await Promise.allSettled(
    topResults.map(async (r) => {
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${r.url}`, { signal });
        if (jinaRes.ok) {
           const markdown = await jinaRes.text();
           r.raw_content = markdown;
        }
      } catch (e) {
        // ignore errors
      }
    })
  );

  return {
    success: true,
    query,
    results
  };
}
