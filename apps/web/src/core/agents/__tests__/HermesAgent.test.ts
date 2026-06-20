import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HermesAgent } from '../HermesAgent';
import { runAgentLoop, runTauriAgentLoop } from '../agentLoop';

vi.mock('../agentLoop', () => ({
  runAgentLoop: vi.fn(),
  runTauriAgentLoop: vi.fn(),
  BUILTIN_TOOLS: [],
  HERMES_TOOLS: []
}));

describe('HermesAgent', () => {
  const mockConfig = {
    modelId: 'test-model',
    provider: 'google',
    apiKey: 'test-key',
    settings: {} as any,
    history: [],
  };

  const mockAnalysis = {
    intent: 'general_chat',
    domain: 'general',
    complexity: 'low',
    needsSearch: false,
    needsCodeContext: false,
    reasoning: 'test',
  };

  const mockStreamResponse = async function* () {
    yield { type: 'text', content: 'test response' };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (global.window) {
      delete (global.window as any).__TAURI__;
    }
  });

  it('should call streamFromPythonAPI', async () => {
    const streamSpy = vi.spyOn((HermesAgent as any).prototype, 'streamFromPythonAPI')
      .mockImplementation(mockStreamResponse);
    
    const agent = new HermesAgent(mockConfig);
    const generator = agent.streamResponse('test prompt', mockAnalysis as any, new AbortController().signal);

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(streamSpy).toHaveBeenCalled();
    expect(events).toEqual([{ type: 'text', content: 'test response' }]);
  });
});
