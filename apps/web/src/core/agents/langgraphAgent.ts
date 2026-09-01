/**
 * langgraphAgent.ts
 *
 * Production LangGraph ReAct Agent Implementation for NYX.
 * Builds stateful, multi-turn LLM reasoning and tool-calling loops using LangGraph
 * and @langchain/google-genai with Gemini 3.5 Flash-Lite (base) and Gemini 3.1 Flash-Lite (backup).
 */

import { Annotation, StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, ToolMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import { StructuredTool, tool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import { toolExecutor } from '@src/infrastructure/services/toolSystem';

export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [],
  }),
  stepCount: Annotation<number>({
    reducer: (x: number, y: number) => (y !== undefined ? y : x),
    default: () => 0,
  }),
  maxSteps: Annotation<number>({
    reducer: (x: number, y: number) => (y !== undefined ? y : x),
    default: () => 10,
  }),
  currentThought: Annotation<string | undefined>({
    reducer: (x?: string, y?: string) => (y !== undefined ? y : x),
    default: () => undefined,
  }),
  finalOutput: Annotation<string | undefined>({
    reducer: (x?: string, y?: string) => (y !== undefined ? y : x),
    default: () => undefined,
  }),
  error: Annotation<string | undefined>({
    reducer: (x?: string, y?: string) => (y !== undefined ? y : x),
    default: () => undefined,
  }),
});

export type LangGraphAgentState = typeof AgentStateAnnotation.State;

export interface LangGraphAgentConfig {
  apiKey: string;
  primaryModel?: string; // Default: 'gemini-3.5-flash-lite'
  backupModel?: string; // Default: 'gemini-3.1-flash-lite'
  temperature?: number;
  maxSteps?: number;
  tools?: StructuredTool[];
  onStep?: (step: {
    iteration: number;
    thought?: string;
    toolName?: string;
    toolArgs?: any;
    toolResult?: string;
    isFinished: boolean;
    isError: boolean;
  }) => void;
}

export const DEFAULT_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_BACKUP_MODEL = 'gemini-3.1-flash-lite';

/**
 * Creates default search, media, code, memory, and filesystem tools for the agent.
 */
