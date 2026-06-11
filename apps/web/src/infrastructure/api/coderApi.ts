/**
 * @file src/infrastructure/api/coderApi.ts
 * @description Production-grade API client with retry logic, timeouts,
 *   batch operations, and Claude/Kimi-parity reliability patterns.
 */

import { AIService } from '@src/core/services/ai.service';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30000;
const RETRYABLE_STATUSES = [502, 503, 504];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CriticPayload {
  prompt: string;
  response: string;
  apiKey: string;
  provider: string;
  modelId: string;
}

export interface MemoryCommitPayload {
  prompt: string;
  response: string;
  provider: string;
  modelId: string;
  agentType?: 'chat' | 'code';
}

export interface WriteFilePayload {
  filePath: string;
  content: string;
  overwrite?: boolean;
}

export interface ValidationResult {
  success: boolean;
  error?: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RuleEntry {
  id: string;
  rule: string;
  priority: number;
  createdAt: string;
}

export interface FileWriteResult {
  success: boolean;
  path: string;
  bytesWritten: number;
  existed: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// fallow-ignore-next-line code-duplication
function createTimeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function mergeSignals(a?: AbortSignal | null, b?: AbortSignal | null): AbortSignal | undefined {
  const cleanA = a || undefined;
  const cleanB = b || undefined;
  if (!cleanA && !cleanB) return undefined;
  if (!cleanA) return cleanB;
  if (!cleanB) return cleanA;

  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  cleanA.addEventListener('abort', abort, { once: true });
  cleanB.addEventListener('abort', abort, { once: true });
  return ctrl.signal;
}

async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check abort before each attempt
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry user aborts or client errors (4xx)
      if (signal?.aborted || error.name === 'AbortError') throw error;
      if (error.status && error.status >= 400 && error.status < 500) {
        throw error;
      }

