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
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<SearchResult>('codebase_search_command', {
      query,
      limit: options?.topK || 10,
      threshold: options?.threshold,
    });
    return result;
  } catch (err: any) {
    return { success: false, error: err.message || 'Codebase search failed', query };
  }
}

export async function searchWeb(
  query: string,
  signal?: AbortSignal,
  options?: { topK?: number; recency?: 'day' | 'week' | 'month' | 'year' }
): Promise<WebSearchResult> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    
    // We assume the rust backend handles reading the API keys from the secure store.
    const result = await invoke<WebSearchResult>('search_web_command', {
      query,
      numResults: options?.topK || 5,
    });
    
    return result;
  } catch (err: any) {
    return { success: false, error: err.message || 'Search failed', query };
  }
}
