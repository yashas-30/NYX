import { UnifiedEngine } from '../../lib/aiEngine.ts';
import logger from '../../lib/logger.ts';

export interface AgentExecuteParams {
  model: string;
  prompt: string;
  history?: any[];
  apiKey?: string;
  gatewayUrls?: Record<string, string>;
  agentType: 'chat' | 'coder';
  images?: any[];
}

export class AgentsService {
  async executeAgentStream(
    params: AgentExecuteParams,
    onChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    const { model, prompt, history, apiKey, gatewayUrls, agentType, images } = params;

    // Define tools specific to the agent type
    const tools = this.getToolsForAgent(agentType);

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

    // Call unified engine.
    // In a full implementation, this service would loop over the responses,
    // execute tools internally, and then call the engine again.
    // Since we are proxying tools to the backend, the backend will now intercept tool calls.

    // TODO: Implement backend-side tool execution loop.
    // For now, we will stream the tool calls down to the client just in case,
    // or execute them here.

    await UnifiedEngine.executeStream(
      {
        provider: 'gemini',
        model,
        messages,
        apiKey,
        customGatewayUrls: gatewayUrls,
        tools, // Pass tools to the engine
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
