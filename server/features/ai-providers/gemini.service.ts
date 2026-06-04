import { UnifiedEngine } from '../../lib/aiEngine.ts';

export interface GeminiStreamParams {
  model: string;
  prompt: string;
  settings?: any;
  systemInstruction?: string;
  history?: any[];
  apiKey?: string;
  images?: any[];
  gatewayUrls?: Record<string, string>;
  tools?: any[];
}

export class GeminiService {
  async executeStream(
    params: GeminiStreamParams,
    onChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    // fallow-ignore-next-line code-duplication
    const {
      model,
      prompt,
      settings,
      systemInstruction,
      history,
      apiKey,
      images,
      gatewayUrls,
      tools,
    } = params;

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system' as const, content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      messages.push(
        ...history.map((m: any) => ({ role: m.role as any, content: m.content, images: m.images }))
      );
    }
    const userMsg: any = { role: 'user' as const, content: prompt };
    if (images && Array.isArray(images) && images.length > 0) {
      userMsg.images = images;
    }
    messages.push(userMsg);

    await UnifiedEngine.executeStream(
      {
        provider: 'gemini',
        model,
        messages,
        settings,
        apiKey,
        customGatewayUrls: gatewayUrls,
        tools,
      },
      onChunk,
      onDone
    );
  }
}
