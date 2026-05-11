// ─── Dashboard Column & History Types ────────────────────────────────────────

export interface ComparisonColumn {
  id: string;
  modelId?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  output: string;
  localPrompt?: string;
  error?: string;
  metadata?: {
    latency?: number;
    tokens?: number;
    provider?: string;
    tokensPerSecond?: number;
  };
  judgement?: string;
  isSelected?: boolean;
}

export interface ComparisonHistoryItem {
  id: string;
  globalPrompt: string;
  timestamp: number;
  columns: {
    modelId: string;
    output: string;
    status: 'success' | 'error' | 'idle' | 'loading';
  }[];
}
