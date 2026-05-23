/**
 * @file server/lib/fastifyApi.ts
 * @description Fastify server for high-performance API key and model provider handling.
 * Provides fast connections between model APIs and endpoints.
 */

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import https from 'https';
import dns from 'node:dns';

import { DNS_CACHE, preWarmDns as resolveHostname } from './apiAgent.js';
import { loadKeys, verifySessionToken } from './keyVault.ts';

// Configure global fetch with connection pooling
const customAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 256,
  maxFreeSockets: 256,
  timeout: 60000,
  scheduling: 'fifo',
});

const fastify = Fastify({
  logger: true,
  connectionTimeout: 30000,
  keepAliveTimeout: 75000,
  requestTimeout: 120000,
});

// Enable CORS for frontend connections
await fastify.register(fastifyCors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nyx-session-token'],
  credentials: true,
});

// Validate session token for all proxy requests on Fastify (Port 3001)
fastify.addHook('preHandler', async (request, reply) => {
  if (request.url === '/health' || request.url.endsWith('/health')) {
    return;
  }

  const authHeader = request.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = (request.headers['x-nyx-session-token'] as string) || (request.query as any)?.session_token;
  }

  if (!token && request.body && typeof request.body === 'object') {
    token = (request.body as any).sessionToken || (request.body as any).session_token;
  }

  if (!token || !verifySessionToken(token)) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid or expired session token' });
  }
});

// Provider URL configuration for fast routing
const PROVIDER_ENDPOINTS: Record<string, { baseUrl: string; authType: 'bearer' | 'apiKey' | 'none'; endpoint: string; isLocal?: boolean }> = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'apiKey',
    endpoint: '/models/{model}:generateContent'
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    authType: 'bearer',
    endpoint: '/chat/completions'
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    authType: 'bearer',
    endpoint: '/chat/completions'
  },
  opencode: {
    baseUrl: 'https://opencode.ai/zen/v1',
    authType: 'bearer',
    endpoint: '/chat/completions'
  }
};

export async function warmupDNS() {
  console.log('🚀 Warming up DNS cache for providers...');
  const hostnames = Object.values(PROVIDER_ENDPOINTS)
    .filter(p => !p.isLocal)
    .map(p => {
      try {
        return new URL(p.baseUrl).hostname;
      } catch {
        return null;
      }
    })
    .filter((h): h is string => h !== null);
  
  await Promise.all(hostnames.map(h => resolveHostname(h)));
  console.log(`✅ DNS warmup complete. Pre-resolved ${hostnames.length} providers.`);
}

// API Key validation and management
const API_KEY_STORE = new Map<string, { key: string; provider: string; timestamp: number }>();

export function registerApiKey(provider: string, key: string): void {
  API_KEY_STORE.set(provider, { key, provider, timestamp: Date.now() });
}

export function getApiKey(provider: string): string | undefined {
  // First attempt: check the secure backend KeyVault
  try {
    const keys = loadKeys();
    const vaultKey = keys[provider]?.trim();
    if (vaultKey && vaultKey !== '' && vaultKey !== 'null' && vaultKey !== 'undefined') {
      return vaultKey;
    }
  } catch (error: any) {
    console.error(`[FastifyApi] Failed to load key for ${provider} from vault:`, error.message);
  }

  // Second attempt: check in-memory temp store
  const entry = API_KEY_STORE.get(provider);
  if (entry && Date.now() - entry.timestamp < 3600000) { // 1 hour cache
    return entry.key;
  }

  // Third attempt: env fallback
  const specificKey = process.env[`${provider.toUpperCase()}_API_KEY`]?.trim();
  if (specificKey) return specificKey;
  
  if (provider === 'gemini') {
    return process.env.LLM_API_KEY;
  }
  return undefined;
}

export function clearApiKey(provider: string): void {
  API_KEY_STORE.delete(provider);
}

function resolveRealModel(model: string): string {
  const m = model.toLowerCase();
  const modelMap: Record<string, string> = {
    'gemini-3.5-flash': 'gemini-3.5-flash',
    'gemini-3-flash': 'gemini-3-flash',
    'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
    'gemma-4-31b-it': 'gemma-4-31b-it',
    'gemma-4-26b-a4b-it': 'gemma-4-26b-a4b-it',
    'gemma-4-e4b-it': 'gemma-4-e4b-it',
    'gemma-4-e2b-it': 'gemma-4-e2b-it',
  };
  return modelMap[m] || model;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEDICATED ROUTES FOR EACH PROVIDER - Models have their own endpoints
// ═══════════════════════════════════════════════════════════════════════════════

// ── GEMINI ───────────────────────────────────────────────────────────────────────
fastify.post('/gemini/*', async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = request.body as any;

  let activeKey = apiKey || getApiKey('gemini') || '';
  if (!activeKey) return reply.status(401).send({ error: 'Gemini API key required' });

  let baseUrl = gatewayUrls?.gemini?.replace(/\/$/, '') || 'https://generativelanguage.googleapis.com/v1beta';
  const realModel = resolveRealModel(model);
  const url = `${baseUrl}/models/${realModel}:generateContent?key=${activeKey}`;

  const contents: any[] = [];
  if (history) {
    contents.push(...history.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })));
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const body: any = { contents };
  if (systemInstruction) body.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  if (settings?.temperature) body.generationConfig = { temperature: settings.temperature };
  if (settings?.topP) body.generationConfig = { ...body.generationConfig, topP: settings.topP };
  if (settings?.maxTokens) body.generationConfig = { ...body.generationConfig, maxOutputTokens: settings.maxTokens };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': activeKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Google AI Studio Error ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {}
      return reply.status(response.status).send({ error: errorMessage });
    }

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return reply.send({ text });
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