export function createDefaultLangGraphTools(): StructuredTool[] {
  const webSearchTool = tool(
    async ({ query }) => {
      try {
        const res = await toolExecutor.executeSingle({
          id: `search_${Date.now()}`,
          name: 'web_search',
          arguments: { query },
          rawArguments: JSON.stringify({ query }),
        });
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      } catch (err: any) {
        return JSON.stringify({ error: err?.message || 'Web search failed' });
      }
    },
    {
      name: 'web_search',
      description:
        'Searches the live web for real-time information, technical docs, and grounded facts.',
      schema: z.object({
        query: z.string().describe('Search query keywords or query string'),
      }),
    }
  );

  const searchImagesTool = tool(
    async ({ query }) => {
      try {
        const res = await toolExecutor.executeSingle({
          id: `img_${Date.now()}`,
          name: 'search_images',
          arguments: { query },
          rawArguments: JSON.stringify({ query }),
        });
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      } catch (err: any) {
        return JSON.stringify({ error: err?.message || 'Image search failed' });
      }
    },
    {
      name: 'search_images',
      description: 'Searches for relevant web images and photos to illustrate explanations.',
      schema: z.object({
        query: z.string().describe('Visual search query'),
      }),
    }
  );

  const searchVideosTool = tool(
    async ({ query }) => {
      try {
        const res = await toolExecutor.executeSingle({
          id: `vid_${Date.now()}`,
          name: 'search_videos',
          arguments: { query },
          rawArguments: JSON.stringify({ query }),
        });
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      } catch (err: any) {
        return JSON.stringify({ error: err?.message || 'Video search failed' });
      }
    },
    {
      name: 'search_videos',
      description: 'Searches and scores YouTube videos for tutorials, lectures, and documentaries.',
      schema: z.object({
        query: z.string().describe('Video search query'),
      }),
    }
  );

  const generateImageTool = tool(
    async ({ prompt, aspect_ratio }) => {
      try {
        const res = await toolExecutor.executeSingle({
          id: `gen_img_${Date.now()}`,
          name: 'generate_image',
          arguments: { prompt, aspect_ratio: aspect_ratio || '16:9' },
          rawArguments: JSON.stringify({ prompt, aspect_ratio: aspect_ratio || '16:9' }),
        });
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      } catch (err: any) {
        return JSON.stringify({ error: err?.message || 'Image generation failed' });
      }
    },
    {
      name: 'generate_image',
      description:
        'Generates high-resolution images, illustrations, or diagram visual assets via AI.',
      schema: z.object({
        prompt: z.string().describe('Detailed visual prompt describing the desired image'),
        aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3']).optional().describe('Aspect ratio'),
      }),
    }
  );

  const calculateTool = tool(
    async ({ expression }) => {
      try {
        const res = await toolExecutor.executeSingle({
          id: `calc_${Date.now()}`,
          name: 'calculate',
          arguments: { expression },
          rawArguments: JSON.stringify({ expression }),
        });
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      } catch (err: any) {
        return JSON.stringify({ error: `Math evaluation failed: ${err.message}` });
      }
    },
    {
      name: 'calculate',
      description: 'Calculates mathematical or statistical expressions accurately.',
      schema: z.object({
        expression: z
          .string()
          .describe('Mathematical expression to calculate, e.g. 25 * 400 + 120'),
      }),
    }
  );

  const executePythonTool = tool(
    async ({ code }) => {
      try {
        const res = await toolExecutor.executeSingle({
          id: `py_${Date.now()}`,
          name: 'execute_python',
          arguments: { code },
          rawArguments: JSON.stringify({ code }),
        });
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      } catch (err: any) {
        return JSON.stringify({ error: `Python execution failed: ${err.message}` });
      }
    },
    {
      name: 'execute_python',
      description:
        'Executes Python code in a safe sandbox environment to analyze data or run computations.',
      schema: z.object({
        code: z.string().describe('Python code to execute'),
      }),
    }
  );

  const memorySearchTool = tool(
    async ({ query }) => {
      try {
        const res = await toolExecutor.executeSingle({
          id: `mem_${Date.now()}`,
          name: 'read_memory',
          arguments: { query },
          rawArguments: JSON.stringify({ query }),
        });
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      } catch (err: any) {
        return JSON.stringify({ error: `Memory search failed: ${err.message}` });
      }
    },
    {
      name: 'read_memory',
      description:
        'Searches past conversation history and user knowledge stored in TurboVec vector memory.',
      schema: z.object({
        query: z.string().describe('Topic or entity to retrieve from memory'),
      }),
    }
  );

  return [
    webSearchTool as any,
    searchImagesTool as any,
    searchVideosTool as any,
    generateImageTool as any,
    calculateTool as any,
    executePythonTool as any,
    memorySearchTool as any,
  ];
}

/**
 * Creates and compiles a LangGraph ReAct agent graph with Gemini models.
 */
