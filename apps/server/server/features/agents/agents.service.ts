import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { Task } from './types.js';
import { promptRegistry } from '../prompts/registry.js';
import { getModelCapabilities } from '@nyx/shared';
import { TOOLS, executeTool as executeCanonicalTool, clearMemos } from './tools/index.js';
import { storeMemory } from '../../lib/memory/vectorStore.js';

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

    // Sanitization (Phase 4.3)
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
    messages.push(...slicedHistory);

    const userMsg: any = { role: 'user' as const, content: prompt };
    if (images && Array.isArray(images) && images.length > 0) {
      userMsg.images = images;
    }
    messages.push(userMsg);

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
    clearMemos();

    // Build canonical tools list in OpenAI function-call format
    const tools = TOOLS.map(t => ({
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
          const res = await executeCanonicalTool(name, args);
          onChunk({ type: 'thinking', content: `✅  Tool \`${name}\` completed.\n` });
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
        const sessionId = `session_${Date.now()}`;
        const memoryEntry = `Q: ${originalPrompt.slice(0, 500)}\nA: ${finalResponse.slice(0, 1000)}`;
        storeMemory(memoryEntry, sessionId, 'conversation').catch(() => {});
      }
    } catch (err: any) {
      logger.error(`Error in orchestrateSupervisor: ${err.message}`);
      onChunk({ chunk: `\n\n[System Error: ${err.message}]` });
      onChunk({ type: 'error', error: err.message });
    }
    
    onDone();
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
    const identityInstruction = `You are NYX, an advanced AI assistant created by Moonshot AI. You are highly capable, helpful, and precise. Never claim to be created by OpenAI, Google, Anthropic, or any other entity. You are NYX.`;

    const formatInstruction = `\n\nFORMAT RULES:\n- Respond IMMEDIATELY with the direct answer. No preamble like "The user wants", "I will", "Here is", or "This is"\n- Use markdown formatting (headers, bold, code blocks) where it improves clarity\n- Do NOT wrap plain-text responses in markdown code blocks\n- Be concise. Never pad responses.`;

    // Allow custom system prompts via the prompt registry
    const activePrompt = await promptRegistry.getActive('system-prompt-nyx');
    if (activePrompt) {
      return activePrompt.content + formatInstruction;
    }

    const basePrompt = `You are NYX, a highly intelligent AI assistant built by Moonshot AI. You have access to a team of specialized sub-agents (researcher, planner, code interpreter, document analyst, and a communication expert) that you coordinate to give the most accurate, well-reasoned responses possible. You can search the web for real-time information, read and write files, and execute code when needed.`;
    await promptRegistry.register('system-prompt-nyx', basePrompt);
    return basePrompt + `\n\n` + identityInstruction + formatInstruction;
  }
}

