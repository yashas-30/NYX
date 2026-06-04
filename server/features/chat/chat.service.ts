import logger from '../../lib/logger.ts';
import { getKeysSync } from '../vault/vault.service.ts';
import { LOCAL_MODEL_PORT } from '../../../src/config/ports.ts';
import { SearchService } from '../nyx/search.service.ts';

const searchService = new SearchService();

export interface ChatStreamParams {
  provider?: string;
  modelId?: string;
  prompt: string;
  history?: any[];
  systemInstruction?: string;
  settings?: any;
  enableWebSearch?: boolean;
  images?: { name: string; mimeType: string; data: string }[];
}

export class ChatService {
  async streamChat(
    params: ChatStreamParams,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    onDone: () => void
  ): Promise<void> {
    const {
      provider,
      modelId,
      prompt,
      history = [],
      systemInstruction,
      settings,
      enableWebSearch = true,
      images = [],
    } = params;

    logger.info({ modelId, provider, enableWebSearch }, '[ChatService] Starting chat stream...');

    let finalPrompt = prompt;
    let webContext = '';

    if (enableWebSearch) {
      try {
        // "Fix the agent ask to scrapling feature" - we pre-fetch search if enabled, or ideally use a tool call.
        // For simplicity and speed in the chat, we can query Scrapling directly with the user's prompt
        // or a lightweight LLM call to extract a search query.
        logger.info('[ChatService] Fetching web search context via Scrapling...');
        // Add a strict timeout to Scrapling via SearchService
        const searchResults = await searchService.performWebSearch(prompt);
        if (searchResults && searchResults.length > 0) {
          webContext =
            `\n\n[Web Search Context]:\n` +
            searchResults
              .map((r) => `Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`)
              .join('\n\n');
          finalPrompt += webContext;
        }
      } catch (err: any) {
        logger.warn(
          `[ChatService] Web search failed or timed out: ${err.message}. Proceeding without search context.`
        );
      }
    }

    const payload = {
      model: modelId,
      prompt: finalPrompt,
      history,
      systemInstruction,
      settings: settings || { temperature: 0.7, maxTokens: 4096 },
    };

    if (provider === 'gemini' && modelId) {
      const keys = getKeysSync();
      const activeKey = keys['gemini'] || '';

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${activeKey}&alt=sse`;

      const contents = [...history];
      if (systemInstruction) {
        // Add system instruction if supported by history mapping (simplified for this example)
      }
      const parts: any[] = [{ text: finalPrompt }];
      for (const img of images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      }
      contents.push({ role: 'user', parts });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: payload.settings,
        }),
        signal,
      });

      if (!res.ok) throw new Error(`Gemini API Error: ${res.statusText}`);

      // Basic SSE parser for Gemini
      // fallow-ignore-next-line code-duplication
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader available');

      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) onChunk(text);
            } catch (e) {}
          }
        }
      }
      onDone();
      return;
    }

    // Default fallback to local python scrapling server /api/gemini/stream
    const scraplingPort = process.env.SCRAPLING_PORT || '3002';
    const res = await fetch(`http://127.0.0.1:${scraplingPort}/api/gemini/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Local backend stream error: ${text}`);
    }

    // fallow-ignore-next-line code-duplication
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('No reader available');

    // fallow-ignore-next-line code-duplication
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        onChunk(line + '\n');
      }
    }
    if (buf.trim()) onChunk(buf + '\n');
    onDone();
  }

  async getSuggestions(history: any[]): Promise<string[]> {
    logger.info('[ChatService] Generating suggestions...');
    // Lightweight LLM call
    const scraplingPort = process.env.SCRAPLING_PORT || '3002';
    try {
      const res = await fetch(`http://127.0.0.1:${scraplingPort}/api/gemini/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:
            'Generate 3 short, relevant follow-up questions or suggestions based on this chat history. Return ONLY a JSON array of strings.',
          history: history.slice(-5), // only last 5
          settings: { maxTokens: 150, temperature: 0.5 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.text || '';
        const match = text.match(/\[.*\]/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      }
    } catch (e) {
      logger.error('[ChatService] Failed to generate suggestions:', e);
    }
    return ['What else can you do?', 'Explain that further.', 'Write a code example.'];
  }
}
