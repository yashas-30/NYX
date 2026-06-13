import fs from 'fs';
import path from 'path';
import { getWorkspaceRoot } from '../../../lib/paths.js';
import { runInSandbox } from '../../../sandbox/dockerSandbox.js';
import { CodebaseRAG } from '../../rag/index.js';
import { SearchService } from '../../nyx/search.service.js';

const searchService = new SearchService();

// ── Shared memo scratchpad (in-process, per-server-instance) ─────────────────
const _memos = new Map<string, string>();

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

export const TOOLS = [
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
    handler: async ({ command }: { command: string; timeout: number }) => {
      return runInSandbox(command, getWorkspaceRoot());
    }
  },
  // ── Codebase Search (with citation) ─────────────────────────────────────────
  {
    name: 'search_codebase',
    description: 'Search the codebase for relevant files and code snippets',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number', default: 5 }
      },
      required: ['query']
    },
    handler: async ({ query, topK }: { query: string; topK: number }) => {
      const rag = new CodebaseRAG();
      await rag.initialize(getWorkspaceRoot());
      const results = await rag.search(query, topK || 5);
      // Return structured citation data
      return {
        results: Array.isArray(results) ? results.map((r: any, i: number) => ({
          index: i + 1,
          content: r.content || r,
          source: r.file || r.path || 'codebase',
          excerpt: typeof r.content === 'string' ? r.content.slice(0, 200) : String(r).slice(0, 200),
        })) : [{ index: 1, content: String(results), source: 'codebase', excerpt: String(results).slice(0, 200) }],
        query,
      };
    }
  },
  // ── Web Search (single query, with citation) ─────────────────────────────────
  {
    name: 'web_search',
    description: 'Search the web for current information on a topic',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    },
    handler: async ({ query }: { query: string }) => {
      const rawResults = await searchService.performWebSearch(query);
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
        maxChars: { type: 'number', default: 8000, description: 'Max characters to return (default 8000)' }
      },
      required: ['url']
    },
    handler: async ({ url, maxChars = 8000 }: { url: string; maxChars?: number }) => {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NYX-Agent/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return { error: `HTTP ${res.status}`, url };
        const html = await res.text();
        // Strip HTML tags, scripts, styles
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s{3,}/g, '\n')
          .trim();
        return {
          url,
          content: text.slice(0, maxChars),
          truncated: text.length > maxChars,
          source: url,
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
      _memos.set(key, content);
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
      const content = _memos.get(key);
      if (!content) return { error: `No memo found for key: ${key}`, available: [..._memos.keys()] };
      return { key, content };
    }
  },
];

// ── Tool execution with validation ───────────────────────────────────────────
export async function executeTool(name: string, args: any): Promise<any> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}. Available: ${TOOLS.map(t => t.name).join(', ')}`);
  }

  const valid = validateArgs(args, tool.parameters);
  if (!valid.valid) {
    throw new Error(`Invalid arguments for ${name}: ${valid.errors.join(', ')}`);
  }

  return tool.handler(args as any);
}

/** Clear all memos (call between sessions if needed) */
export function clearMemos(): void {
  _memos.clear();
}
