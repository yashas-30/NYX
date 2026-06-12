import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  capabilities: string[];
  maxTokens: number;
  temperature: number;
}

const AGENT_REGISTRY: Record<string, AgentConfig> = {
  web_explorer: {
    id: 'web_explorer',
    name: 'Web Explorer',
    systemPrompt: `You are an elite research assistant. Your job is to extract exact search keywords from the user's prompt, evaluate the top 3 web results for credibility, and synthesize the facts into a clean summary with source links.`,
    capabilities: ['search', 'fact-checking', 'research'],
    maxTokens: 4096,
    temperature: 0.2
  },
  doc_cruncher: {
    id: 'doc_cruncher',
    name: 'Document Cruncher',
    systemPrompt: `You are a document analysis specialist. When given an uploaded file and a question, pinpoint the exact sections of the document that answer the query. Do not assume or extrapolate beyond the provided text.`,
    capabilities: ['rag', 'long-context', 'parsing'],
    maxTokens: 8192,
    temperature: 0.1
  },
  code_interpreter: {
    id: 'code_interpreter',
    name: 'Code Interpreter',
    systemPrompt: `You are a senior software engineer and statistician. If a query requires calculations or coding, write clean, executable script blocks, run them in your environment, and use the exact output to answer the user.`,
    capabilities: ['coding', 'math', 'data-analysis', 'logic'],
    maxTokens: 4096,
    temperature: 0.1
  },
  deep_planner: {
    id: 'deep_planner',
    name: 'Deep Planner',
    systemPrompt: `You are a strategic planner. Do not answer immediately. First, break the user's request into a logical, multi-step checklist. Execute each step sequentially, evaluating your progress at each turn before moving forward.`,
    capabilities: ['reasoning', 'planning', 'chain-of-thought'],
    maxTokens: 4096,
    temperature: 0.3
  },
  persona_polisher: {
    id: 'persona_polisher',
    name: 'Persona & Polisher',
    systemPrompt: `You are a master communicator. Take the raw factual information provided by the other agents and rewrite it to match the user's emotional state, expertise level, and requested format (e.g., table, bullet points, casual chat, formal essay).`,
    capabilities: ['formatting', 'tone', 'synthesis'],
    maxTokens: 8192,
    temperature: 0.4
  }
};

export class AgentOrchestrator {
  
  /**
   * Supervisor LLM decides the routing.
   */
  async orchestrateSupervisor(
    prompt: string, 
    context: any,
    onChunk: (chunk: any) => void
  ): Promise<string> {
    logger.info(`[Supervisor] Analyzing prompt: ${prompt.substring(0, 50)}...`);
    
    const supervisorPrompt = `
You are the Supervisor Agent. Your job is to analyze the user's request and decide which sub-agents to invoke.
Available Agents:
- deep_planner: for highly complex, multi-step tasks (e.g., itineraries, project plans).
- web_explorer: for real-time information, news, search, fact-checking.
- doc_cruncher: if there are large files or documents uploaded (assume standard text processing otherwise).
- code_interpreter: for math, coding, logic puzzles, data analysis.
- persona_polisher: ALWAYS run this agent last to format the final output.

Respond ONLY with a JSON array of agent IDs in the order they should execute. 
Example: ["deep_planner", "web_explorer", "persona_polisher"]

User Request: "${prompt}"
    `;

    let routingPlanRaw = '';
    await new Promise<void>((resolve, reject) => {
      UnifiedEngine.executeStream(
        {
          provider: context.provider,
          model: context.model,
          messages: [{ role: 'user', content: supervisorPrompt }],
          apiKey: context.apiKey,
          settings: { temperature: 0.1, maxTokens: 500 }
        },
        (chunk: any) => { routingPlanRaw += chunk.chunk || ''; },
        () => resolve()
      ).catch(reject);
    });

    let executionOrder: string[] = [];
    try {
      const jsonStr = routingPlanRaw.replace(/```json/g, '').replace(/```/g, '').trim();
      const match = jsonStr.match(/\[(.*?)\]/s);
      if (match) {
        executionOrder = JSON.parse(`[${match[1]}]`);
      } else {
        executionOrder = JSON.parse(jsonStr);
      }
    } catch (e) {
      logger.warn('[Supervisor] Failed to parse routing plan, attempting fallback extraction. Raw: ' + routingPlanRaw);
      const possibleAgents = Object.keys(AGENT_REGISTRY);
      executionOrder = possibleAgents.filter(agent => routingPlanRaw.includes(agent));
      if (executionOrder.length === 0) {
        executionOrder = ['web_explorer', 'persona_polisher'];
      }
    }

    logger.info(`[Supervisor] Execution Plan: ${executionOrder.join(' -> ')}`);
    
    const parallelAgents = executionOrder.filter(id => id !== 'persona_polisher');
    const hasPolisher = executionOrder.includes('persona_polisher');

    let scratchpad = '';
    
    // Run parallel agents
    if (parallelAgents.length > 0) {
      onChunk({ type: 'thinking', content: `[Supervisor] Delegating to parallel agents: ${parallelAgents.join(', ')}...` });
      const parallelPromises = parallelAgents.map(async (agentId) => {
        if (!AGENT_REGISTRY[agentId]) return null;
        const agent = AGENT_REGISTRY[agentId];
        const agentInput = `Original Request: ${prompt}`;
        const result = await this.runAgent(agent, agentInput, context, onChunk);
        return { name: agent.name, result };
      });
      
      const results = await Promise.all(parallelPromises);
      for (const res of results) {
        if (res) {
          scratchpad += `\n\n--- Output from ${res.name} ---\n${res.result}`;
        }
      }
    }

    if (hasPolisher && AGENT_REGISTRY['persona_polisher']) {
      const polisher = AGENT_REGISTRY['persona_polisher'];
      onChunk({ type: 'thinking', content: `[Supervisor] Finalizing output with ${polisher.name}...` });
      
      const polisherInput = scratchpad 
        ? `Original Request: ${prompt}\n\nContext from previous agents:\n${scratchpad}\n\nPlease proceed with your specific task.`
        : `Original Request: ${prompt}`;

      return await this.runAgent(polisher, polisherInput, context, onChunk);
    }

    return scratchpad;
  }

