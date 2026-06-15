import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { Task } from './types.js';
import { promptRegistry } from '../prompts/registry.js';
import { getModelCapabilities } from '@nyx/shared';
import { createTools, clearSessionMemos, executeTool as executeCanonicalTool } from './tools/index.js';
import { v4 as uuidv4 } from 'uuid';
import { storeMemory, searchMemory } from '../../lib/memory/vectorStore.js';
import { MemoryService } from '../memory/memoryService.js';
import { DocumentPipeline } from '../upload/documentPipeline.js';
import { memoryQueue } from '../../queues/index.js';

export interface AgentExecuteParams {
  model: string;
  provider?: string;
  prompt: string;
  history?: any[];
  apiKey?: string;
  gatewayUrls?: Record<string, string>;
  agentType: 'chat' | 'opencode';
  images?: any[];
  settings?: any;
  signal?: AbortSignal;
}

// ── Sanitization & Slicing Helpers ───────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+above\s+instructions/i,
  /system\s*:\s*/i,
  /you\s+are\s+now\s+/i,
  /DAN\s+mode/i,
  /jailbreak/i,
];

export function sanitizePrompt(prompt: string): { clean: string; blocked: boolean } {
  const blocked = INJECTION_PATTERNS.some(p => p.test(prompt));
  if (blocked) {
    return {
      clean: '[Content blocked: potential prompt injection detected]',
      blocked: true,
    };
  }
  return { clean: prompt, blocked: false };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sliceHistoryByTokens(messages: any[], maxTokens: number): any[] {
  let total = 0;
  const result: any[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content || '');
    if (total + msgTokens > maxTokens) break;
    total += msgTokens;
    result.unshift(messages[i]);
  }
  return result;
}

export class AgentsService {
  async executeAgentStream(
    params: AgentExecuteParams,
    onChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    const { model, provider: requestedProvider, prompt, history, apiKey, gatewayUrls, agentType, images, settings, signal } = params;

    // Sanitization
    const sanitization = sanitizePrompt(prompt);
    if (sanitization.blocked) {
      onChunk({ chunk: sanitization.clean });
      onDone();
      return;
    }

    // Detect provider — prefer explicit provider from request, then infer from model ID prefix
    let resolvedProvider = requestedProvider || 'gemini';
    if (!requestedProvider) {
      if (model.startsWith('ollama/') || model.startsWith('ollama:')) {
        resolvedProvider = 'ollama';
      } else if (model.startsWith('lmstudio/')) {
        resolvedProvider = 'lmstudio';
      } else if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
        resolvedProvider = 'openai';
      } else if (model.startsWith('claude-')) {
        resolvedProvider = 'anthropic';
      }
    }

