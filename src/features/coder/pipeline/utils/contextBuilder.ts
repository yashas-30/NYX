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
      signal,
    });
    if (response.ok) {
      const data: CodebaseSearchResponse = await response.json();
      if (data.success) {
        const results = data.results || [];
        const maxScore =
          results.length > 0
            ? Math.max(...results.map((f) => f.relevanceScore || f.score || 0))
            : 0;
        const resultsStr = results
          .map(
            (f) =>
              `File: ${f.relativePath || f.path} (Relevance Score: ${f.relevanceScore || f.score})\n\`\`\`\n${f.content}\n\`\`\``
          )
          .join('\n\n');
        const context = `\n\n[LOCAL CODEBASE CONTEXT]\nDIRECTORY STRUCTURE:\n${data.directoryStructure || ''}\n\nRELEVANT SOURCE CODE FILES:\n${resultsStr}\n[END CODEBASE CONTEXT]\n`;
        return { context, maxScore };
      }
    }
  } catch (err: any) {
    console.error('Codebase search API failed:', err);
  }
  return { context: '', maxScore: 0 };
}

export function shouldTriggerWebSearch(query: string, analysis?: any): boolean {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  // -------------------------------------------------------------------------
  // PARAMETRIC KNOWLEDGE PATTERNS (FORCE SEARCH = FALSE)
  // These categories bypass search immediately to save tokens.
  // -------------------------------------------------------------------------

  // 1. Static & Historical Facts
  const staticFacts =
    /\b(when was|who was|who is|capital of|define|theorem|law of|history of|biography)\b/i;
  // 2. Reasoning, Math, Logic & Code Generation
  const reasoningAndCode =
    /\b(write|create|build|script|debug|refactor|solve|equation|riddle|algorithm|architecture|boilerplate)\b/i;
  // 3. Creative & Textual Tasks
  const creativeTasks =
    /\b(draft|email|resume|essay|story|brainstorm|roleplay|summarize|translate|rewrite)\b/i;
  // 4. Conceptual Explanations
  const conceptual = /\b(how does.*work|explain the concept|what is the concept|explain how)\b/i;

  if (
    staticFacts.test(lower) ||
    reasoningAndCode.test(lower) ||
    creativeTasks.test(lower) ||
    conceptual.test(lower)
  ) {
    // Unless there is an explicit OVERRIDE word, we return false.
    const explicitOverride = /\b(search the web|verify online|latest|current|recent)\b/i;
    if (!explicitOverride.test(lower)) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // CRITICAL TRIGGER PATTERNS (FORCE SEARCH = TRUE)
  // -------------------------------------------------------------------------

  // 1. Temporal Gaps & News
  const temporal =
    /\b(recent|latest|current|this week|today|yesterday|newest|news|update|2025|2026)\b/i;

  // 2. Highly Dynamic & Volatile Data
  const dynamicData =
    /\b(live|crypto|stock|valuation|market trend|weather|travel advisory|flight status|score|match table|tournament|bracket|price)\b/i;

  // 3. Low-Tolerance Technical / API Specifications
  const techSpecs =
    /\b(api docs|api documentation|library version|syntax change|langchain|openai api|next\.js|nextjs|claude code|documentation|version)\b/i;
  const hasUrl = /(https?:\/\/[^\s]+)/i;

  // 4. Explicit Intent / Verification
  const explicitIntent =
    /\b(search the web|look up|browse|verify online|competitive market intelligence|pricing table|scrape|find online)\b/i;

  if (
    temporal.test(lower) ||
    dynamicData.test(lower) ||
    techSpecs.test(lower) ||
    hasUrl.test(lower) ||
    explicitIntent.test(lower)
  ) {
    return true;
  }

  // Fallback: If it's a general question and missing details, maybe search.
  // Otherwise, default to false to save tokens.
  if (analysis && (analysis.isMissingDebugDetails || analysis.complexity === 'enterprise')) {
    // Only search if it strongly looks like it needs external context that is missing.
    // However, the prompt rules say to minimize use, so we strictly return false if it's not matched.
    return false;
  }

  return false;
}

export function extractSearchQuery(prompt: string): string {
  let cleaned = prompt.trim();

  // Remove starting greetings and politeness
  cleaned = cleaned.replace(
    /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|please|thank\s+you|thanks|could\s+you|can\s+you|would\s+you|search\s+for|search\s+the\s+web\s+for|find\s+out|look\s+up|google)\b/i,
    ''
  );

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
  console.log(
    `[Search Analyzer] Original Prompt: "${prompt}" -> Formulated Search Query: "${searchQuery}"`
  );

  try {
    const response = await fetchWithAuth('/api/nyx/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery }),
      signal,
    });
    if (response.ok) {
      const data: WebSearchResponse = await response.json();
      if (data.success && Array.isArray(data.results)) {
        const resultsStr = data.results
          .map(
            (r, idx) =>
              `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nScraped Page Markdown:\n${r.snippet}`
          )
          .join('\n\n');
        return `\n\nADDITIONAL WEB SEARCH RESULTS:\n${resultsStr}\n`;
      }
    }
  } catch (err: any) {
    console.error('Web search API failed:', err);
  }
  return '';
}
