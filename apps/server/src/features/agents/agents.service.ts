import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';

export interface AgentExecuteParams {
  provider?: any;
  model: string;
  prompt: string;
  history?: any[];
  apiKey?: string;
  gatewayUrls?: Record<string, string>;
  agentType: 'chat' | 'coder';
  images?: any[];
}

export interface ModelCapabilities {
  supportsTools: boolean;
  maxTokens: number;
  supportsImages: boolean;
}

export type IntentType = 'code' | 'search' | 'creative' | 'factual' | 'general';

export class AgentsService {
  /**
   * Classify user intent based on prompt content.
   */
  private classifyIntent(prompt: string): IntentType {
    const lowerPrompt = prompt.toLowerCase();
    
    // Code-related patterns
    if (
      lowerPrompt.includes('code') ||
      lowerPrompt.includes('function') ||
      lowerPrompt.includes('implement') ||
      lowerPrompt.includes('refactor') ||
      lowerPrompt.includes('debug') ||
      lowerPrompt.includes('fix bug') ||
      lowerPrompt.includes('typescript') ||
      lowerPrompt.includes('javascript') ||
      lowerPrompt.includes('python') ||
      lowerPrompt.includes('api') ||
      lowerPrompt.includes('endpoint') ||
      lowerPrompt.includes('class ') ||
      lowerPrompt.includes('import ') ||
      lowerPrompt.includes('export ')
    ) {
      return 'code';
    }

    // Search/web patterns
    if (
      lowerPrompt.includes('search') ||
      lowerPrompt.includes('find') ||
      lowerPrompt.includes('look up') ||
      lowerPrompt.includes('what is') ||
      lowerPrompt.includes('who is') ||
      lowerPrompt.includes('when did') ||
      lowerPrompt.includes('latest') ||
      lowerPrompt.includes('news')
    ) {
      return 'search';
    }

    // Creative patterns
    if (
      lowerPrompt.includes('write') ||
      lowerPrompt.includes('create') ||
      lowerPrompt.includes('story') ||
      lowerPrompt.includes('poem') ||
      lowerPrompt.includes('creative') ||
      lowerPrompt.includes('imagine') ||
      lowerPrompt.includes('design')
    ) {
      return 'creative';
    }

    // Factual patterns
    if (
      lowerPrompt.includes('explain') ||
      lowerPrompt.includes('how does') ||
      lowerPrompt.includes('why') ||
      lowerPrompt.includes('define') ||
      lowerPrompt.includes('describe')
    ) {
      return 'factual';
    }

    return 'general';
  }

  /**
   * Infer provider from model name.
   */
  private inferProviderFromModel(model: string): string {
    const lowerModel = model.toLowerCase();
    
    if (lowerModel.includes('gemini')) return 'gemini';
    if (lowerModel.includes('gpt') || lowerModel.includes('o1')) return 'openai';
    if (lowerModel.includes('claude')) return 'anthropic';
    if (lowerModel.includes('mistral') || lowerModel.includes('mixtral')) return 'mistral';
    if (lowerModel.includes('llama') || lowerModel.includes('codellama')) return 'ollama';
    
    return 'gemini'; // default
  }

  /**
   * Get model capabilities based on model name.
   */
  private getModelCapabilities(model: string): ModelCapabilities {
    const lowerModel = model.toLowerCase();

    // Gemini models
    if (lowerModel.includes('gemini')) {
      return {
        supportsTools: true,
        maxTokens: lowerModel.includes('pro') ? 32768 : 8192,
        supportsImages: true,
      };
    }

    // OpenAI models
    if (lowerModel.includes('gpt') || lowerModel.includes('o1')) {
      return {
        supportsTools: true,
        maxTokens: lowerModel.includes('4') ? 8192 : 4096,
        supportsImages: true,
      };
    }

    // Claude models
    if (lowerModel.includes('claude')) {
      return {
        supportsTools: true,
        maxTokens: 8192,
        supportsImages: true,
      };
    }

    // Default
    return {
      supportsTools: true,
      maxTokens: 4096,
      supportsImages: false,
    };
  }

  /**
   * Get temperature for intent.
   */
  private getTemperatureForIntent(intent: IntentType): number {
    switch (intent) {
      case 'code':
        return 0.2;
      case 'factual':
        return 0.3;
      case 'search':
        return 0.4;
      case 'creative':
        return 0.8;
      default:
        return 0.5;
    }
  }
  async executeAgentStream(
    params: AgentExecuteParams,
    onChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    const { provider, model, prompt, history, apiKey, gatewayUrls, agentType, images } = params;

    // Classify intent and get model capabilities
    const intent = this.classifyIntent(prompt);
    const capabilities = this.getModelCapabilities(model);
    const temperature = this.getTemperatureForIntent(intent);

    // Define tools specific to the agent type (only if model supports tools)
    const tools = capabilities.supportsTools ? this.getToolsForAgent(agentType) : [];

    // Define the system prompt
    // fallow-ignore-next-line code-duplication
    const systemInstruction = this.getSystemPromptForAgent(agentType);

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

    // Determine provider from model name if not explicitly provided
    const resolvedProvider = provider || this.inferProviderFromModel(model);

    await UnifiedEngine.executeStream(
      {
        provider: resolvedProvider,
        model,
        messages,
        apiKey,
        customGatewayUrls: gatewayUrls,
        tools,
        temperature,
        maxTokens: capabilities.maxTokens,
      },
      onChunk,
      onDone
    );
  }

  private getSystemPromptForAgent(agentType: 'chat' | 'coder'): string {
    const strictFormatInstruction = `\nCRITICAL INSTRUCTION: You MUST NOT generate any meta-commentary, chain-of-thought, or internal reasoning before your response. DO NOT start your response with phrases like "The user said", "The user wants", "I will", "Here is", or "This is". Begin your response IMMEDIATELY with the direct answer or requested output. DO NOT wrap your entire response in a markdown code block (like \`\`\`text or \`\`\`markdown) unless you are ONLY outputting code. Just output regular markdown directly.`;

    if (agentType === 'coder') {
      return (
        `You are an elite AI coding assistant. You have access to tools to read/write files and execute commands. Use them to solve the user's task.` +
        strictFormatInstruction
      );
    }
    return (
      `You are an advanced AI assistant. You have access to search the web and read files.` +
      strictFormatInstruction
    );
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