    // Get universal system prompt
    const systemInstruction = await this.getSystemPrompt();

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system' as const, content: systemInstruction });
    }

    const rawHistory = history && Array.isArray(history)
      ? history.map((m: any) => ({ role: m.role as any, content: m.content, images: m.images, functionCall: m.functionCall, functionResponse: m.functionResponse, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id, name: m.name }))
      : [];

    // Budget 80K tokens for history
    const slicedHistory = sliceHistoryByTokens(rawHistory, 80_000);
    
    // Semantic memory retrieval for retaining old information
    try {
      const memoryContext = await searchMemory(prompt, 5);
      if (memoryContext && memoryContext.trim().length > 0) {
        messages.push({ role: 'system' as const, content: `Relevant past conversation memory:\n${memoryContext}` });
      }
    } catch (memErr: any) {
      logger.warn('[AgentsService] Memory retrieval failed:', memErr.message);
    }
    
    messages.push(...slicedHistory);

    const userMsg: any = { role: 'user' as const, content: prompt };
    if (images && Array.isArray(images) && images.length > 0) {
      userMsg.images = images;
    }
    messages.push(userMsg);

    // ── RAG context injection: prepend relevant document chunks before LLM call ──
    try {
      const docChunks = await DocumentPipeline.search(prompt, 3);
      if (docChunks && docChunks.length > 0) {
        const ragBlock = docChunks
          .map((c: any) => `[From: ${c.originalName || c.filename || 'uploaded file'}]\n${c.text}`)
          .join('\n\n---\n\n');
        messages.push({ role: 'user' as const, content: `DOCUMENT CONTEXT (from your uploaded files — use this to answer the question):\n${ragBlock}` });
        messages.push({ role: 'assistant' as const, content: 'I have reviewed the document context provided. I will use it to inform my answer.' });
        logger.info(`[AgentsService] Injected ${docChunks.length} RAG chunks into context`);
      }
    } catch (ragErr: any) {
      logger.warn('[AgentsService] RAG injection failed (non-fatal):', ragErr.message);
    }

    // All requests go through the orchestrator
    await this.executeOpencodeLoop(
      resolvedProvider,
      model,
      messages,
      apiKey,
      gatewayUrls,
      settings,
      signal,
      prompt,
      onChunk,
      onDone
    );
  }

  private async executeOpencodeLoop(
    provider: string,
    model: string,
    initialMessages: any[],
    apiKey: string | undefined,
    gatewayUrls: Record<string, string> | undefined,
    settings: any,
    signal: AbortSignal | undefined,
    originalPrompt: string,
    onChunk: (chunk: any) => void,
    onDone: () => void
  ) {
    // Clear memo scratchpad at the start of each new orchestration session
    const sessionId = uuidv4();

    // Build canonical tools list in OpenAI function-call format
    const tools = createTools(sessionId).map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));

    const orchestratorContext = {
      provider,
      model,
      apiKey,
      gatewayUrls,
      tools,
      executeToolCallback: async (name: string, args: any) => {
        logger.info(`[Tool] Executing: ${name}`);
        onChunk({ type: 'thinking', content: `\n⚙️  Running tool: \`${name}\`...\n` });
        try {
          const res = await executeCanonicalTool(name, args, sessionId);
          onChunk({ type: 'thinking', content: `✅  Tool \`${name}\` completed.\n` });

          // ── Emit citation SSE events from web_search and multi_search results ──
          const isSearchTool = name === 'web_search' || name === 'multi_search' || name === 'deep_research_web';
          if (isSearchTool && res && Array.isArray(res.results)) {
            res.results.forEach((r: any, i: number) => {
              if (r.url || r.link) {
                onChunk({
                  type: 'citation',
                  citation: {
                    id: String(r.index || i + 1),
                    title: r.title || r.url || r.link || 'Source',
                    url: r.url || r.link || '',
                    snippet: r.snippet || r.description || '',
                    source: r.source || r.url || r.link || 'web',
                  },
                });
              }
            });
          }

          return res;
        } catch (err: any) {
          logger.error(`[Tool] Error in ${name}: ${err.message}`);
          onChunk({ type: 'thinking', content: `❌  Tool \`${name}\` failed: ${err.message}\n` });
          return { error: err.message };
        }
      }
    };

    const orchestrator = new AgentOrchestrator();

    try {
      const finalResponse = await orchestrator.orchestrateSupervisor(initialMessages, orchestratorContext, onChunk);

      // ── M7: Store Q&A in long-term vector memory ─────────────────────────────
      if (finalResponse && finalResponse.trim().length > 20) {
        const memSessionId = `session_${Date.now()}`;
        const memoryEntry = `Q: ${originalPrompt.slice(0, 500)}\nA: ${finalResponse.slice(0, 1000)}`;
        storeMemory(memoryEntry, memSessionId, 'conversation').catch(() => {});

        // Use BullMQ queue when Redis is available; fall back to fire-and-forget
        if (memoryQueue) {
          memoryQueue.add('consolidate', {
            sessionId: sessionId || 'default',
            messages: [...initialMessages, { role: 'assistant', content: finalResponse }],
            context: orchestratorContext,
          }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }).catch(() => {});
        } else {
          MemoryService.consolidateSession(
            sessionId || 'default',
            [...initialMessages, { role: 'assistant', content: finalResponse }],
            orchestratorContext
          ).catch((err) => {
            logger.warn('[AgentsService] Memory consolidation background task failed:', err.message);
          });
        }
      }
      onDone();
    } catch (err: any) {
      logger.error(`Error in orchestrateSupervisor: ${err.message}`);
      onChunk({ chunk: `\n\n[System Error: ${err.message}]` });
      onChunk({ type: 'error', error: err.message });
      throw err;
    } finally {
      clearSessionMemos(sessionId);
    }
  }

  async orchestrateTask(
    task: Task,
    context: any
  ): Promise<any> {
    const orchestrator = new AgentOrchestrator();
    const prompt = typeof task.prompt === 'string' ? task.prompt : JSON.stringify(task);
    // Wrap prompt into a messages array to match orchestrateSupervisor signature
    const messages = [{ role: 'user', content: prompt }];
    return await orchestrator.orchestrateSupervisor(messages, context, (chunk) => {
      // emit chunk if needed
    });
  }

  private async getSystemPrompt(): Promise<string> {
    // Universal NYX system prompt — works for chat, code, research, planning
    const identityInstruction = `You are NYX, an advanced AI assistant built by the NYX team. You are independent, precise, and highly capable. Never claim to be made by OpenAI, Google, Anthropic, Moonshot AI, or any other company.`;

    const formatInstruction = `\n\nFORMAT RULES:\n- Respond IMMEDIATELY with the direct answer. No preamble like "The user wants", "I will", "Here is", or "This is"\n- Use markdown formatting (headers, bold, code blocks) where it improves clarity\n- Do NOT wrap plain-text responses in markdown code blocks\n- Be concise. Never pad responses.`;

    // Allow custom system prompts via the prompt registry
    const activePrompt = await promptRegistry.getActive('system-prompt-nyx');
    if (activePrompt) {
      return activePrompt.content + formatInstruction;
    }

    const basePrompt = `You are NYX, a highly intelligent AI assistant. You have access to a team of specialized sub-agents (researcher, planner, code interpreter, document analyst, and a communication expert) that you coordinate to give the most accurate, well-reasoned responses possible. You can search the web for real-time information, read and write files, and execute code when needed.`;
    await promptRegistry.register('system-prompt-nyx', basePrompt);
    return basePrompt + `\n\n` + identityInstruction + formatInstruction;
  }
}
