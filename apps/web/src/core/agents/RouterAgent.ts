import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { ChatAgent } from './chatAgent';
import { OpenCodeAgent } from './OpenCodeAgent';
import { ClineAgent } from './ClineAgent';
import { BrowserAgent } from './BrowserAgent';
import { AIService } from '@src/core/services/ai.service';

export interface RouterAgentConfig extends BaseAgentConfig {
  enableToolLoop?: boolean;
  agentType?: string; // e.g. explicitly passed 'coder', 'chat', or 'cline'
}

interface ExecutionTask {
  id: string;
  agent: 'opencode' | 'cline' | 'chat' | 'browser';
  task: string;
  dependencies?: string[];
}

export class RouterAgent extends BaseAgent<RouterAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    // If a specific agent type was requested bypassing routing, use it directly
    if (this.config.agentType && this.config.agentType !== 'chat') {
      yield* this.routeToSingleAgent(this.config.agentType, prompt, analysis, signal, searchContextPromise, images);
      return;
    }

    if (this.config.isFastIntent) {
      yield* this.emitThinking(`Router Coordinator: Fast intent detected. Routing directly to fast local Chat agent...`, []);
      // Use the user's selected model, not a hardcoded Ollama model that may be offline
      const chatAgent = new ChatAgent({ ...this.config });
      try {
        const generator = chatAgent.streamResponse(prompt, analysis, signal, searchContextPromise, images);
        for await (const event of generator) {
          yield event;
        }
      } catch (e: any) {
        // Fast path failed — yield error and stop, do NOT fall through to supervisor
        yield { type: 'error', content: `Fast chat agent failed: ${e?.message || e}` };
      }
      return;
    }

    yield* this.emitThinking(`Supervisor: Analyzing request to determine best specialized agent...`, []);

    try {
      const sysMsg = "You are a routing supervisor. Based on the user's request, decide which agent to use. Output ONLY valid JSON with a single key 'next'. If the user asks for web search or browsing: { \"next\": \"BrowserAgent\" }. If the user asks to execute or write code: { \"next\": \"CodeAgent\" }. For ALL other requests (questions, greetings, explanations, general chat): { \"next\": \"ChatAgent\" }.";

      const res = await AIService.execute(
        this.config.modelId || 'gpt-4o',
        this.config.provider || 'openai',
        prompt,
        this.config.apiKey,
        sysMsg,
        this.config.settings,
        undefined,
        signal,
        { responseFormat: { type: 'json_object' } as any }
      );

      let nextAgent = 'chat';
      try {
        const text = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        if (parsed.next === 'BrowserAgent') nextAgent = 'browser';
        else if (parsed.next === 'CodeAgent') nextAgent = 'opencode';
      } catch (e) {
        // fallback to chat
      }

      yield* this.emitThinking(`Supervisor routing completed. Selected specialized agent: ${nextAgent}`, []);
      
      yield* this.routeToSingleAgent(nextAgent, prompt, analysis, signal, searchContextPromise, images);

    } catch (e) {
      console.warn("LangGraph supervisor execution failed. Falling back to single execution.", e);
      yield* this.emitThinking(`Supervisor routing failed. Fallback to Chat Agent...`, []);
      yield* this.routeToSingleAgent('chat', prompt, analysis, signal, searchContextPromise, images);
    }
  }

  private async *routeToSingleAgent(
    targetAgentType: string,
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    let specializedAgent;
    if (targetAgentType === 'opencode') {
      specializedAgent = new OpenCodeAgent(this.config);
    } else if (targetAgentType === 'cline') {
      specializedAgent = new ClineAgent(this.config);
    } else if (targetAgentType === 'browser') {
      specializedAgent = new BrowserAgent(this.config);
    } else {
      specializedAgent = new ChatAgent(this.config);
    }

    const generator = specializedAgent.streamResponse(prompt, analysis, signal, searchContextPromise, images);
    for await (const event of generator) {
      yield event;
    }
  }
}
