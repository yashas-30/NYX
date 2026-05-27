import { UnifiedEngine } from '../../lib/unifiedEngine.js';

export interface GeminiStreamParams {
  model: string;
  prompt: string;
  settings?: any;
  systemInstruction?: string;
  history?: any[];
  apiKey?: string;
}

export class GeminiService {
  async executeStream(
    params: GeminiStreamParams,
    onChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    const { model, prompt, settings, systemInstruction, history, apiKey } = params;

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system' as const, content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role as any, content: m.content })));
    }
    messages.push({ role: 'user' as const, content: prompt });

    await UnifiedEngine.executeStream(
      {
        provider: 'gemini',
        model,
        messages,
        settings,
        apiKey
      },
      onChunk,
      onDone
    );
  }
}
