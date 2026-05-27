import { ChatMessage } from '@src/infrastructure/types';

export interface CodebaseSearchResponse {
  success: boolean;
  directoryStructure?: string;
  results?: Array<{
    relativePath?: string;
    path?: string;
    relevanceScore?: number;
    score?: number;
    content: string;
  }>;
}

export interface WebSearchResponse {
  success: boolean;
  results?: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
}

export async function buildCodebaseContext(
  prompt: string,
  isCodebase: boolean,
  signal: AbortSignal
): Promise<{ context: string; maxScore: number }> {
  if (!isCodebase) return { context: '', maxScore: 0 };
  try {
    const response = await fetch('/api/nyx/codebase-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: prompt }),
      signal
    });
    if (response.ok) {
      const data: CodebaseSearchResponse = await response.json();
      if (data.success) {
        const results = data.results || [];
        const maxScore = results.length > 0
          ? Math.max(...results.map((f) => f.relevanceScore || f.score || 0))
          : 0;
        const resultsStr = results
          .map((f) => `File: ${f.relativePath || f.path} (Relevance Score: ${f.relevanceScore || f.score})\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n');
        const context = `\n\n[LOCAL CODEBASE CONTEXT]\nDIRECTORY STRUCTURE:\n${data.directoryStructure || ''}\n\nRELEVANT SOURCE CODE FILES:\n${resultsStr}\n[END CODEBASE CONTEXT]\n`;
        return { context, maxScore };
      }
    }
  } catch (err) {
    console.error('Codebase search API failed:', err);
  }
  return { context: '', maxScore: 0 };
}

export async function buildWebSearchContext(
  prompt: string,
  executeWebSearch: boolean,
  signal: AbortSignal
): Promise<string> {
  if (!executeWebSearch) return '';
  try {
    const response = await fetch('/api/nyx/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: prompt }),
      signal
    });
    if (response.ok) {
      const data: WebSearchResponse = await response.json();
      if (data.success && Array.isArray(data.results)) {
        const resultsStr = data.results
          .map((r, idx) => `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`)
          .join('\n\n');
        return `\n\nADDITIONAL WEB SEARCH RESULTS:\n${resultsStr}\n`;
      }
    }
  } catch (err) {
    console.error('Web search API failed:', err);
  }
  return '';
}
