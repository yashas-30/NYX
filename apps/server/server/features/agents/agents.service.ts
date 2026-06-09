import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { Task } from './types.js';
import { promptRegistry } from '../prompts/registry.js';
import { getModelCapabilities } from '@nyx/shared';

export interface AgentExecuteParams {
  model: string;
  provider?: string;
  prompt: string;
  history?: any[];
  apiKey?: string;
  gatewayUrls?: Record<string, string>;
  agentType: 'chat' | 'coder';
  images?: any[];
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
    const { model, provider: requestedProvider, prompt, history, apiKey, gatewayUrls, agentType, images } = params;

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

    // Define tools specific to the agent type
    const tools = this.getToolsForAgent(agentType);

    // Define the system prompt
    // fallow-ignore-next-line code-duplication
    const systemInstruction = await this.getSystemPromptForAgent(agentType);

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system' as const, content: systemInstruction });
    }

    const rawHistory = history && Array.isArray(history)
      ? history.map((m: any) => ({ role: m.role as any, content: m.content, images: m.images }))
      : [];
    
    // Budget 80K tokens for history (Phase 5.1)
    const slicedHistory = sliceHistoryByTokens(rawHistory, 80_000);
    messages.push(...slicedHistory);

    const userMsg: any = { role: 'user' as const, content: prompt };
    if (images && Array.isArray(images) && images.length > 0) {
      userMsg.images = images;
    }
    messages.push(userMsg);

    await UnifiedEngine.executeStream(
      {
        provider: resolvedProvider as any,
        model,
        messages,
        apiKey,
        customGatewayUrls: gatewayUrls,
        // Use per-model capability check instead of per-provider blanket disable
        tools: getModelCapabilities(model).supportsTools ? tools : undefined,
      },
      onChunk,
      onDone
    );
  }

  async orchestrateTask(
    task: Task,
    context: any
  ): Promise<any> {
    const orchestrator = new AgentOrchestrator();
    const plan = await orchestrator.createExecutionPlan(task);
    logger.info(`Execution plan created with ${plan.agents.length} agents`);
    return await orchestrator.executePlan(plan, context);
  }

  private async getSystemPromptForAgent(agentType: 'chat' | 'coder'): Promise<string> {
    const strictFormatInstruction = `\nCRITICAL INSTRUCTION: You MUST NOT generate any meta-commentary, chain-of-thought, or internal reasoning before your response. DO NOT start your response with phrases like "The user said", "The user wants", "I will", "Here is", or "This is". Begin your response IMMEDIATELY with the direct answer or requested output. DO NOT wrap your entire response in a markdown code block (like \`\`\`text or \`\`\`markdown) unless you are ONLY outputting code. Just output regular markdown directly.`;

    const promptName = `system-prompt-${agentType}`;
    const activePrompt = await promptRegistry.getActive(promptName);
    
    let baseInstruction = '';
    
    if (activePrompt) {
        baseInstruction = activePrompt.content;
    } else {
        // Register initial hardcoded prompts
        if (agentType === 'coder') {
            baseInstruction = `You are an elite AI coding assistant. You have access to tools to read/write files and execute commands. Use them to solve the user's task.`;
        } else {
            baseInstruction = `You are an advanced AI assistant. You have access to search the web and read files.`;
        }
        await promptRegistry.register(promptName, baseInstruction);
    }

    return baseInstruction + strictFormatInstruction;
  }

  private getToolsForAgent(agentType: 'chat' | 'coder'): any[] {
    const baseTools = [
      {
        functionDeclarations: [
          {
            name: 'searchWeb',
            description: 'Search the web for real-time information.',
            parameters: {
              type: 'OBJECT',
              properties: {
                query: { type: 'STRING', description: 'The search query' },
              },
              required: ['query'],
            },
          },
        ],
      },
    ];

    if (agentType === 'coder') {
      return [
        {
          functionDeclarations: [
            ...baseTools[0].functionDeclarations,
            {
              name: 'executeCommand',
              description: 'Execute a terminal command',
              parameters: {
                type: 'OBJECT',
                properties: {
                  command: { type: 'STRING', description: 'Command to run' },
                  cwd: { type: 'STRING', description: 'Working directory' },
                },
                required: ['command'],
              },
            },
            {
              name: 'readFile',
              description: 'Read a file from the workspace',
              parameters: {
                type: 'OBJECT',
                properties: {
                  filePath: { type: 'STRING', description: 'Path to file' },
                },
                required: ['filePath'],
              },
            },
          ],
        },
      ];
    }
    return baseTools;
  }
}
