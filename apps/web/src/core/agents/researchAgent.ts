import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { runAgentLoop, BUILTIN_TOOLS } from './agentLoop';
import { StreamEvent } from '@src/infrastructure/types';
import { MemoryStore } from './memoryStore';

export interface ResearchAgentConfig extends BaseAgentConfig {
  maxDepth?: number;
}

const RESEARCH_SYSTEM_PROMPT = `You are NYX Deep Research, an advanced autonomous research agent.
Your goal is to comprehensively research the user's query, synthesize information from multiple sources, and present a detailed, well-structured, and highly accurate final report.

Core Directives:
1. EXPLORE: Use the 'web_search' tool aggressively to find information. Do not rely on your internal knowledge for recent or factual claims.
2. VERIFY: Cross-reference facts across multiple sources. If sources conflict, note the discrepancy.
3. SYNTHESIZE: Do not just paste snippets. Digest the information and structure it logically with headings, bullet points, and clear conclusions.
4. ITERATE: If your initial search doesn't yield enough depth, refine your query and search again. You can use tools as many times as necessary.
5. CITE: Always cite your sources with URLs in the final report.

Workflow:
- Start by analyzing the query and forming a research plan.
- Execute web searches to gather preliminary context.
- Drill down into specific areas that need more depth.
- Once you have sufficient, corroborated information, synthesize it into the final markdown report.
- Only return your final report once the research is absolutely complete.
`;

export class ResearchAgent extends BaseAgent<ResearchAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    signal: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    
    let processedHistory = [...this.config.history];
    const memoryPrompt = await MemoryStore.getMemoryPrompt();
    
    let finalSystemPrompt = RESEARCH_SYSTEM_PROMPT;
    if (memoryPrompt) {
      finalSystemPrompt += `\n\nUser Context:\n${memoryPrompt}`;
    }

    processedHistory.unshift({
      role: 'system',
      content: finalSystemPrompt,
      timestamp: Date.now()
    });

    yield* runAgentLoop(prompt, {
      modelId: this.config.modelId,
      provider: this.config.provider,
      apiKey: this.config.apiKey || '',
      settings: this.config.settings,
      history: processedHistory,
      tools: this.config.tools || BUILTIN_TOOLS,
      signal,
      maxIterations: this.config.maxDepth || 15,
    }) as unknown as AsyncGenerator<StreamEvent>;
  }
}
