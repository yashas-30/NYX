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
  }>;
  query?: string;
}

export async function searchCodebase(
  query: string,
  signal?: AbortSignal,
  options?: { topK?: number; threshold?: number }
): Promise<SearchResult> {
  const res = await apiFetch('/api/nyx/codebase-search', {
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
  const res = await apiFetch('/api/nyx/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...options }),
    signal,
  });
  return res.json();
}
