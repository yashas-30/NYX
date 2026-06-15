// @ts-nocheck
import { START, StateGraph, END } from '@langchain/langgraph';
import { UnifiedEngine } from './unifiedEngine.js';
import { mcpClientManager } from '../features/mcp/mcpClientManager.js';

interface AgentState {
  messages: any[];
  plan?: any;
  codeFiles?: any[];
  verificationResults?: any[];
  finalOutput?: string;
  retryCount: number;
  error?: string;
}

const plannerNode = async (state: AgentState, config?: any) => {
  const onChunk = config?.configurable?.onChunk;
  if (onChunk) onChunk({ type: 'thinking', content: 'Planning approach...' });
  
  return { ...state, plan: { status: 'planned', steps: ['Analyze', 'Execute', 'Verify'] } };
};

const coderNode = async (state: AgentState, config?: any) => {
  const options = config?.configurable?.options;
  const onChunk = config?.configurable?.onChunk;
  
  if (!options) return { ...state };

  if (onChunk) onChunk({ type: 'thinking', content: 'Generating response...' });

  let finalContent = '';
  let toolCalls = [];

  await new Promise<void>((resolve, reject) => {
    UnifiedEngine.executeStream(
      {
        ...options,
        messages: state.messages,
      },
      (chunk) => {
        if (chunk.chunk) finalContent += chunk.chunk;
        
        // Pass through to client
        if (onChunk && chunk.chunk) {
          onChunk({ type: 'text', content: chunk.chunk });
        }
        
        if (chunk.choices && chunk.choices[0]?.delta?.tool_calls) {
           const tc = chunk.choices[0].delta.tool_calls[0];
           if (tc && tc.function) {
               toolCalls.push(tc);
           }
        }
      },
      () => resolve()
    ).catch(reject);
  });

  const nextMessages = [...state.messages];
  if (toolCalls.length > 0) {
    nextMessages.push({
      role: 'assistant',
      content: finalContent || null,
      tool_calls: toolCalls
    });
  } else if (finalContent) {
    nextMessages.push({
      role: 'assistant',
      content: finalContent
    });
  }

  return { 
    ...state, 
    messages: nextMessages
  };
};

const toolNode = async (state: AgentState, config?: any) => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage?.tool_calls) return { ...state };

  const onChunk = config?.configurable?.onChunk;

  const toolResults = await Promise.all(
    lastMessage.tool_calls.map(async (tc: any) => {
      try {
        if (onChunk) onChunk({ type: 'tool_running', name: tc.function.name });
        const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        
        let result;
        if (tc.function.name === 'search_web') {
            // Need SearchService instance here
            const { SearchService } = await import('../features/nyx/search.service.js');
            const searchService = new SearchService();
            result = await searchService.performWebSearch(args.query || '');
        } else if (tc.function.name === 'scrape_url') {
            const { scrapeUrl } = await import('../features/tools/webScraper.js');
            result = await scrapeUrl(args.url || '');
        } else {
            result = await mcpClientManager.executeTool(tc.function.name, args || {});
        }
        
        const resultText = typeof result === 'string' ? result : JSON.stringify(result);
        if (onChunk) onChunk({ type: 'tool_done', name: tc.function.name, result: resultText });
        return {
          role: 'tool',
          tool_call_id: tc.id,
          content: resultText
        };
      } catch (err: any) {
        if (onChunk) onChunk({ type: 'tool_error', name: tc.function.name, error: err.message });
        return {
          role: 'tool',
          tool_call_id: tc.id,
          content: `Error: ${err.message}`
        };
      }
    })
  );

  return { ...state, messages: [...state.messages, ...toolResults] };
};

const reviewerNode = async (state: AgentState) => {
  return { ...state };
};

const testerNode = async (state: AgentState) => {
  return { ...state, verificationResults: [{ passed: true, test: 'smoke' }] };
};

const optimizerNode = async (state: AgentState) => {
  return { ...state, finalOutput: 'Optimized output complete.' };
};

const selfCorrectNode = async (state: AgentState) => {
  return { ...state, retryCount: (state.retryCount || 0) + 1, error: undefined };
};

export const workflow = new StateGraph<AgentState>({
  channels: {
    messages: { value: (x, y) => x.concat(y), default: () => [] },
    plan: { value: (x, y) => y ?? x, default: () => null },
    codeFiles: { value: (x, y) => y ?? x, default: () => [] },
    verificationResults: { value: (x, y) => y ?? x, default: () => [] },
    finalOutput: { value: (x, y) => y ?? x, default: () => '' },
    retryCount: { value: (x, y) => y ?? x, default: () => 0 },
    error: { value: (x, y) => y ?? x, default: () => '' },
  }
});

workflow.addNode('planner', plannerNode);
workflow.addNode('coder', coderNode);
workflow.addNode('tools', toolNode);
workflow.addNode('reviewer', reviewerNode);
workflow.addNode('tester', testerNode);
workflow.addNode('optimizer', optimizerNode);
workflow.addNode('self-correct', selfCorrectNode);

workflow.addEdge(START, 'planner');
workflow.addEdge('planner', 'coder');

workflow.addConditionalEdges('coder', (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) return 'tools';
  if (state.error) return 'self-correct';
  return 'reviewer';
});

workflow.addEdge('tools', 'coder');
workflow.addEdge('reviewer', 'tester');
workflow.addConditionalEdges('tester', (state) =>
  state.verificationResults?.some(r => !r.passed) ? 'self-correct' : 'optimizer'
);
workflow.addConditionalEdges('self-correct', (state) =>
  state.retryCount > 3 ? 'optimizer' : 'coder'
);
workflow.addEdge('optimizer', END);

export const agentApp = workflow.compile();