  private async runAgent(agent: AgentConfig, input: string, context: any, onChunk: (chunk: any) => void): Promise<string> {
    const messages: any[] = [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: input }
    ];

    let fullText = '';
    const tools = this.getToolsForAgent(agent.id);
    
    let isLooping = true;
    let loopCount = 0;
    
    if (tools.length === 0) {
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages,
            apiKey: context.apiKey,
            settings: { temperature: agent.temperature, maxTokens: agent.maxTokens }
          },
          (chunk: any) => {
            if (chunk.chunk) {
              fullText += chunk.chunk;
              // Only stream chunks for persona polisher to the UI
              if (agent.id === 'persona_polisher') {
                onChunk({ chunk: chunk.chunk });
              }
            }
          },
          () => resolve()
        ).catch(reject);
      });
      return fullText;
    }

    // Tool loop
    while (isLooping && loopCount < 5) {
      loopCount++;
      const pendingToolCalls: any[] = [];
      let stepText = '';

      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages,
            apiKey: context.apiKey,
            settings: { temperature: agent.temperature, maxTokens: agent.maxTokens },
            tools
          },
          (chunk: any) => {
            if (chunk.tool_call) {
              pendingToolCalls.push(chunk.tool_call);
              onChunk({ type: 'thinking', content: `[${agent.name}] Calling tool: ${chunk.tool_call.name}` });
            } else if (chunk.chunk) {
              stepText += chunk.chunk;
              if (agent.id === 'persona_polisher') {
                onChunk({ chunk: chunk.chunk });
              }
            }
          },
          () => resolve()
        ).catch(reject);
      });

      fullText += stepText;

      if (pendingToolCalls.length === 0) {
        isLooping = false;
        break;
      }

      for (const tc of pendingToolCalls) {
        messages.push({ role: 'assistant', functionCall: tc });
        const result = await context.executeToolCallback(tc.name, tc.arguments || tc.args);
        messages.push({ role: 'function', functionResponse: { name: tc.name, response: result } });
      }
    }

    return fullText;
  }

  private getToolsForAgent(agentId: string): any[] {
    if (agentId === 'web_explorer') {
      return [{
        type: 'function',
        function: {
          name: 'searchWeb',
          description: 'Search the web for real-time information.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        }
      }];
    }
    if (agentId === 'code_interpreter') {
      return [{
        type: 'function',
        function: {
          name: 'execute_command',
          description: 'Execute a terminal command',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command']
          }
        }
      }];
    }
    if (agentId === 'doc_cruncher') {
      return [{
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file content',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      }];
    }
    return [];
  }
}
