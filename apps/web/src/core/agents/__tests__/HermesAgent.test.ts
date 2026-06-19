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

  it('should call runAgentLoop when NOT in Tauri environment', async () => {
    (runAgentLoop as any).mockImplementation(mockStreamResponse);
    
    // Ensure __TAURI__ is not defined
    if (global.window) {
      delete (global.window as any).__TAURI__;
    }

    const agent = new HermesAgent(mockConfig);
    const generator = agent.streamResponse('test prompt', mockAnalysis as any, new AbortController().signal);

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(runAgentLoop).toHaveBeenCalled();
    expect(runTauriAgentLoop).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'text', content: 'test response' }]);
  });

  it('should call runTauriAgentLoop when in Tauri environment', async () => {
    (runTauriAgentLoop as any).mockImplementation(mockStreamResponse);
    
    // Simulate Tauri environment
    if (typeof window === 'undefined') {
      (global as any).window = {};
    }
    (global.window as any).__TAURI__ = {};

    const agent = new HermesAgent(mockConfig);
    const generator = agent.streamResponse('test prompt', mockAnalysis as any, new AbortController().signal);

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(runTauriAgentLoop).toHaveBeenCalled();
    expect(runAgentLoop).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'text', content: 'test response' }]);
  });
});
