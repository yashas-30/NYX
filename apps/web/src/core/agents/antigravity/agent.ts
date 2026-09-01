/**
 * @file src/core/agents/antigravity/agent.ts
 * @description Layer 1 Simplified: High-level batteries-included Agent class.
 */

import { LocalAgentConfig, AntigravityContent } from './types';
import { Conversation, ChatResponse } from './conversation';
import { LocalConnectionStrategy } from './connections';

export class Agent {
  private conversationPromise: Promise<Conversation>;

  constructor(private config: LocalAgentConfig = {}) {
    const strategy = new LocalConnectionStrategy(config);
    this.conversationPromise = Conversation.create(strategy, config);
  }

  public async chat(
    prompt: string | AntigravityContent | Array<string | AntigravityContent>
  ): Promise<ChatResponse> {
    const conversation = await this.conversationPromise;
    return await conversation.chat(prompt);
  }

  public async close(): Promise<void> {
    const conversation = await this.conversationPromise;
    await conversation.close();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
