import fs from 'fs';
import path from 'path';
import { getWorkspaceRoot } from '../../../lib/paths.js';
import { runInSandbox } from '../../../sandbox/dockerSandbox.js';
import { SearchService } from '../../nyx/search.service.js';
import { browserService } from '../../browser/browserService.js';
import { env } from '../../../config/env.js';

const searchService = new SearchService();

// Session-scoped memo scratchpad — isolated per orchestration session
const _sessionMemos = new Map<string, Map<string, string>>();

export function getSessionMemos(sessionId: string): Map<string, string> {
  if (!_sessionMemos.has(sessionId)) {
    _sessionMemos.set(sessionId, new Map());
  }
  return _sessionMemos.get(sessionId)!;
}

export function clearSessionMemos(sessionId: string): void {
  _sessionMemos.delete(sessionId);
}

function resolveWorkspacePath(relativePath: string): string {
  const root = getWorkspaceRoot();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function validateArgs(args: any, parameters: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (parameters.required) {
    for (const req of parameters.required) {
      if (args[req] === undefined) {
        errors.push(`Missing required parameter: ${req}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── Tool factory — returns all tools with memo ops bound to the given sessionId ──
export function createTools(sessionId: string) {
  const memos = getSessionMemos(sessionId);
  return _buildTools(memos);
}

function _buildTools(memos: Map<string, string>) {
  return [
  // ── File I/O ─────────────────────────────────────────────────────────────────
  {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' }
      },
      required: ['path']
    },
    handler: async ({ path: filePath }: { path: string }) => {
      const fullPath = resolveWorkspacePath(filePath);
      const content = await fs.promises.readFile(fullPath, 'utf8');
      return { content, path: filePath, source: filePath };
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    },
    handler: async ({ path: targetPath, content }: { path: string; content: string }) => {
      const fullPath = resolveWorkspacePath(targetPath);
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, content, 'utf8');
      return { success: true, path: targetPath };
    }
  },
  // ── Code Execution ───────────────────────────────────────────────────────────
  {
    name: 'execute_command',
    description: 'Execute a shell command in the workspace sandbox',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout: { type: 'number', default: 30000 }
      },
      required: ['command']
    },
    handler: async ({ command, timeout = 30000 }: { command: string; timeout: number }) => {
      return runInSandbox(command, getWorkspaceRoot(), timeout);
    }
  },

  // ── Web Search (single query, with citation) ─────────────────────────────────
  {
    name: 'search_web',
    description: 'Search the web for current information on a topic',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        queries: { type: 'array', items: { type: 'string' }, description: 'Fallback for array of queries' }
      },
      required: ['query']
    },
    handler: async ({ query, queries }: { query?: string, queries?: string[] }) => {
      const q = query || (queries && queries.length > 0 ? queries[0] : '');
      if (!q) throw new Error('Missing query parameter');
      const rawResults = await searchService.performWebSearch(q);
      const results = Array.isArray(rawResults) ? rawResults : [];
      return {
        results: results.map((r: any, i: number) => ({
          index: i + 1,
          title: r.title || '',
          url: r.link || r.url || '',
          snippet: r.snippet || r.description || '',
          source: r.link || r.url || 'web',
        })),
        query,
      };
    }
  },
  // ── Multi-Search (Kimi Deep Research: run N queries in parallel) ─────────────
  {
    name: 'multi_search',
    description: 'Run multiple web search queries in parallel. Use this for deep research to cover a topic from multiple angles.',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of 3-10 search queries to run in parallel'
        }
      },
      required: ['queries']
    },
    handler: async ({ queries }: { queries: string[] }) => {
      const safeQueries = queries.slice(0, 10); // Cap at 10
      const results = await Promise.allSettled(
        safeQueries.map(q => searchService.performWebSearch(q))
      );
      const combined: any[] = [];
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          res.value.forEach((r: any, i: number) => {
            combined.push({
              index: combined.length + 1,
              query: safeQueries[idx],
              title: r.title || '',
              url: r.link || r.url || '',
              snippet: r.snippet || r.description || '',
              source: r.link || r.url || 'web',
            });
          });
        }
      });
      return { results: combined, totalQueries: safeQueries.length };
    }
  },
  // ── URL Scraper (Kimi WebBridge-inspired) ────────────────────────────────────
  {
    name: 'scrape_url',
    description: 'Fetch and extract the text content from a URL. Use after web_search to read full articles.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to scrape' },
        query: { type: 'string', description: 'Optional search query or task description to filter relevant paragraphs' },
        maxChars: { type: 'number', default: 8000, description: 'Max characters to return (default 8000)' }
      },
      required: ['url']
    },
    handler: async ({ url, query, maxChars = 8000 }: { url: string; query?: string; maxChars?: number }) => {
      try {
        const scraplingPort = env.SCRAPLING_PORT || 3002;
        const res = await fetch(`http://127.0.0.1:${scraplingPort}/v1/scrape`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) {
           return { error: `HTTP ${res.status} from Scrapling proxy`, url };
        }

        const jsonRes: any = await res.json();
        if (!jsonRes.success) {
           return { error: `Scrape failed or returned empty`, url };
        }

        const fullMarkdown = jsonRes.data?.markdown || '';
        const title = jsonRes.data?.metadata?.title || 'Scraped Page';
        
        // Use existing NYX truncation logic to keep token usage safe
        const pruned = pruneTextByQuery(fullMarkdown, query, maxChars);

        return {
          url,
          title,
          content: pruned.content,
          truncated: pruned.truncated,
          source: url,
          method: 'scrapling',
        };
      } catch (e: any) {
        return { error: e.message, url };
      }
    }
  },
  // ── Agent Memo Scratchpad (Kimi Document-to-Skill inspired) ─────────────────
  {
    name: 'memo_write',
    description: 'Write a named memo/note to the shared agent scratchpad for other agents to read.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memo name/key (e.g. "findings", "plan", "sources")' },
        content: { type: 'string', description: 'The content to store' }
      },
      required: ['key', 'content']
    },
    handler: async ({ key, content }: { key: string; content: string }) => {
      memos.set(key, content);
      return { success: true, key, chars: content.length };
    }
  },
  {
    name: 'memo_read',
    description: 'Read a named memo from the shared agent scratchpad.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memo name/key to read' }
      },
      required: ['key']
    },
    handler: async ({ key }: { key: string }) => {
      const content = memos.get(key);
      if (!content) return { error: `No memo found for key: ${key}`, available: [...memos.keys()] };
      return { key, content };
    }
  },
  // ── Playwright Browser Control (Kimi Deep Research inspired) ───────────────
  {
    name: 'browser_navigate',
    description: 'Load a web page and navigate to a URL. Returns the page title.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The absolute URL to navigate to (must start with http:// or https://)' }
      },
      required: ['url']
    },
    handler: async ({ url }: { url: string }) => {
      const result = await browserService.navigate(url);
      return { result };
    }
  },
  {
    name: 'browser_click',
    description: 'Click on a button or link selector on the active web page.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (e.g., "button.search-submit", "a#next")' }
      },
      required: ['selector']
    },
    handler: async ({ selector }: { selector: string }) => {
      const result = await browserService.click(selector);
      return { result };
    }
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field selector on the active web page.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input field' },
        text: { type: 'string', description: 'The text to type' }
      },
      required: ['selector', 'text']
    },
    handler: async ({ selector, text }: { selector: string; text: string }) => {
      const result = await browserService.type(selector, text);
      return { result };
    }
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the active web page. Returns base64 PNG data.',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const base64 = await browserService.getScreenshotBase64();
      return { screenshot: base64 };
    }
  },
  {
    name: 'browser_html',
    description: 'Get the raw HTML content of the active web page.',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const html = await browserService.getPageHtml();
      return { html };
    }
  },
  // ── Document Search (Kimi-parity: search uploaded documents) ────────────────
  {
    name: 'search_documents',
    description: 'Search across documents uploaded by the user (PDFs, DOCX, text files). Use when the user asks questions about files they have shared.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to find relevant content in uploaded documents' },
        limit: { type: 'number', default: 5, description: 'Max results to return (default 5)' }
      },
      required: ['query']
    },
    handler: async ({ query, limit = 5 }: { query: string; limit?: number }) => {
      const { DocumentPipeline } = await import('../../upload/documentPipeline.js');
      const docs = DocumentPipeline.listDocuments();
      if (docs.length === 0) {
        return { error: 'No documents have been uploaded in this session. Ask the user to upload a file first.', results: [] };
      }
      const results = await DocumentPipeline.search(query, limit);
      return {
        results: results.map((r: any) => ({
          source: r.originalName,
          fileId: r.sourceFile,
          chunk: r.chunkIndex + 1,
          text: r.text,
        })),
        totalDocuments: docs.length,
        documentList: docs.map((d: any) => d.originalName),
      };
    }
  },
];
}

