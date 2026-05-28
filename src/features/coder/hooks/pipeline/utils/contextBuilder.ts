import { ChatMessage } from '@src/infrastructure/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

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
    const response = await fetchWithAuth('/api/nyx/codebase-search', {
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

export function shouldTriggerWebSearch(query: string, analysis?: any): boolean {
  const trimmed = query.trim();
  
  // Greetings / Identity regex checks
  const GREETINGS = /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye|see\s+you|good\s+night|good\s+day)\b/i;
  const IDENTITY = /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you|help\s+me)\b/i;
  
  if (GREETINGS.test(trimmed) || IDENTITY.test(trimmed)) {
    return false;
  }

  const lower = query.toLowerCase();

  // Factual, temporal or technical query keywords requiring scraping
  const searchKeywords = [
    'latest', 'recent', 'current', 'today', 'news', 'price', 'weather',
    'documentation', 'docs', 'release', 'version', 'modern', 'how to use',
    'api of', 'npm', 'pip', 'github link', 'url', 'webpage', 'scrape', 'scrapling',
    'search', 'google', 'find out', 'lookup', 'what is the current', 'current state'
  ];
  if (searchKeywords.some(keyword => lower.includes(keyword))) {
    return true;
  }

  // Common question words
  const questionWords = /\b(what|how|who|where|when|why|which|show|find|search|lookup)\b/i;
  if (questionWords.test(trimmed)) {
    return true;
  }

  // If prompt classifier indicates debugging complexity or missing details, scrape
  if (analysis) {
    if (analysis.isMissingDebugDetails || analysis.complexity === 'complex' || analysis.complexity === 'enterprise') {
      return true;
    }
  }

  return false;
}

export function extractSearchQuery(prompt: string): string {
  let cleaned = prompt.trim();
  
  // Remove starting greetings and politeness
  cleaned = cleaned.replace(/^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|please|thank\s+you|thanks|could\s+you|can\s+you|would\s+you|search\s+for|search\s+the\s+web\s+for|find\s+out|look\s+up|google)\b/i, '');
  
  // Remove question framing prefixes
  cleaned = cleaned.replace(/^(what\s+is\s+the|what\s+is|what\s+are|how\s+do\s+i|how\s+to|tell\s+me\s+about|explain|explain\s+how|explain\s+what|do\s+you\s+know\s+about|what's\s+new\s+with|latest\s+info\s+on)\b/i, '');
  
  // Remove trailing punctuation and question marks
  cleaned = cleaned.replace(/[?.,!/]/g, ' ');

  // Standardize spacing
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  if (cleaned.length < 3) {
    return prompt.trim().replace(/[?.,!/]/g, ' ');
  }

  return cleaned;
}

export async function buildWebSearchContext(
  prompt: string,
  executeWebSearch: boolean,
  signal: AbortSignal
): Promise<string> {
  if (!executeWebSearch) return '';
  const searchQuery = extractSearchQuery(prompt);
  console.log(`[Search Analyzer] Original Prompt: "${prompt}" -> Formulated Search Query: "${searchQuery}"`);
  
  try {
    const response = await fetchWithAuth('/api/nyx/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery }),
      signal
    });
    if (response.ok) {
      const data: WebSearchResponse = await response.json();
      if (data.success && Array.isArray(data.results)) {
        const resultsStr = data.results
          .map((r, idx) => `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nScraped Page Markdown:\n${r.snippet}`)
          .join('\n\n');
        return `\n\nADDITIONAL WEB SEARCH RESULTS:\n${resultsStr}\n`;
      }
    }
  } catch (err) {
    console.error('Web search API failed:', err);
  }
  return '';
}
