import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { BUILTIN_TOOLS } from './executeTool';
import { buildChatPrompts, ChatContext } from '../prompts/chatPrompts';
import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { AIService } from '@src/core/services/ai.service';
import { executeTool } from './executeTool';

export interface ChatAgentConfig extends BaseAgentConfig {
  enableToolLoop?: boolean;
}

const ChatState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: messagesStateReducer,
    default: () => [],
  })
});

// Cache compiled StateGraph apps by model+provider to avoid re-compilation per message
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MAX_HISTORY_MESSAGES = 40; // prune oldest messages beyond this to cap memory


export class ChatAgent extends BaseAgent<ChatAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    
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

    const searchContext = searchContextPromise ? await searchContextPromise : undefined;

    const allowedTools = BUILTIN_TOOLS.filter(t => 
      ['web_search', 'read_file'].includes(t.name)
    );

    const context: ChatContext = {
      conversationTone: 'professional',
      detectedLanguage: 'English',
      previousMessages: 0,
      lightningDirectives: this.config.lightningDirectives,
      availableTools: allowedTools,
      enableReasoning: true,
      enableCitations: true
    };

    const { systemPrompt } = await buildChatPrompts(
      this.config.modelId,
      context,
      prompt,
      [],
      searchContext
    );

    const finalSystemPrompt = systemPrompt + (this.config.systemPromptAddon ? `\n\nADDITIONAL INSTRUCTIONS:\n${this.config.systemPromptAddon}` : '');

    const llmNode = async (state: typeof ChatState.State) => {
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
          finalSystemPrompt,
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
        return { messages: [new AIMessage("Error in chat node.")] };
      }
    };

    const toolsNode = async (state: typeof ChatState.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      
      const toolPromises = (lastMessage.tool_calls || []).map(async (tc) => {
        streamCallback({ type: 'thinking', content: `Executing tool ${tc.name}...` });
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

    const shouldContinue = (state: typeof ChatState.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      if (lastMessage.tool_calls?.length) {
        return "tools";
      }
      return "__end__";
    };

    const workflow = new StateGraph(ChatState)
      .addNode("llm", llmNode)
      .addNode("tools", toolsNode)
      .addEdge("__start__", "llm")
      .addConditionalEdges("llm", shouldContinue)
      .addEdge("tools", "llm");

    // Compile fresh each call — nodes close over prompt & streamCallback so
    // caching the compiled app would reuse stale closures from previous calls.
    const app = workflow.compile();

    // Build initial messages and prune to avoid memory bloat in the state reducer
    const rawHistory = (this.config.history || []).map(m => {
      if (m.role === 'user') return new HumanMessage(m.content);
      if (m.role === 'assistant') return new AIMessage(m.content);
      return new SystemMessage(m.content);
    });
    // Keep only the most recent MAX_HISTORY_MESSAGES to avoid reducer memory explosion
    const initialMessages = rawHistory.slice(-MAX_HISTORY_MESSAGES);

    let abortListener: (() => void) | null = null;
    if (signal) {
      abortListener = () => {
        isDone = true;
        error = new Error("Aborted by user");
        if (waitingResolve) waitingResolve();
      };
      signal.addEventListener('abort', abortListener, { once: true });
    }

    app.invoke({ messages: initialMessages }, { recursionLimit: 10 }).then(() => {
      isDone = true;
      if (waitingResolve) waitingResolve();
    }).catch((err: Error) => {
      error = err;
      isDone = true;
      if (waitingResolve) waitingResolve();
    });

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
