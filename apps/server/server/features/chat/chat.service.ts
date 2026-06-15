import logger from '../../lib/logger.js';
import { getKeysSync } from '../vault/vault.service.js';
import { LOCAL_MODEL_PORT } from '@nyx/shared';
import { SearchService } from '../nyx/search.service.js';
import { env } from '../../config/env.js';
import { initVectorStore, embedText, searchMemory } from '../../lib/memory/vectorStore.js';
import { mcpClientManager } from '../../lib/mcp/McpClientManager.js';
import { ContextOptimizer } from '../../lib/contextOptimizer.js';
import { semanticCache } from '../../lib/semanticCache.js';
import { enqueueEnrichment } from '../../lib/backgroundEnricher.js';

const searchService = new SearchService();

// Initialize semantic cache with embedding function
semanticCache.init(embedText).catch((err) => {
  logger.error({ err }, 'Failed to initialize semantic cache');
});

export interface ChatStreamParams {
  provider?: string;
  modelId?: string;
  prompt: string;
  history?: any[];
  systemInstruction?: string;
  settings?: any;
  enableWebSearch?: boolean;
  images?: { name: string; mimeType: string; data: string }[];
  conversationId?: string;
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
      conversationId,
    } = params;

    logger.info({ modelId, provider, enableWebSearch }, '[ChatService] Starting chat stream...');

    let finalPrompt = prompt;
    let webContext = '';

    // ── Semantic Cache (first-turn only, no '[Cached Response]' prefix) ──────────
    // Only cache first-turn queries — multi-turn context makes stale responses harmful
    if (prompt.length > 20 && history.length === 0) {
      const cached = await semanticCache.get(prompt);
      if (cached) {
        logger.info('[ChatService] Serving from semantic cache');
        // Stream naturally — no prefix that breaks UX
        const words = cached.split(' ');
        for (let i = 0; i < words.length; i += 10) {
          onChunk(words.slice(i, i + 10).join(' ') + (i + 10 < words.length ? ' ' : ''));
          await new Promise(r => setImmediate(r)); // yield event loop
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

    // ── Memory Retrieval (non-blocking, 300ms race) ────────────────────────────
    try {
      const memoryContext = await Promise.race([
        searchMemory(prompt, 3),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 300)),
      ]);
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
      maxTokens: settings?.maxContextTokens || 80_000,
      preservationTurns: settings?.preservationTurns || 6,
      mode: settings?.contextMode || 'prune',
      provider: provider || 'gemini',
      modelId: modelId || 'gemini-3.5-flash',
    });

    const keys = getKeysSync();
    const apiKey = keys[provider || ''] || '';
    logger.info({ apiKeyLength: apiKey?.length, apiKeyPrefix: apiKey ? apiKey.substring(0, 10) : 'none' }, '[ChatService] Resolved API key');

    // ── Background enrichment for next turn ────────────────────────────────
    if (conversationId) {
      enqueueEnrichment(conversationId, prompt, provider || 'gemini', modelId || '', apiKey);
    }

    // ── Load MCP Tools ──────────────────────────────────────────────────
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

    // Append Native Tools
    const nativeTools = [
      {
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web for real-time or up-to-date information.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'scrape_url',
          description: 'Extract clean markdown content from a specific URL.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'The absolute URL to crawl' }
            },
            required: ['url']
          }
        }
      }
    ];
    tools = [...(tools || []), ...nativeTools];


    // ── Agentic Stream Loop with Server-Side Tool Execution ─────────────────
    try {
      const { UnifiedEngine } = await import('../../lib/unifiedEngine.js');

      const MAX_TOOL_ITERATIONS = 10;
      let currentMessages = [...optimizedMessages];
      let fullResponse = '';
      let iteration = 0;
      let streamDone = false;

      while (iteration++ < MAX_TOOL_ITERATIONS && !streamDone) {
        const toolCallsThisTurn: any[] = [];
        let assistantText = '';

        await UnifiedEngine.executeStream(
          {
            provider: provider || 'gemini',
            model: modelId || '',
            messages: currentMessages,
            settings: settings || { temperature: 0.7, maxTokens: 4096 },
            apiKey,
            tools,
            signal,
          },
          (chunk: any) => {
            if (chunk.tool_call || chunk.functionCall) {
              // Collect tool calls for server-side execution
              const toolCall = chunk.tool_call || {
                name: chunk.functionCall?.name,
                args: chunk.functionCall?.args || {},
                id: `call_${Date.now()}`,
              };
              toolCallsThisTurn.push(toolCall);
              onChunk({ type: 'tool_start', tool_call: toolCall });
            } else if (chunk.type === 'thinking' || chunk.thinking) {
              const thinkingText = chunk.thinking || chunk.content || '';
              onChunk({ type: 'thinking', content: thinkingText });
            } else {
              const text = chunk.chunk || chunk.token || chunk.choices?.[0]?.delta?.content || '';
              assistantText += text;
              fullResponse += text;
              onChunk(text);
            }
          },
          () => { /* iteration stream done */ }
        );

        // No tool calls = final answer, exit loop
        if (toolCallsThisTurn.length === 0) {
          streamDone = true;
          break;
        }

        // Append assistant turn with tool calls
        currentMessages.push({
          role: 'assistant',
          content: assistantText || null,
          tool_calls: toolCallsThisTurn.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          })),
        });

        // Execute ALL tool calls in parallel (ChatGPT parity)
        const toolResults = await Promise.all(
          toolCallsThisTurn.map(async (tc) => {
            try {
              onChunk({ type: 'tool_running', name: tc.name });
              let result;
              
              if (tc.name === 'search_web') {
                result = await searchService.performWebSearch(tc.args?.query || '');
              } else if (tc.name === 'scrape_url') {
                // Dynamically import to avoid top-level cyclic issues
                const { scrapeUrl } = await import('../tools/webScraper.js');
                result = await scrapeUrl(tc.args?.url || '');
              } else {
                result = await mcpClientManager.executeTool(tc.name, tc.args || {});
              }
              
              const resultText = typeof result === 'string' ? result : JSON.stringify(result);
              onChunk({ type: 'tool_done', name: tc.name, result: resultText });
              return { id: tc.id, name: tc.name, content: resultText };
            } catch (err: any) {
              const errMsg = `Error executing tool ${tc.name}: ${err.message}`;
              onChunk({ type: 'tool_error', name: tc.name, error: err.message });
              return { id: tc.id, name: tc.name, content: errMsg };
            }
          })
        );

        // Append tool results so the model sees them
        for (const r of toolResults) {
          currentMessages.push({
            role: 'tool',
            tool_call_id: r.id,
            content: r.content,
          });
        }
        // Loop: model generates next response with tool context
      }

      onDone();

      // Cache response for future first-turn identical queries
      if (fullResponse.length > 50 && history.length === 0) {
        semanticCache.set(prompt, fullResponse).catch(() => {});
      }

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
