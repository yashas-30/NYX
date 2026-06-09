import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fastify from 'fastify';
import { AssistantService } from '../assistant.service.js';
import { LocalAdapter } from '../adapters/local.adapter.js';
import { DialogflowAdapter } from '../adapters/dialogflow.adapter.js';
import { RasaAdapter } from '../adapters/rasa.adapter.js';
import { BotFrameworkAdapter } from '../adapters/botframework.adapter.js';
import { assistantRouter } from '../assistant.router.js';

// Mock system services
const mockHealth = vi.fn();
const mockMetrics = vi.fn();
const mockListModels = vi.fn();
const mockRunModel = vi.fn();
const mockGetStats = vi.fn();
const mockClearCache = vi.fn();
const mockGetWorkspace = vi.fn();
const mockSetWorkspace = vi.fn();

vi.mock('../../system/system.service.js', () => {
  return {
    SystemService: class {
      getHealth = mockHealth;
      getMetrics = mockMetrics;
    },
  };
});

vi.mock('../../local-models/localModels.service.js', () => {
  return {
    LocalModelsService: class {
      listModels = mockListModels;
      runModel = mockRunModel;
    },
  };
});

vi.mock('../../cache/cache.service.js', () => {
  return {
    CacheService: class {
      getStats = mockGetStats;
      clear = mockClearCache;
    },
  };
});

vi.mock('../../workspace/workspace.service.js', () => {
  return {
    WorkspaceService: class {
      getWorkspace = mockGetWorkspace;
      setWorkspace = mockSetWorkspace;
    },
  };
});

vi.mock('../../../config/env.js', () => {
  return {
    env: {
      get DIALOGFLOW_PROJECT_ID() {
        return process.env.DIALOGFLOW_PROJECT_ID;
      },
      get DIALOGFLOW_ACCESS_TOKEN() {
        return process.env.DIALOGFLOW_ACCESS_TOKEN;
      },
      get RASA_URL() {
        return process.env.RASA_URL;
      },
    },
  };
});

