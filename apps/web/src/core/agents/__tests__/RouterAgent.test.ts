import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterAgent } from '../RouterAgent';
import { AIService } from '@src/core/services/ai.service';
import { ChatAgent } from '../chatAgent';
import { OpenCodeAgent } from '../OpenCodeAgent';
import { ClineAgent } from '../ClineAgent';
import { HermesAgent } from '../HermesAgent';
import { PromptAnalysis } from '@src/core/services/promptClassifier';

vi.mock('@src/core/services/ai.service', () => ({
  AIService: {
    execute: vi.fn(),
  },
}));

vi.mock('../chatAgent', () => ({
  ChatAgent: class {
    async *streamResponse() {
      yield { type: 'text', content: 'ChatAgent response' };
    }
  }
}));

vi.mock('../OpenCodeAgent', () => ({
  OpenCodeAgent: class {
    async *streamResponse() {
      yield { type: 'text', content: 'OpenCodeAgent response' };
    }
  }
}));

vi.mock('../ClineAgent', () => ({
  ClineAgent: class {
    async *streamResponse() {
      yield { type: 'text', content: 'ClineAgent response' };
    }
  }
}));

vi.mock('../HermesAgent', () => ({
  HermesAgent: class {
    async *streamResponse() {
      yield { type: 'text', content: 'HermesAgent response' };
    }
  }
}));

describe('RouterAgent', () => {
  const mockConfig = {
    modelId: 'test-model',
    provider: 'google',
    apiKey: 'test-key',
    settings: {} as any,
    history: [],
  };

  const mockAnalysis = {
    intent: 'general_chat',
    complexity: 'simple',
    needsSearch: false,
    needsCodeContext: false,
    reasoning: 'test',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should route to specific agent directly if agentType is set in config', async () => {
    const config = { ...mockConfig, agentType: 'opencode' };
    const agent = new RouterAgent(config);
    const generator = agent.streamResponse('test prompt', mockAnalysis, new AbortController().signal);
    
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    const targetEvent = events.find((e: any) => e.type === 'text');
    expect(targetEvent).toEqual({ type: 'text', content: 'OpenCodeAgent response' });
  });

  it('should route to ChatAgent directly if isFastIntent is true', async () => {
    const config = { ...mockConfig, isFastIntent: true };
    const agent = new RouterAgent(config);
    const generator = agent.streamResponse('hi', mockAnalysis, new AbortController().signal);
    
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    const chatEvent = events.find((e: any) => e.type === 'text');
    expect(chatEvent).toEqual({ type: 'text', content: 'ChatAgent response' });
  });

  it('should decompose prompt and route to specialized agent based on AI execution plan', async () => {
    const plan = [
      { id: 'task_1', agent: 'opencode', task: 'Do background work', dependencies: [] }
    ];
    
    (AIService.execute as any).mockResolvedValue({ text: JSON.stringify(plan) });

    const agent = new RouterAgent(mockConfig);
    const generator = agent.streamResponse('run a background task', mockAnalysis, new AbortController().signal);
    
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(AIService.execute).toHaveBeenCalled();
    
    const opencodeEvent = events.find((e: any) => e.type === 'text');
    expect(opencodeEvent).toEqual({ type: 'text', content: 'OpenCodeAgent response' });
  });

  it('should fallback to monolithic routing if AI decomposition fails (e.g. invalid json)', async () => {
    (AIService.execute as any).mockResolvedValue({ text: 'invalid json' });

    const agent = new RouterAgent(mockConfig);
    const generator = agent.streamResponse('open terminal and run ls', mockAnalysis, new AbortController().signal);
    
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    // Since prompt includes 'terminal', fallback should choose ClineAgent
    const clineEvent = events.find((e: any) => e.type === 'text');
    expect(clineEvent).toEqual({ type: 'text', content: 'ClineAgent response' });
  });
});
