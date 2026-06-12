import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { Task } from './types.js';
import { promptRegistry } from '../prompts/registry.js';
import { getModelCapabilities } from '@nyx/shared';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

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

    // Define tools specific to the agent type
    const tools = this.getToolsForAgent(agentType);

    // Define the system prompt
    const systemInstruction = await this.getSystemPromptForAgent(agentType);

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system' as const, content: systemInstruction });
    }

    const rawHistory = history && Array.isArray(history)
      ? history.map((m: any) => ({ role: m.role as any, content: m.content, images: m.images, functionCall: m.functionCall, functionResponse: m.functionResponse, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id, name: m.name }))
      : [];
    
    // Budget 80K tokens for history (Phase 5.1)
    const slicedHistory = sliceHistoryByTokens(rawHistory, 80_000);
    messages.push(...slicedHistory);

    const userMsg: any = { role: 'user' as const, content: prompt };
    if (images && Array.isArray(images) && images.length > 0) {
      userMsg.images = images;
    }
    messages.push(userMsg);

    if (agentType === 'opencode') {
      await this.executeOpencodeLoop(
        resolvedProvider,
        model,
        messages,
        apiKey,
        gatewayUrls,
        settings,
        tools,
        signal,
        onChunk,
        onDone
      );
      return;
    }

    await UnifiedEngine.executeStream(
      {
        provider: resolvedProvider as any,
        model,
        messages,
        apiKey,
        customGatewayUrls: gatewayUrls,
        settings,
        signal,
        // Use per-model capability check instead of per-provider blanket disable
        tools: getModelCapabilities(model).supportsTools ? tools : undefined,
      },
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
    tools: any[],
    signal: AbortSignal | undefined,
    onChunk: (chunk: any) => void,
    onDone: () => void
  ) {
    const promptMessage = initialMessages[initialMessages.length - 1]?.content || 'Analyze the context and proceed.';
    const historyText = initialMessages.slice(0, -1).map(m => `${m.role}: ${m.content}`).join('\n');
    
    const contextPrompt = historyText ? `Previous Conversation History:\n${historyText}\n\nCurrent Request:\n${promptMessage}` : promptMessage;

    const orchestratorContext = {
      provider,
      model,
      apiKey,
      gatewayUrls,
      executeToolCallback: async (name: string, args: any) => {
        // stream tool execution back to UI
        onChunk({
          tool_result: {
            id: name,
            result: 'executing...'
          }
        });
        const res = await this.executeTool(name, args);
        onChunk({
          tool_result: {
            id: name,
            result: res
          }
        });
        return res;
      }
    };

    const orchestrator = new AgentOrchestrator();
    
    try {
      await orchestrator.orchestrateSupervisor(contextPrompt, orchestratorContext, onChunk);
    } catch (err: any) {
      logger.error(`Error in orchestrateSupervisor: ${err.message}`);
      onChunk({ chunk: `\n\n[System Error: ${err.message}]` });
    }
    
    onDone();
  }

  private async executeTool(name: string, argsStr: string | any): Promise<any> {
    try {
      const args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
      
      if (name === 'execute_command') {
        const cmd = args.command.trim();
        logger.info(`Executing command: ${cmd}`);
        
        // Safety boundary: block highly destructive commands in autonomous mode
        const destructivePatterns = [/^(rm|del)\s+-rf?/i, /^(mkfs|fdisk|dd)\b/i, /^sudo\s+(rm|del|mkfs|fdisk|dd)\b/i];
        for (const pattern of destructivePatterns) {
          if (pattern.test(cmd)) {
            logger.warn(`Blocked destructive command: ${cmd}`);
            return { error: 'Command blocked by safety boundary: Destructive commands are not permitted.' };
          }
        }
        
        const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
        return { stdout: stdout.slice(0, 5000), stderr: stderr.slice(0, 5000) };
      }
      
      if (name === 'read_file') {
        logger.info(`Reading file: ${args.path}`);
        const content = await fs.readFile(args.path, 'utf8');
        return { content: content.slice(0, 20000) };
      }
      
      if (name === 'write_file') {
        logger.info(`Writing file: ${args.path}`);
        await fs.writeFile(args.path, args.content, 'utf8');
        return { success: true };
      }

      if (name === 'searchWeb') {
        logger.info(`Searching web for: ${args.query}`);
        // Basic mock logic to provide somewhat reasonable looking responses without a real API
        return { 
          results: `Mock Web Search Results for "${args.query}":\n1. Example domain - Information about ${args.query} is found here.\n2. News Site - Recent developments regarding ${args.query}.\n3. Wikipedia - General overview of ${args.query}.`
        };
      }

      return { error: `Unknown tool: ${name}` };
    } catch (err: any) {
      logger.error(`Error executing tool ${name}: ${err.message}`);
      return { error: err.message };
    }
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

  private async getSystemPromptForAgent(agentType: 'chat' | 'opencode'): Promise<string> {
    const strictFormatInstruction = `\nCRITICAL INSTRUCTION: You MUST NOT generate any meta-commentary, chain-of-thought, or internal reasoning before your response. DO NOT start your response with phrases like "The user said", "The user wants", "I will", "Here is", or "This is". Begin your response IMMEDIATELY with the direct answer or requested output. DO NOT wrap your entire response in a markdown code block (like \`\`\`text or \`\`\`markdown) unless you are ONLY outputting code. Just output regular markdown directly.`;

    const identityInstruction = `\nIDENTITY: You are NYX, an intelligent AI assistant created by Moonshot AI. Never claim to be created by OpenAI, Google, Anthropic, or any other entity. You are NYX.`;

    const promptName = `system-prompt-${agentType}`;
    const activePrompt = await promptRegistry.getActive(promptName);
    
    let baseInstruction = '';
    
    if (activePrompt) {
        baseInstruction = activePrompt.content;
    } else {
        if (agentType === 'opencode') {
           baseInstruction = `You are NYX OpenCode Agent. You have the ability to read, write, and execute code locally via terminal commands. Solve the user's task directly. Break down the task logically. Feel free to explore the filesystem using terminal commands.`;
        } else {
           baseInstruction = `You are NYX, an advanced AI assistant created by Moonshot AI. You have access to search the web and read files.`;
        }
        await promptRegistry.register(promptName, baseInstruction);
    }

    return baseInstruction + identityInstruction + strictFormatInstruction;
  }

  private getToolsForAgent(agentType: 'chat' | 'opencode'): any[] {
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

    if (agentType === 'opencode') {
      return [
        {
          type: 'function',
          function: {
            name: 'execute_command',
            description: 'Execute a terminal command',
            parameters: {
              type: 'object',
              properties: {
                command: { type: 'string' }
              },
              required: ['command']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a file content',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' }
              },
              required: ['path']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'write_file',
            description: 'Write to a file',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' }
              },
              required: ['path', 'content']
            }
          }
        }
      ];
    }

    return baseTools;
  }
}