export async function executeTool(name: string, args: any, sessionId = 'default'): Promise<any> {
  const tools = createTools(sessionId);
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}. Available: ${tools.map(t => t.name).join(', ')}`);
  }

  const valid = validateArgs(args, tool.parameters);
  if (!valid.valid) {
    throw new Error(`Invalid arguments for ${name}: ${valid.errors.join(', ')}`);
  }

  let timeoutId: any;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Tool ${name} execution timed out after 60 seconds`));
    }, 60000);
  });

  try {
    const result = await Promise.race([
      tool.handler(args as any),
      timeoutPromise
    ]);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}


/** Clear memos for a specific session (or all sessions if no id given). */
export function clearMemos(sessionId?: string): void {
  if (sessionId) {
    _sessionMemos.delete(sessionId);
  } else {
    _sessionMemos.clear();
  }
}

const STOP_WORDS = new Set([
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself',
  'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
  'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom',
  'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but',
  'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
  'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to',
  'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now'
]);

export function pruneTextByQuery(text: string, query: string | undefined, maxChars: number): { content: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { content: text, truncated: false };
  }

  if (!query || !query.trim()) {
    return { content: text.slice(0, maxChars), truncated: true };
  }

  // Tokenize query
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));

  if (queryTerms.length === 0) {
    return { content: text.slice(0, maxChars), truncated: true };
  }

  // Split text into paragraphs (or double-newlines)
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Score each paragraph
  const scoredParagraphs = paragraphs.map((p, idx) => {
    const pLower = p.toLowerCase();
    
    // Scoring logic:
    // 1. Unique query keywords present in paragraph
    // 2. Total occurrence frequency of query keywords
    let uniqueMatches = 0;
    let totalMatches = 0;

    for (const term of queryTerms) {
      // Find term matches using regex
      // Simple regex to find word boundaries
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = pLower.match(regex);
      if (matches) {
        uniqueMatches++;
        totalMatches += matches.length;
      }
    }

    // Heuristic: prioritize paragraphs matching more distinct keywords
    const score = uniqueMatches * 15 + totalMatches;

    return { paragraph: p, index: idx, score };
  });

  // If no paragraphs had any matching keywords, fallback to first maxChars
  const maxScore = Math.max(...scoredParagraphs.map(sp => sp.score));
  if (maxScore === 0) {
    return { content: text.slice(0, maxChars), truncated: true };
  }

  // Sort by score descending
  const sorted = [...scoredParagraphs].sort((a, b) => b.score - a.score);

  // Take paragraphs until maxChars is reached
  const selected: typeof scoredParagraphs = [];
  let currentLength = 0;

  for (const item of sorted) {
    // We want to at least take the top paragraph(s).
    if (currentLength + item.paragraph.length > maxChars && selected.length > 0) {
      break;
    }
    selected.push(item);
    currentLength += item.paragraph.length + 2; // +2 for newlines
  }

  // Sort selected paragraphs by their original index to preserve reading order
  selected.sort((a, b) => a.index - b.index);

  const content = selected.map(item => item.paragraph).join('\n\n');
  return { content, truncated: true };
}
