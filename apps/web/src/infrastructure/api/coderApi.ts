import { invoke } from '@tauri-apps/api/core';

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
// Secure path validation
// ---------------------------------------------------------------------------

const ALLOWED_ROOTS = ['/workspace', '/project', '/app', '/src', process.env.WORKSPACE_ROOT].filter(Boolean) as string[];

function validateFilePath(filePath: string): void {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('\0')) {
    throw new Error(`SECURITY ERROR: Null byte in path "${filePath}"`);
  }
  const decoded = decodeURIComponent(normalized).replace(/\x2e/g, '.').replace(/%2e/gi, '.');
  if (/\.\.(\/|$)/.test(decoded) || decoded.includes('..')) {
    throw new Error(`SECURITY ERROR: Path traversal detected in "${filePath}". Relative escapes (../) are not allowed.`);
  }
  const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
  const isUnixAbsolute = normalized.startsWith('/');
  if (!isUnixAbsolute && !isWindowsAbsolute) {
    throw new Error(`SECURITY ERROR: Path "${filePath}" must be absolute (start with / or a drive letter)`);
  }
  const isAllowed = ALLOWED_ROOTS.some((root) => normalized.startsWith(root)) || isWindowsAbsolute;
  if (!isAllowed) {
    throw new Error(`SECURITY ERROR: Path "${filePath}" is outside allowed roots`);
  }
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

export async function triggerCritic(payload: CriticPayload): Promise<void> {
  await invoke('trigger_critic', { payload }).catch(console.warn);
}

let rulesCache: { rules: string[]; timestamp: number } | null = null;
const RULES_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchEvolutionaryRules(): Promise<string[]> {
  if (rulesCache && Date.now() - rulesCache.timestamp < RULES_CACHE_TTL_MS) {
    return rulesCache.rules;
  }
  let rules: string[] = [];
  try {
    const data = await invoke<{ success: boolean; rules: any[] }>('fetch_evolutionary_rules');
    if (data && data.success && Array.isArray(data.rules)) {
      rules = data.rules.map((r: RuleEntry | string) => (typeof r === 'string' ? r : r.rule));
    }
  } catch (err) {
    console.warn('[CoderApi] Failed to fetch evolutionary rules:', err);
  }
  rulesCache = { rules, timestamp: Date.now() };
  return rules;
}

export function invalidateRulesCache(): void {
  rulesCache = null;
}

export async function validateWorkspace(signal?: AbortSignal): Promise<ValidationResult> {
  try {
    return await invoke<ValidationResult>('validate_workspace');
  } catch (error: any) {
    return { valid: false, error: error.message || 'Validation failed', success: false, errors: [], warnings: [] };
  }
}

export async function triggerMemoryCommit(payload: MemoryCommitPayload): Promise<void> {
  try {
    await invoke('db_commit_memory', { payload });
  } catch (err: any) {
    console.warn('[CoderApi] Memory commit failed silently:', err?.message ?? String(err));
  }
}

export async function writeFile(filePath: string, content: string, overwrite?: boolean): Promise<FileWriteResult> {
  validateFilePath(filePath);
  return await invoke<FileWriteResult>('fs_write_file', { path: filePath, content, overwrite: !!overwrite });
}

export async function writeFiles(files: Array<{ filePath: string; content: string; overwrite?: boolean }>): Promise<FileWriteResult[]> {
  for (const f of files) validateFilePath(f.filePath);
  const results: FileWriteResult[] = [];
  for (const f of files) {
    try {
      const result = await writeFile(f.filePath, f.content, f.overwrite);
      results.push(result);
    } catch (error: any) {
      results.push({ success: false, path: f.filePath, bytesWritten: 0, existed: false });
      console.error(`[CoderApi] Failed to write ${f.filePath}:`, error.message);
    }
  }
  return results;
}

export async function readFile(filePath: string, signal?: AbortSignal): Promise<string> {
  validateFilePath(filePath);
  return await invoke<string>('fs_read_file', { path: filePath });
}

export async function listDirectory(dirPath: string, signal?: AbortSignal): Promise<Array<{ name: string; type: 'file' | 'directory'; size?: number }>> {
  validateFilePath(dirPath);
  return await invoke<Array<{ name: string; type: 'file' | 'directory'; size?: number }>>('fs_list_dir', { dirPath });
}

export async function executeCommand(command: string, cwd?: string, signal?: AbortSignal, timeout?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return await invoke<{ stdout: string; stderr: string; exitCode: number }>('execute_command', { command, cwd: cwd || '' });
}