describe('NLU Adapters', () => {
  describe('LocalAdapter', () => {
    const adapter = new LocalAdapter();

    it('classifies system.health correctly', async () => {
      const res = await adapter.parse('Check system health status', 'session1');
      expect(res.intent).toBe('system.health');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies system.metrics correctly', async () => {
      const res = await adapter.parse('What is the memory usage and cpu metrics?', 'session1');
      expect(res.intent).toBe('system.metrics');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies model.list correctly', async () => {
      const res = await adapter.parse('list available models', 'session1');
      expect(res.intent).toBe('model.list');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies model.status correctly', async () => {
      const res = await adapter.parse('check active model status', 'session1');
      expect(res.intent).toBe('model.status');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies model.switch correctly with entities', async () => {
      const res = await adapter.parse('switch active model to gemma-4-31b-it', 'session1');
      expect(res.intent).toBe('model.switch');
      expect(res.entities.modelId).toBe('gemma-4-31b-it');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies cache.stats correctly', async () => {
      const res = await adapter.parse('get cache hit rate stats', 'session1');
      expect(res.intent).toBe('cache.stats');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies cache.clear correctly', async () => {
      const res = await adapter.parse('empty cache files', 'session1');
      expect(res.intent).toBe('cache.clear');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies workspace.info correctly', async () => {
      const res = await adapter.parse('current workspace path info', 'session1');
      expect(res.intent).toBe('workspace.info');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('classifies workspace.change correctly with path entity', async () => {
      const res = await adapter.parse('switch workspace to C:\\Users\\Dev\\Project', 'session1');
      expect(res.intent).toBe('workspace.change');
      expect(res.entities.path).toBe('C:\\Users\\Dev\\Project');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('returns input.unknown for unhandled queries', async () => {
      const res = await adapter.parse('who are you?', 'session1');
      expect(res.intent).toBe('input.unknown');
    });
  });

  describe('DialogflowAdapter', () => {
    const adapter = new DialogflowAdapter();

    afterEach(() => {
      delete process.env.DIALOGFLOW_PROJECT_ID;
      delete process.env.DIALOGFLOW_ACCESS_TOKEN;
      vi.restoreAllMocks();
    });

    it('falls back to local adapter in mock mode if DIALOGFLOW_PROJECT_ID is not configured', async () => {
      const res = await adapter.parse('Check system health', 'session1');
      expect(res.intent).toBe('system.health');
      expect(res.fulfillmentText).toContain('[Dialogflow Mock]');
    });

    it('queries Google Dialogflow API and returns intent classification when credentials are present', async () => {
      process.env.DIALOGFLOW_PROJECT_ID = 'test-project';
      process.env.DIALOGFLOW_ACCESS_TOKEN = 'test-token';

      const mockResponse = {
        queryResult: {
          intent: { displayName: 'system.health' },
          intentDetectionConfidence: 0.92,
          parameters: { someParam: 'value' },
          fulfillmentText: 'System health looks good!',
        },
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as any)
      );

      const res = await adapter.parse('Check health status', 'session1');
      expect(fetchSpy).toHaveBeenCalled();
      expect(res.intent).toBe('system.health');
      expect(res.confidence).toBe(0.92);
      expect(res.entities).toEqual({ someParam: 'value' });
      expect(res.fulfillmentText).toBe('System health looks good!');
    });

    it('falls back to local NLU if fetch request fails', async () => {
      process.env.DIALOGFLOW_PROJECT_ID = 'test-project';
      process.env.DIALOGFLOW_ACCESS_TOKEN = 'test-token';

      vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: false,
          statusText: 'Internal Error',
        } as any)
      );

      const res = await adapter.parse('Check health status', 'session1');
      expect(res.intent).toBe('system.health');
      expect(res.fulfillmentText).toContain('[Dialogflow Fallback]');
    });
  });

  describe('RasaAdapter', () => {
    const adapter = new RasaAdapter();

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('queries Rasa model parse endpoint and returns classification result', async () => {
      const mockResponse = {
        intent: { name: 'cache.stats', confidence: 0.85 },
        entities: [{ entity: 'modelId', value: 'gemma' }],
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as any)
      );

      const res = await adapter.parse('what are cache stats?', 'session1');
      expect(fetchSpy).toHaveBeenCalled();
      expect(res.intent).toBe('cache.stats');
      expect(res.confidence).toBe(0.85);
      expect(res.entities).toEqual({ modelId: 'gemma' });
    });

    it('falls back to local NLU in mock mode if Rasa server is offline', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.reject(new Error('Connection refused'))
      );

      const res = await adapter.parse('check health status', 'session1');
      expect(res.intent).toBe('system.health');
      expect(res.fulfillmentText).toContain('[Rasa Mock]');
    });
  });

  describe('BotFrameworkAdapter', () => {
    const adapter = new BotFrameworkAdapter();

    it('falls back to local adapter if input is not a JSON Bot Framework Activity schema', async () => {
      const res = await adapter.parse('Check system health', 'session1');
      expect(res.intent).toBe('system.health');
      expect(res.fulfillmentText).toContain('[BotFramework Mock]');
    });

    it('extracts intent and entities directly from Bot Framework Activity schema custom properties', async () => {
      const activityPayload = {
        type: 'message',
        id: '12345',
        channelId: 'emulator',
        text: 'run model llama-3-8b',
        entities: [
          { type: 'intent', name: 'model.switch', confidence: 0.98 },
          { type: 'entity', entity: 'modelId', value: 'llama-3-8b' },
        ],
      };

      const res = await adapter.parse(JSON.stringify(activityPayload), 'session1');
      expect(res.intent).toBe('model.switch');
      expect(res.confidence).toBe(0.98);
      expect(res.entities).toEqual({ modelId: 'llama-3-8b' });
      expect(res.fulfillmentText).toContain('[BotFramework Activity]');
    });

    it('uses local fallback parser on Bot Framework Activity utterance if intent is not explicit', async () => {
      const activityPayload = {
        type: 'message',
        id: '12345',
        channelId: 'emulator',
        text: 'switch model to my-model-id',
        entities: [],
      };

      const res = await adapter.parse(JSON.stringify(activityPayload), 'session1');
      expect(res.intent).toBe('model.switch');
      expect(res.entities.modelId).toBe('my-model-id');
    });
  });
});

