import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLangGraphAgent, BUILTIN_TOOLS } from '../executeTool';
import { AIService } from '@src/core/services/ai.service';
import { MemoryStore } from '../memoryStore';

vi.mock('@src/core/services/ai.service', () => ({
  AIService: {
    execute: vi.fn(),
  },
}));

vi.mock('../memoryStore', () => ({
  MemoryStore: {
    query: vi.fn(),
  },
}));

vi.mock('@src/infrastructure/services/trajectoryLogger', () => ({
  TrajectoryLogger: {
    getInstance: vi.fn().mockReturnValue({
      logAgentStart: vi.fn(),
      logAgentEnd: vi.fn(),
      logThinking: vi.fn(),
      logToolExecution: vi.fn(),
      logToolResult: vi.fn(),
      logText: vi.fn(),
      logError: vi.fn(),
      logInteraction: vi.fn().mockResolvedValue(undefined),
    })
  },
}));

vi.mock('@src/infrastructure/api/searchApi', () => ({
  searchWeb: vi.fn().mockResolvedValue({
    success: true,
    results: [{ title: 'Test', link: 'http://test.com', snippet: 'A test result' }]
  }),
}));

describe('runLangGraphAgent', () => {
  const mockConfig = {
    modelId: 'test-model',
    provider: 'google',
    apiKey: 'test-key',
    tools: BUILTIN_TOOLS,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run a basic agent loop yielding text', async () => {
    (AIService.execute as any).mockImplementation(
      async (model: string, provider: string, prompt: string, key: string, sys: string, settings: any, onStream: any) => {
        if (onStream) {
          onStream({ type: 'text', content: 'Hello world', final: false });
        }
        return {
          text: 'Hello world',
          stopReason: 'stop',
          toolCalls: []
        };
      }
    );

    const generator = runLangGraphAgent('test prompt', mockConfig);
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(AIService.execute).toHaveBeenCalledTimes(1);
    const textEvent = events.find(e => e.type === 'text');
    expect(textEvent).toEqual({ type: 'text', content: 'Hello world' });
  });

  it('should run a tool if LLM requests one and yield tool events', async () => {
    let callCount = 0;
    (AIService.execute as any).mockImplementation(
      async (model: string, provider: string, prompt: string, key: string, sys: string, settings: any, onStream: any) => {
        callCount++;
        if (callCount === 1) {
          if (onStream) {
            onStream({ type: 'text', content: 'I will search for this', final: false });
            onStream({ type: 'tool_calls', content: [{ id: 'call_1', name: 'web_search', arguments: { query: 'test query' } }], final: false });
          }
          return {
            text: 'I will search for this',
            stopReason: 'tool_calls',
            toolCalls: [{ id: 'call_1', name: 'web_search', arguments: { query: 'test query' } }]
          };
        } else {
          if (onStream) {
            onStream({ type: 'text', content: 'Search done', final: false });
          }
          return {
            text: 'Search done',
            stopReason: 'stop',
            toolCalls: []
          };
        }
      }
    );

    const generator = runLangGraphAgent('search for test', mockConfig);
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(callCount).toBe(2);

    const toolStart = events.find(e => e.type === 'tool_start');
    expect(toolStart).toBeDefined();
    expect((toolStart as any).toolCall.name).toBe('web_search');

    const toolDone = events.find(e => e.type === 'tool_done');
    expect(toolDone).toBeDefined();
    expect((toolDone as any).name).toBe('web_search');

    const finalText = events.filter(e => e.type === 'text').pop();
    expect(finalText).toEqual({ type: 'text', content: 'Search done' });
  });
});
