import logger from '../../lib/logger.js';
import { getKeysSync } from '../vault/vault.service.js';
import { LOCAL_MODEL_PORT } from '@nyx/shared';
import { SearchService } from '../nyx/search.service.js';
import { env } from '../../config/env.js';
import { initVectorStore } from '../../lib/memory/vectorStore.js';

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
    onChunk: (chunk: any) => void,
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

    try {
      const { agentApp } = await import('../../lib/agentGraph.js');
      onChunk({ type: 'reasoning', content: 'Initializing agent graph...' });
      await agentApp.invoke({ messages: [{ role: 'user', content: prompt }] });
      onChunk({ type: 'reasoning', content: '\nGraph execution complete. Planning done.' });
    } catch (graphErr: any) {
      logger.warn(`[ChatService] Agent Graph execution failed: ${graphErr.message}`);
    }

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

    try {
      logger.info('[ChatService] Querying LanceDB for memory context...');
      const memoryTable = await initVectorStore();
      
      // We would normally embed the query here. For now, we mock embedding with zeros 
      // or use a local embedding model if available. Since we just have a mock array:
      const mockEmbedding = new Array(384).fill(0);
      const results = await memoryTable.search(mockEmbedding).limit(3).execute();
      
      if (results && results.length > 0) {
        const memoryContext = results
          .filter(r => r.id !== 'init')
          .map(r => `Past Memory: ${r.content}`)
          .join('\n');
        
        if (memoryContext) {
          finalPrompt += `\n\n[Long-Term Memory]:\n${memoryContext}`;
        }
      }
    } catch (err: any) {
      logger.warn(`[ChatService] Memory retrieval failed: ${err.message}`);
    }

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.parts) {
          messages.push({ role: h.role, content: h.parts.map((p: any) => p.text).join('') });
        } else if (h.content) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ 
      role: 'user', 
      content: finalPrompt, 
      images: images.length > 0 ? images : undefined 
    });

    const keys = getKeysSync();
    const apiKey = keys[provider || ''] || '';

    try {
      const { UnifiedEngine } = await import('../../lib/unifiedEngine.js');
      await UnifiedEngine.executeStream(
        {
          provider: provider || 'gemini',
          model: modelId || '',
          messages,
          settings: settings || { temperature: 0.7, maxTokens: 4096 },
          apiKey,
        },
        (chunk: any) => {
          onChunk(chunk.chunk || chunk.token || chunk.choices?.[0]?.delta?.content || '');
        },
        () => {
          onDone();
        }
      );
    } catch (err: any) {
      logger.error({ err }, 'UnifiedEngine stream failed');
      throw new Error(`UnifiedEngine execution failed: ${err.message}`);
    }
  }

  async getSuggestions(history: any[]): Promise<string[]> {
    logger.info('[ChatService] Generating suggestions...');
    // Lightweight LLM call
    const scraplingPort = env.SCRAPLING_PORT || 3002;
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
        const data = await res.json() as any;
        const text = data.text || '';
        const match = text.match(/\[.*\]/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      }
    } catch (e) {
      logger.error(e, '[ChatService] Failed to generate suggestions:');
    }
    return ['What else can you do?', 'Explain that further.', 'Write a code example.'];
  }
}
