export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ProviderAdapter {
  providerName: string;
  listModels(apiKey?: string): Promise<string[]>;
  getQuota(apiKey?: string): Promise<any>;
  streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown>;
}
