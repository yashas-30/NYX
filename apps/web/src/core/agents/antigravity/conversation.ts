/**
 * @file src/core/agents/antigravity/conversation.ts
 * @description Layer 2 Session: Stateful Conversation, ChatResponse stream wrappers, and ToolRunner.
 */

import { Connection, ConnectionStrategy, LocalConnectionStrategy } from './connections';
import {
  LocalAgentConfig,
  Step,
  ToolCall,
  ToolResult,
  AntigravityContent,
  Image,
  Document,
} from './types';
import { HookRunner, enforce } from './policies';
import { TriggerRunner } from './triggers';
import { toolExecutor } from '@src/infrastructure/services/toolSystem';
import { WorkspaceIntelligence } from '@src/infrastructure/services/workspaceIntelligence';
import { antigravityAgent } from '../antigravityAgent';

export class ToolRunner {
  private hookRunner: HookRunner;
  private customTools: Map<string, Function> = new Map();

  constructor(private config?: LocalAgentConfig) {
    this.hookRunner = enforce(config?.policies || [], config?.capabilities);
    if (config?.tools) {
      for (const t of config.tools) {
        if (typeof t === 'function' && t.name) {
          this.customTools.set(t.name, t);
        }
      }
    }
  }

  public async execute(call: ToolCall): Promise<ToolResult> {
    const isAllowed = await this.hookRunner.evaluateToolCall(call.name, call.arguments);
    if (!isAllowed) {
      return {
        call_id: call.id,
        name: call.name,
        result: `Execution of tool '${call.name}' was denied by agent security policy.`,
        is_error: true,
      };
    }

    try {
      if (this.customTools.has(call.name)) {
        const fn = this.customTools.get(call.name)!;
        const res = await fn(call.arguments);
        return {
          call_id: call.id,
          name: call.name,
          result: res,
          is_error: false,
        };
      }

      const res = await toolExecutor.executeSingle({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        rawArguments: JSON.stringify(call.arguments),
      });

      return {
        call_id: call.id,
        name: call.name,
        result: res.content,
        is_error: res.status === 'error',
      };
    } catch (err: any) {
      return {
        call_id: call.id,
        name: call.name,
        result: `Tool error: ${err?.message || err}`,
        is_error: true,
      };
    }
  }
}

export class ChatResponse {
  private tokenQueue: string[] = [];
  private thoughtQueue: string[] = [];
  private toolCallQueue: ToolCall[] = [];
  private tokenResolvers: Array<() => void> = [];
  private thoughtResolvers: Array<() => void> = [];
  private toolCallResolvers: Array<() => void> = [];
  private isDone: boolean = false;
  private fullTextPromise: Promise<string>;
  private resolveFullText!: (text: string) => void;
  private accumulatedText: string = '';
  private accumulatedThought: string = '';

  constructor() {
    this.fullTextPromise = new Promise<string>((resolve) => {
      this.resolveFullText = resolve;
    });
  }

  public pushToken(token: string): void {
    this.accumulatedText += token;
    this.tokenQueue.push(token);
    const resolver = this.tokenResolvers.shift();
    if (resolver) resolver();
  }

  public pushThought(thought: string): void {
    this.accumulatedThought += thought;
    this.thoughtQueue.push(thought);
    const resolver = this.thoughtResolvers.shift();
    if (resolver) resolver();
  }

  public pushToolCall(call: ToolCall): void {
    this.toolCallQueue.push(call);
    const resolver = this.toolCallResolvers.shift();
    if (resolver) resolver();
  }

  public finish(): void {
    this.isDone = true;
    this.resolveFullText(this.accumulatedText);
    while (this.tokenResolvers.length > 0) this.tokenResolvers.shift()!();
    while (this.thoughtResolvers.length > 0) this.thoughtResolvers.shift()!();
    while (this.toolCallResolvers.length > 0) this.toolCallResolvers.shift()!();
  }

  public async text(): Promise<string> {
    return this.fullTextPromise;
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<string> {
    while (!this.isDone || this.tokenQueue.length > 0) {
      if (this.tokenQueue.length > 0) {
        yield this.tokenQueue.shift()!;
      } else {
        await new Promise<void>((resolve) => {
          this.tokenResolvers.push(resolve);
        });
      }
    }
  }

  public get thoughts(): AsyncIterable<string> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        while (!self.isDone || self.thoughtQueue.length > 0) {
          if (self.thoughtQueue.length > 0) {
            yield self.thoughtQueue.shift()!;
          } else {
            await new Promise<void>((resolve) => {
              self.thoughtResolvers.push(resolve);
            });
          }
        }
      },
    };
  }

  public get tool_calls(): AsyncIterable<ToolCall> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        while (!self.isDone || self.toolCallQueue.length > 0) {
          if (self.toolCallQueue.length > 0) {
            yield self.toolCallQueue.shift()!;
          } else {
            await new Promise<void>((resolve) => {
              self.toolCallResolvers.push(resolve);
            });
          }
        }
      },
    };
  }
}

