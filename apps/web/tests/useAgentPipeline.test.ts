import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentPipeline } from '../src/features/coder/hooks/useAgentPipeline';

// Mock child pipeline hooks to isolate the main useAgentPipeline hook
vi.mock('../src/features/coder/hooks/pipeline/useBackgroundTasks', () => ({
  useBackgroundTasks: vi.fn(() => ({
    triggerBackgroundCritic: vi.fn(),
    commitToMemory: vi.fn(),
  })),
}));

vi.mock('../src/features/coder/hooks/pipeline/usePromptAnalysis', () => ({
  usePromptAnalysis: vi.fn(() => ({
    agentMode: 'coder',
    setAgentMode: vi.fn(),
    agentReasoning: 'reasoning text',
    setAgentReasoning: vi.fn(),
    analyzeAndRoute: vi.fn(() => ({
      analysis: { complexity: 'low' },
      route: 'direct',
    })),
  })),
}));

vi.mock('../src/features/coder/hooks/pipeline/useStreamProcessor', () => ({
  useStreamProcessor: vi.fn(() => ({
    processStream: vi.fn(() => Promise.resolve('simulated generated response')),
  })),
}));

vi.mock('../src/features/coder/hooks/pipeline/useMetricsTracker', () => ({
  useMetricsTracker: vi.fn(() => ({
    processChunkMetrics: vi.fn(),
    getFinalMetrics: vi.fn(() => ({ latency: 100, tokens: 50, tps: 0.5 })),
    clearMetrics: vi.fn(),
  })),
}));

vi.mock('../src/infrastructure/utils/provider', () => ({
  detectProvider: vi.fn(() => 'gemini'),
  getEffectiveApiKey: vi.fn(() => 'test-api-key'),
}));

vi.mock('../src/infrastructure/api/authFetch', () => ({
  fetchWithAuth: vi.fn(() =>
    Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    })
  ),
}));

describe('useAgentPipeline hook', () => {
  const defaultProps = {
    models: { nyx: 'gemini/gemini-1.5-pro' },
    apiKeys: { gemini: 'test-api-key' },
    agentPersonas: { nyx: { name: 'Nyx', instruction: 'be a coder' } },
    modelSettings: {},
    trackUsage: vi.fn(),
    history: [],
    updateHistory: vi.fn(),
    updateMetrics: vi.fn(),
    getSuggestions: vi.fn(),
    setSuggestedPrompts: vi.fn(),
    webSearchEnabled: false,
    codebaseKnowledgeEnabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useAgentPipeline(defaultProps as any));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.subagentTasks).toEqual([]);
    expect(result.current.pendingToolConfirm).toBeNull();
  });

  it('should toggle loading state during execution flow', async () => {
    const { result } = renderHook(() => useAgentPipeline(defaultProps as any));
    
    let runPromise;
    act(() => {
      runPromise = result.current.runCoder('Hello Nyx, write a script');
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await runPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should abort agent run when stopCoder is triggered', async () => {
    const { result } = renderHook(() => useAgentPipeline(defaultProps as any));
    
    let runPromise: Promise<void> | undefined;
    act(() => {
      runPromise = result.current.runCoder('Perform long task');
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.stopCoder();
    });

    expect(result.current.isLoading).toBe(false);

    if (runPromise) {
      await act(async () => {
        await runPromise;
      });
    }
  });
});
