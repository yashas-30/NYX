/**
 * @file src/core/agents/antigravity/types.ts
 * @description Type definitions for the Google Antigravity SDK.
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
}

export class Document {
  public type: 'document' = 'document';
  constructor(
    public data: string | Uint8Array,
    public mime_type: string = 'application/pdf',
    public title?: string
  ) {}
}

export type AntigravityContent = string | Image | Document;

export function from_file(filePath: string, description?: string): Document | Image {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return new Image(filePath, mime, description);
  }
  const docMime = ext === 'pdf' ? 'application/pdf' : ext === 'md' ? 'text/markdown' : 'text/plain';
  return new Document(filePath, docMime, description || filePath);
}

export interface CapabilitiesConfig {
  read_only?: boolean;
  allow_terminal?: boolean;
  allow_files?: boolean;
  allow_web?: boolean;
  allow_deep_research?: boolean;
  allow_mcp?: boolean;
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

export interface LocalAgentConfig {
  provider?: string;
  model?: string;
  api_key?: string;
  system_instructions?: string;
  vertex?: boolean;
  project?: string;
  location?: string;
  capabilities?: CapabilitiesConfig;
  policies?: Policy[];
  triggers?: Trigger[];
  tools?: Array<((...args: any[]) => any) | Record<string, any>>;
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
  is_complete_response: boolean;
  is_error: boolean;
}