/**
 * @deprecated The internal ReAct loop in this class duplicates `antigravityAgent.runAgentLoop()`.
 * No external code imports `Conversation` from this file — prefer `antigravityAgent` directly.
 * This class is retained for backward-compatibility only and will be removed in a future cleanup pass.
 */
export class Conversation {
  private rawMessages: Array<{ role: string; content: any }> = [];
  public history: Step[] = [];
  public turn_count: number = 0;
  public last_response?: ChatResponse;
  private connection: Connection;
  private toolRunner: ToolRunner;
  private triggerRunner?: TriggerRunner;

  private constructor(
    private strategy: ConnectionStrategy,
    private config?: LocalAgentConfig,
    connection?: Connection
  ) {
    this.connection = connection || (null as any);
    this.toolRunner = new ToolRunner(config);
    if (config?.triggers && config.triggers.length > 0) {
      this.triggerRunner = new TriggerRunner(config.triggers, () => this);
      this.triggerRunner.start();
    }
  }

  public static async create(
    strategy?: ConnectionStrategy,
    config?: LocalAgentConfig
  ): Promise<Conversation> {
    const activeStrategy = strategy || new LocalConnectionStrategy(config);
    const conn = await activeStrategy.createConnection(config);
    const conv = new Conversation(activeStrategy, config, conn);
    return conv;
  }

  public async chat(
    prompt: string | AntigravityContent | Array<string | AntigravityContent>
  ): Promise<ChatResponse> {
    this.turn_count++;
    const response = new ChatResponse();
    this.last_response = response;

    // 1. Format Multimodal / Text input
    const formattedContent = this.formatInput(prompt);
    this.rawMessages.push({ role: 'user', content: formattedContent });

    // 2. Delegate execution to unified antigravityAgent.runAgentLoop (single source of truth)
    (async () => {
      try {
        const textPrompt =
          typeof prompt === 'string'
            ? prompt
            : Array.isArray(prompt)
              ? prompt.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n')
              : JSON.stringify(prompt);

        const res = await antigravityAgent.runAgentLoop({
          model: this.config?.model,
          prompt: textPrompt,
          history: this.rawMessages,
          maxIterations: this.config?.max_iterations || 8,
          onDelta: (delta) => response.pushToken(delta),
          onReasoning: (reasoning) => response.pushThought(reasoning),
          onStep: (agStep) => {
            this.history.push({
              id: `step_${Date.now()}_${agStep.iteration}`,
              iteration: agStep.iteration,
              content: agStep.thought || '',
              thought: agStep.thought,
              tool_calls: agStep.tool_name
                ? [
                    {
                      id: `call_${Date.now()}`,
                      name: agStep.tool_name,
                      arguments: agStep.tool_args,
                    },
                  ]
                : [],
              tool_results: agStep.tool_result
                ? [
                    {
                      call_id: `res_${Date.now()}`,
                      name: agStep.tool_name || 'tool',
                      result: agStep.tool_result,
                    },
                  ]
                : [],
              is_complete_response: !!agStep.is_finished,
              is_error: !!agStep.is_error,
            });
          },
        });

        if (res.outputText) {
          response.pushToken(res.outputText);
        }
        response.finish();
      } catch (err: any) {
        response.pushToken(`\n[Agent Error]: ${err?.message || String(err)}`);
        response.finish();
      }
    })();

    return response;
  }

  public async send(
    message: string | AntigravityContent | Array<string | AntigravityContent>
  ): Promise<void> {
    await this.chat(message);
  }

  public async *receive_steps(): AsyncIterable<Step> {
    let lastIndex = 0;
    while (!this.last_response || !(await this.last_response.text())) {
      while (lastIndex < this.history.length) {
        yield this.history[lastIndex++];
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    while (lastIndex < this.history.length) {
      yield this.history[lastIndex++];
    }
  }

  private formatInput(
    input: string | AntigravityContent | Array<string | AntigravityContent>
  ): any {
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      const parts: any[] = [];
      for (const item of input) {
        if (typeof item === 'string') {
          parts.push({ type: 'text', text: item });
        } else if (item instanceof Image) {
          parts.push({
            type: 'image_url',
            image_url: { url: typeof item.data === 'string' ? item.data : '' },
          });
        } else if (item instanceof Document) {
          parts.push({
            type: 'text',
            text: `[Document: ${item.title || 'Attachment'}]\n${typeof item.data === 'string' ? item.data : ''}`,
          });
        }
      }
      return parts;
    }
    return String(input);
  }

  public async close(): Promise<void> {
    if (this.triggerRunner) {
      this.triggerRunner.stop();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}
