export interface AGUIMessage {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result' | 'reasoning' | 'error' | 'status';
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    toolName?: string;
    toolArgs?: Record<string, any>;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    latency?: number;
    tokens?: number;
  };
  timestamp: number;
}
