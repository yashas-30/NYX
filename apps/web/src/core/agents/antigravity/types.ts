/**
 * @file src/core/agents/antigravity/types.ts
 * @description Official Google Antigravity SDK Type Definitions for NYX.
 */

export interface McpStdioServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class Image {
  public type: 'image' = 'image';
  constructor(
    public data: string | Uint8Array,
    public mime_type: string = 'image/png',
    public description?: string
  ) {}

  public get path(): string {
    return typeof this.data === 'string' ? this.data : '';
  }

  static from_file(filePath: string, description?: string): Image {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return new Image(filePath, mime, description);
  }
}

export class Document {
  public type: 'document' = 'document';
  constructor(
    public data: string | Uint8Array,
    public mime_type: string = 'application/pdf',
    public title?: string
  ) {}

  public get path(): string {
    return typeof this.data === 'string' ? this.data : '';
  }

  static from_file(filePath: string, title?: string): Document {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const docMime =
      ext === 'pdf' ? 'application/pdf' : ext === 'md' ? 'text/markdown' : 'text/plain';
    return new Document(filePath, docMime, title || filePath);
  }
}

export type AntigravityContent = string | Image | Document;

export function from_file(filePath: string, description?: string): Document | Image {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    return Image.from_file(filePath, description);
  }
  return Document.from_file(filePath, description);
}

// ── Built-in Tools Reference ──────────────────────────────────────────────────

export enum BuiltinTools {
  LIST_DIR = 'list_directory',
  SEARCH_DIR = 'search_directory',
  FIND_FILE = 'find_file',
  VIEW_FILE = 'view_file',
  CREATE_FILE = 'create_file',
  EDIT_FILE = 'edit_file',
  RUN_COMMAND = 'run_command',
  ASK_QUESTION = 'ask_question',
  START_SUBAGENT = 'start_subagent',
  GENERATE_IMAGE = 'generate_image',
  SEARCH_WEB = 'search_web',
  READ_URL_CONTENT = 'read_url_content',
  FINISH = 'finish',
}

export namespace BuiltinTools {
  export function read_only(): string[] {
    return [
      BuiltinTools.LIST_DIR,
      BuiltinTools.SEARCH_DIR,
      BuiltinTools.FIND_FILE,
      BuiltinTools.VIEW_FILE,
      BuiltinTools.SEARCH_WEB,
      BuiltinTools.READ_URL_CONTENT,
      BuiltinTools.FINISH,
    ];
  }

  export function all(): string[] {
    return [
      BuiltinTools.LIST_DIR,
      BuiltinTools.SEARCH_DIR,
      BuiltinTools.FIND_FILE,
      BuiltinTools.VIEW_FILE,
      BuiltinTools.CREATE_FILE,
      BuiltinTools.EDIT_FILE,
      BuiltinTools.RUN_COMMAND,
      BuiltinTools.ASK_QUESTION,
      BuiltinTools.START_SUBAGENT,
      BuiltinTools.GENERATE_IMAGE,
      BuiltinTools.SEARCH_WEB,
      BuiltinTools.READ_URL_CONTENT,
      BuiltinTools.FINISH,
    ];
  }
}

// ── Personas & System Instructions ───────────────────────────────────────────

export interface SystemInstructionSection {
  title: string;
  content: string;
}

export class TemplatedSystemInstructions {
  constructor(
    public identity: string,
    public sections: SystemInstructionSection[] = []
  ) {}

  toString(): string {
    const secStr = this.sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n');
    return `${this.identity}\n\n${secStr}`.trim();
  }
}

export class CustomSystemInstructions {
  constructor(public text: string) {}

  toString(): string {
    return this.text;
  }
}

export type SystemInstructions = string | TemplatedSystemInstructions | CustomSystemInstructions;

export function resolveSystemInstructions(si?: SystemInstructions): string | undefined {
  if (!si) return undefined;
  if (typeof si === 'string') return si;
  return si.toString();
}

// ── Subagents ─────────────────────────────────────────────────────────────────

export interface SubagentConfig {
  name: string;
  description: string;
  system_instructions: SystemInstructions;
  tools?: Array<((...args: any[]) => any) | string | Record<string, any>>;
}

// ── Capabilities & Policies ───────────────────────────────────────────────────

export interface CapabilitiesConfig {
  read_only?: boolean;
  allow_terminal?: boolean;
  allow_files?: boolean;
  allow_web?: boolean;
  allow_deep_research?: boolean;
  allow_mcp?: boolean;
  enable_subagents?: boolean;
  enabled_tools?: string[];
  disabled_tools?: string[];
}

export type PolicyAction = 'allow' | 'deny' | 'ask_user';

export interface Policy {
  pattern: string;
  action: PolicyAction;
  handler?: (toolName: string, args: any) => Promise<boolean>;
}

export interface Trigger {
  intervalSeconds: number;
  callback: (ctx: any) => Promise<void>;
}

export interface UsageMetadata {
  total_token_count?: number;
  prompt_token_count?: number;
  candidates_token_count?: number;
}

export interface HookResult {
  allow: boolean;
  modifiedPrompt?: string;
}

export interface LocalAgentConfig {
  provider?: string;
  model?: string;
  api_key?: string;
  system_instructions?: SystemInstructions;
  vertex?: boolean;
  project?: string;
  location?: string;
  capabilities?: CapabilitiesConfig;
  policies?: Policy[];
  triggers?: Trigger[];
  tools?: Array<((...args: any[]) => any) | Record<string, any>>;
  subagents?: SubagentConfig[];
  skills_paths?: string[];
  response_schema?: any;
  save_dir?: string;
  conversation_id?: string;
  app_data_dir?: string;
  hooks?: Array<any>;
  mcp_servers?: McpStdioServer[];
  max_iterations?: number;
  temperature?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface ToolResult {
  call_id: string;
  name: string;
  result: any;
  is_error?: boolean;
}

export interface Step {
  id: string;
  iteration: number;
  content?: string;
  thought?: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  subagent_results?: Array<{ subagent: string; task: string; output: string }>;
  is_complete_response: boolean;
  is_error: boolean;
}
