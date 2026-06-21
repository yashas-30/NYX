import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { AIService } from '@src/core/services/ai.service';
import { executeTool } from './executeTool';
import { ToolRegistry } from './ToolRegistry';
import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

const BrowserState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: messagesStateReducer,
    default: () => [],
  })
});

export class BrowserAgent extends BaseAgent<BaseAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    yield* this.emitThinking('Browser Agent: Initializing web automation environment...', []);

    let streamCallback: (event: StreamEvent) => void;
    
    const queue: StreamEvent[] = [];
    let waitingResolve: (() => void) | null = null;
    let isDone = false;
    let error: Error | null = null;

    streamCallback = (event: StreamEvent) => {
      queue.push(event);
      if (waitingResolve) {
        waitingResolve();
        waitingResolve = null;
      }
    };

    const allowedTools = ToolRegistry.getBuiltinTools().filter(t => 
      ['navigate', 'click_element', 'extract_data', 'web_browse', 'fetch_page', 'web_scrape'].includes(t.name)
    );

    const systemPrompt = `You are an Autonomous Browser Agent.
You can browse the web to answer the user's request.
Use the available tools to navigate, click elements, and extract data.
Keep your final summary concise.

THINKING PROTOCOL:
- Use <nyx_think>...</nyx_think> blocks to explain your reasoning, planning, or decision-making process before responding to the user.`;

    const llmNode = async (state: typeof BrowserState.State) => {
      const history = state.messages.map((m: any) => {
        let role: 'user' | 'assistant' | 'system' | 'model' = 'user';
        if (m instanceof AIMessage) role = 'assistant';
        else if (m instanceof SystemMessage || m instanceof ToolMessage) role = 'system';
        
        let textContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (role === 'system' && textContent.length > 15000) {
          textContent = textContent.substring(0, 15000) + '\n...[Truncated for length]';
        }
        return { role, content: textContent };
      });

      let responseText = '';
      let toolCalls: any[] = [];
      
      try {
        const res = await AIService.execute(
          this.config.modelId,
          this.config.provider,
          prompt,
          this.config.apiKey,
          systemPrompt,
          this.config.settings,
          (chunk: any) => {
            if (typeof chunk === 'string') {
              responseText += chunk;
              streamCallback({ type: 'text', content: chunk });
            } else if (typeof chunk === 'object') {
              if (chunk.type === 'text') {
                responseText += chunk.content;
                streamCallback({ type: 'text', content: chunk.content });
              } else if (chunk.type === 'reasoning') {
                streamCallback({ type: 'thinking', content: chunk.content });
              }
            }
          },
          signal,
          {
            history,
            tools: allowedTools as any,
            streamEvents: true,
          }
        );

        responseText = res.text;
        toolCalls = res.toolCalls || [];

        const msg = new AIMessage({
          content: responseText,
          tool_calls: toolCalls.map(t => ({
            id: t.id,
            name: t.name,
            args: t.arguments
          }))
        });

        return { messages: [msg] };
      } catch (err: any) {
        streamCallback({ type: 'error', content: err.message });
        return { messages: [new AIMessage("Error in browser node.")] };
      }
    };

    const toolsNode = async (state: typeof BrowserState.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      
      const toolPromises = (lastMessage.tool_calls || []).map(async (tc) => {
        streamCallback({ type: 'thinking', content: `Executing browser action: ${tc.name}...` });
        try {
          const result = await executeTool({ id: tc.id || '', name: tc.name, arguments: tc.args });
          streamCallback({ type: 'tool_result', content: result as any });
          return new ToolMessage({
            tool_call_id: tc.id!,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          });
        } catch (err: any) {
          streamCallback({ type: 'error', content: `Tool ${tc.name} failed: ${err.message}` });
          return new ToolMessage({
            tool_call_id: tc.id!,
            content: `Error: ${err.message}`
          });
        }
      });

      const results = await Promise.all(toolPromises);
      return { messages: results };
    };

    const shouldContinue = (state: typeof BrowserState.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      if (lastMessage.tool_calls?.length) {
        return "tools";
      }
      return "__end__";
    };

    const workflow = new StateGraph(BrowserState)
      .addNode("llm", llmNode)
      .addNode("tools", toolsNode)
      .addEdge("__start__", "llm")
      .addConditionalEdges("llm", shouldContinue)
      .addEdge("tools", "llm");

    const app = workflow.compile();

    const initialMessages = [];
    if (this.config.history && this.config.history.length > 0) {
      initialMessages.push(...this.config.history.map(m => {
        if (m.role === 'user') return new HumanMessage(m.content);
        if (m.role === 'assistant') return new AIMessage(m.content);
        return new SystemMessage(m.content);
      }));
    }

    app.invoke({ messages: initialMessages }, { recursionLimit: 20 }).then(() => {
      isDone = true;
      if (waitingResolve) waitingResolve();
    }).catch(err => {
      error = err;
      isDone = true;
      if (waitingResolve) waitingResolve();
    });

    let abortListener: (() => void) | null = null;
    if (signal) {
      abortListener = () => {
        isDone = true;
        error = new Error("Aborted by user");
        if (waitingResolve) waitingResolve();
      };
      signal.addEventListener('abort', abortListener, { once: true });
    }

    while (!isDone || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise<void>(r => { waitingResolve = r; });
      }
    }

    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener);
    }

    if (error) {
      yield { type: 'error', content: (error as Error).message };
    }
    yield { type: 'complete' };
  }
}
