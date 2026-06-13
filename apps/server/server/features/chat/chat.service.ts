import logger from '../../lib/logger.js';
import { getKeysSync } from '../vault/vault.service.js';
import { LOCAL_MODEL_PORT } from '@nyx/shared';
import { SearchService } from '../nyx/search.service.js';
import { env } from '../../config/env.js';
import { initVectorStore, embedText, searchMemory } from '../../lib/memory/vectorStore.js';
import { mcpClientManager } from '../../lib/mcp/McpClientManager.js';
import { ContextOptimizer } from '../../lib/contextOptimizer.js';
import { semanticCache } from '../../lib/semanticCache.js';

const searchService = new SearchService();

// Initialize semantic cache with embedding function
semanticCache.init(embedText).catch(() => {});

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

    // Check semantic cache first (skip for very short prompts)
    if (prompt.length > 20) {
      const cached = await semanticCache.get(prompt);
      if (cached) {
        logger.info('[ChatService] Serving from semantic cache');
        onChunk('[Cached Response] ');
        // Stream cached response in chunks for better UX
        const words = cached.split(' ');
        for (let i = 0; i < words.length; i += 5) {
          onChunk(words.slice(i, i + 5).join(' ') + (i + 5 < words.length ? ' ' : ''));
        }
        onDone();
        return;
      }
    }

    // Agent Graph unconditionally removed to prevent stream hanging

    const searchKeywords = /\b(search|find|latest|current|news|who is|what is the price|today)\b/i;
    const requiresWebSearch = searchKeywords.test(prompt);

    if (enableWebSearch && requiresWebSearch) {
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
      const memoryContext = await searchMemory(prompt, 3);
      if (memoryContext) {
        finalPrompt += `\n\n[Long-Term Memory]:\n${memoryContext}`;
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
        } else if (h.content !== undefined && h.content !== null) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ 
      role: 'user', 
      content: finalPrompt, 
      images: images.length > 0 ? images : undefined 
    });

    const optimizedMessages = await ContextOptimizer.compressHistory(messages, {
      maxTokens: settings?.maxContextTokens || 32000,
      preservationTurns: settings?.preservationTurns || 6,
      mode: settings?.contextMode || 'prune',
      provider: provider || 'gemini',
      modelId: modelId || 'gemini-3.5-flash',
    });

    const keys = getKeysSync();
    const apiKey = keys[provider || ''] || '';
    logger.info({ apiKeyLength: apiKey?.length, apiKeyPrefix: apiKey ? apiKey.substring(0, 10) : 'none' }, '[ChatService] Resolved API key');

    try {
      // Fetch available MCP tools dynamically
      let tools: any[] | undefined = undefined;
      try {
        const mcpTools = await mcpClientManager.getAvailableTools();
        if (mcpTools && mcpTools.length > 0) {
          tools = mcpTools;
          logger.info(`[ChatService] Loaded ${mcpTools.length} MCP tools.`);
        }
      } catch (e: any) {
        logger.warn({ err: e.message }, 'Failed to fetch MCP tools');
      }

      const { UnifiedEngine } = await import('../../lib/unifiedEngine.js');
      let fullResponse = '';
      await UnifiedEngine.executeStream(
        {
          provider: provider || 'gemini',
          model: modelId || '',
          messages: optimizedMessages,
          settings: settings || { temperature: 0.7, maxTokens: 4096 },
          apiKey,
          tools, // Pass dynamically loaded MCP tools
        },
        (chunk: any) => {
          if (chunk.tool_call) {
            onChunk({ tool_call: chunk.tool_call });
          } else if (chunk.type === 'thinking' || chunk.thinking) {
            const thinkingText = chunk.thinking || chunk.content || '';
            onChunk({ type: 'thinking', content: thinkingText });
          } else {
            const text = chunk.chunk || chunk.token || chunk.choices?.[0]?.delta?.content || '';
            fullResponse += text;
            onChunk(text);
          }
        },
        () => {
          onDone();
          // Store in semantic cache for future similar prompts
          if (fullResponse.length > 50) {
            semanticCache.set(prompt, fullResponse).catch(() => {});
          }
        }
      );
    } catch (err: any) {
      logger.error({ err }, 'UnifiedEngine stream failed');
      throw new Error(`UnifiedEngine execution failed: ${err.message}`);
    }
  }

  async getSuggestions(history: any[]): Promise<string[]> {
    logger.info('[ChatService] Generating suggestions...');
    try {
      const { UnifiedEngine } = await import('../../lib/unifiedEngine.js');
      let resultText = '';
      const promptStr = 'Generate 3 short, relevant follow-up questions or suggestions based on this chat history. Return ONLY a JSON array of strings.';
      const messages = [...history.slice(-5), { role: 'user', content: promptStr }];
      
      await UnifiedEngine.executeStream(
        {
          provider: 'gemini',
          model: 'gemini-3.5-flash',
          messages,
          settings: { temperature: 0.5, maxTokens: 150 },
        },
        (chunk: any) => {
          resultText += chunk.chunk || chunk.token || chunk.choices?.[0]?.delta?.content || '';
        },
        () => {}
      );
      
      const match = resultText.match(/\[.*\]/s);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      logger.error(e, '[ChatService] Failed to generate suggestions:');
    }
    return ['What else can you do?', 'Explain that further.', 'Write a code example.'];
  }
}