      if (attempt >= MAX_RETRIES) break;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 200;
      console.warn(`[CoderApi] Retry ${attempt}/${MAX_RETRIES} in ${delay}ms: ${error.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.error || data.message || JSON.stringify(data);
  } catch {
    try {
      return await res.text();
    } catch {
      return res.statusText;
    }
  }
}

// ---------------------------------------------------------------------------
// Secure path validation
// ---------------------------------------------------------------------------

const ALLOWED_ROOTS = ['/workspace', '/project', '/app', '/src', process.env.WORKSPACE_ROOT].filter(
  Boolean
) as string[];

function validateFilePath(filePath: string): void {
  // Normalize separators
  const normalized = filePath.replace(/\\/g, '/');

  // Check for null bytes
  if (normalized.includes('\0')) {
    throw new Error(`SECURITY ERROR: Null byte in path "${filePath}"`);
  }

  // Decode common encodings
  const decoded = decodeURIComponent(normalized).replace(/\x2e/g, '.').replace(/%2e/gi, '.');

  // Check for traversal patterns after decoding
  if (/\.\.(\/|$)/.test(decoded) || decoded.includes('..')) {
    throw new Error(
      `SECURITY ERROR: Path traversal detected in "${filePath}". Relative escapes (../) are not allowed.`
    );
  }

  // Must be absolute path
  const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
  const isUnixAbsolute = normalized.startsWith('/');
  if (!isUnixAbsolute && !isWindowsAbsolute) {
    throw new Error(
      `SECURITY ERROR: Path "${filePath}" must be absolute (start with / or a drive letter)`
    );
  }

  // Must be within allowed roots or drive absolute on Windows
  const isAllowed = ALLOWED_ROOTS.some((root) => normalized.startsWith(root)) || isWindowsAbsolute;
  if (!isAllowed) {
    throw new Error(
      `SECURITY ERROR: Path "${filePath}" must be within allowed roots: ${ALLOWED_ROOTS.join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper with timeout + retry
// ---------------------------------------------------------------------------

export async function apiFetch(
  endpoint: string,
  options: RequestInit & { timeout?: number; noRetry?: boolean } = {}
): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    noRetry = false,
    signal: userSignal,
    ...fetchOptions
  } = options;

  const timeoutSignal = createTimeoutSignal(timeout);
  const signal = mergeSignals(userSignal, timeoutSignal);

  const doFetch = async (): Promise<Response> => {
    const res = await AIService.fetchWithAuth(endpoint, {
      ...fetchOptions,
      signal,
    });

    if (!res.ok) {
      const body = await parseErrorBody(res);
      const error: any = new Error(`${endpoint} failed: ${res.status} ${body}`);
      error.status = res.status;
      error.response = res;
      throw error;
    }

    return res;
  };

  return noRetry ? doFetch() : withRetry(doFetch, signal);
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

export async function triggerCritic(payload: CriticPayload): Promise<void> {
  await apiFetch('/api/v1/nyx/critic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Cache for evolutionary rules (5 minute TTL)
let rulesCache: { rules: string[]; timestamp: number } | null = null;
const RULES_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchEvolutionaryRules(): Promise<string[]> {
  // Return cached if fresh
  if (rulesCache && Date.now() - rulesCache.timestamp < RULES_CACHE_TTL_MS) {
    return rulesCache.rules;
  }

  const res = await apiFetch('/api/v1/nyx/rules');
  const data = await res.json();

  let rules: string[] = [];
  if (data.success && Array.isArray(data.rules)) {
    rules = data.rules.map((r: RuleEntry | string) => (typeof r === 'string' ? r : r.rule));
  }

  rulesCache = { rules, timestamp: Date.now() };
  return rules;
}

export function invalidateRulesCache(): void {
  rulesCache = null;
}

export async function validateWorkspace(signal?: AbortSignal): Promise<ValidationResult> {
  const res = await apiFetch('/api/v1/nyx/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal,
  });
  return res.json();
}

export async function triggerMemoryCommit(payload: MemoryCommitPayload): Promise<void> {
  try {
    await apiFetch('/api/v1/nyx/memory/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 10000, // Shorter timeout for fire-and-forget
      noRetry: true, // Don't block on retry
    });
  } catch (err: any) {
    console.warn('[CoderApi] Memory commit failed silently:', err.message);
  }
}

export async function writeFile(
  filePath: string,
  content: string,
  overwrite?: boolean
): Promise<FileWriteResult> {
  validateFilePath(filePath);

  const res = await apiFetch('/api/v1/nyx/write-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content, overwrite }),
  });
  return res.json();
}

/**
 * Batch write multiple files atomically.
 * All paths validated before any request sent.
 */
export async function writeFiles(
  files: Array<{ filePath: string; content: string; overwrite?: boolean }>
): Promise<FileWriteResult[]> {
  // Validate all paths first (fail fast)
  for (const f of files) {
    validateFilePath(f.filePath);
  }

  // If server supports batch endpoint, use it
  try {
    const res = await apiFetch('/api/v1/nyx/write-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    return res.json();
  } catch {
    // Fallback: sequential individual writes
    const results: FileWriteResult[] = [];
    for (const f of files) {
      try {
        const result = await writeFile(f.filePath, f.content, f.overwrite);
        results.push(result);
      } catch (error: any) {
        results.push({
          success: false,
          path: f.filePath,
          bytesWritten: 0,
          existed: false,
        });
        console.error(`[CoderApi] Failed to write ${f.filePath}:`, error.message);
      }
    }
    return results;
  }
}

/**
 * Read file content from workspace.
 */
export async function readFile(filePath: string, signal?: AbortSignal): Promise<string> {
  validateFilePath(filePath);

  const res = await apiFetch('/api/v1/nyx/read-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
    signal,
  });
  const data = await res.json();
  return data.content;
}

/**
 * List files in directory.
 */
export async function listDirectory(
  dirPath: string,
  signal?: AbortSignal
): Promise<Array<{ name: string; type: 'file' | 'directory'; size?: number }>> {
  validateFilePath(dirPath);

  const res = await apiFetch('/api/v1/nyx/list-dir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirPath }),
    signal,
  });
  const data = await res.json();
  return data.files || [];
}

/**
 * Execute terminal command securely on the backend.
 * Whitelisting and validation are performed by the backend TerminalService.
 */
export async function executeCommand(
  command: string,
  cwd?: string,
  signal?: AbortSignal,
  timeout?: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const res = await apiFetch('/api/v1/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd }),
      signal,
      timeout: timeout || 60000,
    });
    const data = await res.json();
    return { ...data, exitCode: 0 };
  } catch (error: any) {
    // Re-throw with appropriate format or extract stderr if present in response
    let stderr = error.message;
    if (error.response) {
      try {
        const body = await error.response.clone().json();
        if (body.stderr) stderr = body.stderr;
      } catch {
        // ignore
      }
    }
    throw new Error(stderr);
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkCoderApiHealth(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/v1/nyx/health', {
      method: 'GET',
      timeout: 5000,
      noRetry: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