describe('AssistantService & Intent Execution', () => {
  let service: AssistantService;

  beforeEach(() => {
    service = new AssistantService();
    AssistantService.setActiveEngine('local');
    vi.clearAllMocks();
  });

  it('runs system.health action immediately', async () => {
    mockHealth.mockResolvedValue({
      overall: 'ok',
      checks: {
        dependencies: {
          llamaServer: 'ok',
          database: 'ok',
          docker: 'ok',
          disk: 'ok',
        },
      },
    });

    const res = await service.processMessage('Check system health status', 'session1');
    expect(mockHealth).toHaveBeenCalled();
    expect(res.intent).toBe('system.health');
    expect(res.response).toContain('status is currently: OK');
    expect(res.response).toContain('llamaServer: ok');
  });

  it('runs system.metrics action immediately', async () => {
    mockMetrics.mockReturnValue({
      uptime: 120,
      memory: { heapUsed: 104857600 },
      cacheStats: { hits: 10, misses: 5 },
      hitRate: 0.66,
    });

    const res = await service.processMessage('memory stats and system metrics', 'session1');
    expect(mockMetrics).toHaveBeenCalled();
    expect(res.intent).toBe('system.metrics');
    expect(res.response).toContain('Uptime: 120 seconds');
    expect(res.response).toContain('Memory Heap Used: 100 MB');
    expect(res.response).toContain('Cache Hit Rate: 66.0%');
  });

  it('runs model.list action immediately', async () => {
    const res = await service.processMessage('list available models', 'session1');
    expect(res.intent).toBe('model.list');
    expect(res.response).toContain('delegated to Ollama and LM Studio');
  });

  it('runs model.status action immediately', async () => {
    const res = await service.processMessage('check active model status', 'session1');
    expect(res.intent).toBe('model.status');
    expect(res.response).toContain('Check your Ollama or LM Studio interface');
  });

  it('runs model.switch action immediately', async () => {
    const res = await service.processMessage('switch model to gemma', 'session1');
    expect(res.intent).toBe('model.switch');
    expect(res.response).toContain('Model switching should be done via the client UI');
  });

  it('runs cache.stats action immediately', async () => {
    mockGetStats.mockReturnValue({ hits: 42, misses: 8 });

    const res = await service.processMessage('show cache statistics', 'session1');
    expect(mockGetStats).toHaveBeenCalled();
    expect(res.intent).toBe('cache.stats');
    expect(res.response).toContain('Hits: 42');
    expect(res.response).toContain('Misses: 8');
    expect(res.response).toContain('Hit rate: 84.0%');
  });

  it('runs workspace.info action immediately', async () => {
    mockGetWorkspace.mockReturnValue('C:\\Projects\\NYX');

    const res = await service.processMessage('get workspace info', 'session1');
    expect(mockGetWorkspace).toHaveBeenCalled();
    expect(res.intent).toBe('workspace.info');
    expect(res.response).toContain('C:\\Projects\\NYX');
  });

  describe('Safeguards: Two-Step confirmation flow', () => {
    beforeEach(() => {
      AssistantService.clearPendingAction('session_safeguard');
    });

    it('requires confirmation step before clearing cache (cache.clear)', async () => {
      // Step 1: Request cache clear
      const res1 = await service.processMessage('clear cache stats', 'session_safeguard');
      expect(res1.pendingConfirmation).toBe(true);
      expect(res1.response).toContain('Are you sure you want to clear the system cache?');
      expect(mockClearCache).not.toHaveBeenCalled();

      // Step 2: Confirm 'yes'
      const res2 = await service.processMessage('yes', 'session_safeguard');
      expect(mockClearCache).toHaveBeenCalled();
      expect(res2.actionExecuted).toBe('cache.clear');
      expect(res2.response).toContain('cleared successfully');

      // Subsequent prompt should be free of pending action
      const res3 = await service.processMessage('get workspace info', 'session_safeguard');
      expect(res3.intent).toBe('workspace.info');
    });

    it('requires cancellation of pending actions (cache.clear)', async () => {
      // Step 1: Request cache clear
      await service.processMessage('clear cache stats', 'session_safeguard');
      expect(mockClearCache).not.toHaveBeenCalled();

      // Step 2: Cancel 'no'
      const res2 = await service.processMessage('no', 'session_safeguard');
      expect(mockClearCache).not.toHaveBeenCalled();
      expect(res2.intent).toBe('action.cancel');
      expect(res2.response).toContain('cancelled');
    });

    it('reminds user if they send a non-confirmation response when action is pending', async () => {
      await service.processMessage('clear cache stats', 'session_safeguard');

      const res = await service.processMessage('tell me a joke', 'session_safeguard');
      expect(res.pendingConfirmation).toBe(true);
      expect(res.response).toContain("Reply 'yes' to proceed, or 'no' to cancel");
      expect(mockClearCache).not.toHaveBeenCalled();
    });

    it('requires confirmation step before changing workspace (workspace.change)', async () => {
      // Step 1: Request workspace change
      const res1 = await service.processMessage(
        'change workspace to D:\\projects',
        'session_safeguard'
      );
      expect(res1.pendingConfirmation).toBe(true);
      expect(res1.response).toContain('switch the workspace path to: D:\\projects');
      expect(mockSetWorkspace).not.toHaveBeenCalled();

      // Step 2: Confirm 'yes'
      const res2 = await service.processMessage('yes', 'session_safeguard');
      expect(mockSetWorkspace).toHaveBeenCalledWith('D:\\projects');
      expect(res2.actionExecuted).toBe('workspace.change');
      expect(res2.response).toContain('Workspace root successfully updated');
    });
  });
});

describe('Assistant router endpoints', () => {
  const app = fastify();

  beforeAll(async () => {
    // Register route and disable authorization requests inside router test scope for simplicity
    app.register(assistantRouter);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /chat returns processed assistant responses', async () => {
    mockHealth.mockResolvedValue({
      overall: 'ok',
      checks: { dependencies: {} },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'system health status',
        sessionId: 'fastify-test-session',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.intent).toBe('system.health');
    expect(body.response).toBeDefined();
  });

  it('GET /config returns list of engines and active configuration', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/config',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.activeEngine).toBe('local');
    expect(body.engines.local.status).toBe('ready');
  });

  it('POST /config updates and returns the configuration', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/config',
      payload: {
        activeEngine: 'dialogflow',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.config.activeEngine).toBe('dialogflow');
  });
});