export function createLangGraphReActAgent(config: LangGraphAgentConfig) {
  const primaryModelName = config.primaryModel || DEFAULT_PRIMARY_MODEL;
  const backupModelName = config.backupModel || DEFAULT_BACKUP_MODEL;
  const tools =
    config.tools && config.tools.length > 0 ? config.tools : createDefaultLangGraphTools();
  const toolsByName: Record<string, StructuredTool> = Object.fromEntries(
    tools.map((t) => [t.name, t])
  );

  // Primary LLM initialization
  const primaryLlm = new ChatGoogleGenerativeAI({
    model: primaryModelName,
    apiKey: config.apiKey,
    temperature: config.temperature ?? 0.2,
    maxRetries: 2,
  });

  // Backup LLM initialization
  const backupLlm = new ChatGoogleGenerativeAI({
    model: backupModelName,
    apiKey: config.apiKey,
    temperature: config.temperature ?? 0.2,
    maxRetries: 2,
  });

  const boundPrimaryModel = primaryLlm.bindTools(tools);
  const boundBackupModel = backupLlm.bindTools(tools);

  // 1. Model Node with Automatic Fallback
  async function callModel(state: LangGraphAgentState): Promise<Partial<LangGraphAgentState>> {
    const currentStep = (state.stepCount || 0) + 1;
    let response: AIMessage;

    try {
      response = (await boundPrimaryModel.invoke(state.messages)) as AIMessage;
    } catch (primaryErr: any) {
      console.warn(
        `[LangGraphAgent] Primary model (${primaryModelName}) error, invoking backup (${backupModelName}):`,
        primaryErr
      );
      try {
        response = (await boundBackupModel.invoke(state.messages)) as AIMessage;
      } catch (backupErr: any) {
        throw new Error(
          `Both primary (${primaryModelName}) and backup (${backupModelName}) failed: ${backupErr.message}`
        );
      }
    }

    const toolCalls = response.tool_calls || [];
    const thought = typeof response.content === 'string' ? response.content : '';

    if (config.onStep) {
      config.onStep({
        iteration: currentStep,
        thought,
        toolName: toolCalls.length > 0 ? toolCalls[0].name : undefined,
        toolArgs: toolCalls.length > 0 ? toolCalls[0].args : undefined,
        isFinished: toolCalls.length === 0,
        isError: false,
      });
    }

    return {
      messages: [response],
      stepCount: currentStep,
      currentThought: thought,
      finalOutput: toolCalls.length === 0 ? thought : undefined,
    };
  }

  // 2. Tool Execution Node
  async function callTool(state: LangGraphAgentState): Promise<Partial<LangGraphAgentState>> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];
    const toolOutputs: ToolMessage[] = [];

    for (const toolCall of toolCalls) {
      const toolInstance = toolsByName[toolCall.name];
      let resultString = '';

      if (!toolInstance) {
        resultString = JSON.stringify({ error: `Tool ${toolCall.name} not found.` });
      } else {
        try {
          const rawResult = await (toolInstance as any).invoke(toolCall.args);
          resultString = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
        } catch (err: any) {
          resultString = JSON.stringify({ error: `Tool execution failed: ${err.message}` });
        }
      }

      toolOutputs.push(
        new ToolMessage({
          content: resultString,
          name: toolCall.name,
          tool_call_id: toolCall.id || `${toolCall.name}-${Date.now()}`,
        })
      );

      if (config.onStep) {
        config.onStep({
          iteration: state.stepCount,
          toolName: toolCall.name,
          toolArgs: toolCall.args,
          toolResult: resultString,
          isFinished: false,
          isError: resultString.includes('"error":'),
        });
      }
    }

    return {
      messages: toolOutputs,
    };
  }

  // 3. Conditional Edge: shouldContinue
  function shouldContinue(state: LangGraphAgentState): 'tools' | '__end__' {
    const maxSteps = state.maxSteps || config.maxSteps || 10;
    if (state.stepCount >= maxSteps) {
      return '__end__';
    }

    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || !(lastMessage instanceof AIMessage)) {
      return '__end__';
    }

    const toolCalls = lastMessage.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      return 'tools';
    }

    return '__end__';
  }

  // 4. Assemble Graph Workflow
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('llm', callModel)
    .addNode('tools', callTool)
    .addEdge(START, 'llm')
    .addConditionalEdges('llm', shouldContinue, {
      tools: 'tools',
      __end__: END,
    })
    .addEdge('tools', 'llm');

  return workflow.compile();
}

/**
 * Runs the LangGraph agent for a given prompt.
 */
export async function runLangGraphAgent(
  prompt: string,
  config: LangGraphAgentConfig
): Promise<string> {
  const app = createLangGraphReActAgent(config);
  const initialState = {
    messages: [new HumanMessage(prompt)],
    stepCount: 0,
    maxSteps: config.maxSteps || 10,
  };

  const finalState = (await app.invoke(initialState)) as LangGraphAgentState;
  const lastMsg = finalState.messages[finalState.messages.length - 1];
  return finalState.finalOutput || (lastMsg?.content as string) || '';
}