// ── OPENCODE ─────────────────────────────────────────────────────────────────────
fastify.post('/opencode/*', async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = request.body as any;

  let activeKey = apiKey || getApiKey('opencode') || '';
  if (!activeKey) return reply.status(401).send({ error: 'OpenCode API key required' });

  let baseUrl = gatewayUrls?.opencode?.replace(/\/$/, '') || 'https://opencode.ai/zen/v1';
  const url = `${baseUrl}/chat/completions`;

  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  if (history) messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    stream: false,
    temperature: settings?.temperature ?? 0.7,
    max_tokens: settings?.maxTokens ?? 4096,
    top_p: settings?.topP ?? 1.0
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `OpenCode Error ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {}
      return reply.status(response.status).send({ error: errorMessage });
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    return reply.send({ text });
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

// ── OPENROUTER ──────────────────────────────────────────────────────────────────
fastify.post('/openrouter/*', async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = request.body as any;

  let activeKey = apiKey || getApiKey('openrouter') || '';
  if (!activeKey) return reply.status(401).send({ error: 'OpenRouter API key required' });

  let baseUrl = gatewayUrls?.openrouter?.replace(/\/$/, '') || 'https://openrouter.ai/api/v1';
  const url = `${baseUrl}/chat/completions`;

  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  if (history) messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    stream: false,
    temperature: settings?.temperature ?? 0.7,
    max_tokens: settings?.maxTokens ?? 4096,
    top_p: settings?.topP ?? 1.0
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `OpenRouter Error ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {}
      return reply.status(response.status).send({ error: errorMessage });
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    return reply.send({ text });
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

// ── NVIDIA ───────────────────────────────────────────────────────────────────────
// NVIDIA NIM models - requires nvapi-* API key
fastify.post('/nvidia/*', async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = request.body as any;

  // Resolve API key: request body > env var
  const activeKey = apiKey || getApiKey('nvidia') || '';
  if (!activeKey || !activeKey.startsWith('nvapi-')) {
    return reply.status(401).send({ error: 'NVIDIA API key is required. Add your nvapi-* key in Settings.' });
  }

  // NVIDIA NIM model mapping
  const modelMap: Record<string, string> = {
    'nvidia/llama-3.3-70b-instruct': 'meta/llama-3.3-70b-instruct',
    'nvidia/deepseek-r1': 'deepseek-ai/deepseek-r1',
    'nvidia/deepseek-v3': 'deepseek-ai/deepseek-v3',
    'nvidia/llama-3.1-nemotron-70b-instruct': 'nvidia/llama-3.1-nemotron-70b-instruct',
    'nvidia/nemotron-4-340b-instruct': 'nvidia/nemotron-4-340b-instruct',
    'nvidia/gemma-3-27b-it': 'google/gemma-3-27b-it',
    'nvidia/gemma-2-9b-it': 'google/gemma-2-9b-it',
    'nvidia/phi-4': 'microsoft/phi-4',
    'nvidia/ministral-8b': 'mistralai/ministral-8b-instruct-v0.3',
  };
  const realModel = modelMap[model] || model.replace('nvidia/', '');

  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  if (history) messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: realModel,
    messages,
    stream: false,
    temperature: settings?.temperature ?? 0.7,
    max_tokens: settings?.maxTokens ?? 4096,
    top_p: settings?.topP ?? 1.0
  };

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`,
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `NVIDIA Error ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {}
      return reply.status(response.status).send({ error: errorMessage });
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    return reply.send({ text });
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

// Model list endpoint
fastify.post('/models/list', async (request, reply) => {
  const { provider, apiKey } = request.body as { provider: string; apiKey: string };

  let activeKey = apiKey || getApiKey(provider) || '';
  
  if (!activeKey) {
    return reply.status(401).send({ error: `API key required for ${provider}` });
  }

  const providerConfig = PROVIDER_ENDPOINTS[provider];
  if (!providerConfig) {
    return reply.status(400).send({ error: `Unknown provider: ${provider}` });
  }

  let url = '';
  const headers: Record<string, string> = {};

  if (provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`;
  } else if (provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/models';
    headers['Authorization'] = `Bearer ${activeKey}`;
  } else if (provider === 'nvidia') {
    url = 'https://integrate.api.nvidia.com/v1/models';
    headers['Authorization'] = `Bearer ${activeKey}`;
  } else {
    return reply.status(400).send({ error: `Model list not supported for ${provider}` });
  }

  try {
    const response = await fetch(url, { headers });
    const data = await response.json();

    let models: string[] = [];
    if (provider === 'gemini') {
      models = data.models?.map((m: any) => m.name.replace('models/', '')) || [];
    } else if (provider === 'openrouter') {
      models = data.data?.map((m: any) => m.id) || [];
    } else if (provider === 'nvidia') {
      models = data.data?.map((m: any) => m.id) || [];
    }

    return reply.send({ models });
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

// Quota check endpoint
fastify.post('/quota', async (request, reply) => {
  const { provider, apiKey } = request.body as { provider: string; apiKey: string };

  let activeKey = apiKey || getApiKey(provider) || '';
  
  if (!activeKey) {
    return reply.status(401).send({ error: `API key required for ${provider}` });
  }

  try {
    if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { 'Authorization': `Bearer ${activeKey}` }
      });
      const data = await response.json();
      return reply.send(data);
    }
    
    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`);
      if (response.ok) return reply.send({ status: 'ok' });
    }

    return reply.send({});
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

// Health check
fastify.get('/health', async () => ({ status: 'ok', server: 'fastify' }));

export async function startFastifyServer(port: number = 3001): Promise<void> {
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`⚡ Fastify API Server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

export { fastify };