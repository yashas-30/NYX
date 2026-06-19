import type { AIServiceToolDefinition } from '../../../types/agent';

/** Provider-agnostic AI inference settings. */
export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  gpuLayers?: number;
  threads?: number;
  contextSize?: number;
  batchSize?: number;
  mirostat?: number;
  antigravity?: boolean;
}

/** A citation from a web search or RAG source. */
export interface Citation {
  id: string;
  index: number;
  title: string;
  url: string;
  snippet: string;
  domain?: string;
}

/** A single message in a conversation exchanged with an LLM provider. */
export interface Citation {
  id: string;
  index: number;
  title: string;
  url: string;
  snippet: string;
  domain?: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'model';
  content: string;
  timestamp?: number;
  status?: 'success' | 'error' | 'stopped' | 'loading' | 'complete';
  model?: string;
  images?: { name: string; mimeType?: string; data?: string; url?: string }[];
  reasoning?: string;
  toolCalls?: any[];
  citations?: Citation[];
  [key: string]: any;
}

/**
 * Internal request options for provider-specific execution.
 * Used by executeRaw() to pass provider-specific params.
 */
export interface ProviderRequestOptions {
  modelId: string;
  prompt: string;
  apiKey?: string;
  projectId?: string;
  settings?: AISettings;
  systemInstruction?: string;
  history?: ChatMessage[];
  onStream?: (event: any) => void;
  signal?: AbortSignal;
  gatewayUrls?: Record<string, string>;
  images?: ChatMessage['images'];
  tools?: AIServiceToolDefinition[];
  responseFormat?: { type: string; schema?: any };
  reasoning?: boolean;
  agentMode?: 'chat';
  webSearch?: boolean;
  streamEvents?: boolean;
}
