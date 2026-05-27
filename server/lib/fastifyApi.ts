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
import { loadKeys, verifySessionToken } from '../features/vault/vault.service.ts';
import { UnifiedEngine } from './aiEngine.ts';

// SSRF protection: reject private/loopback addresses in gateway URLs
function validateGatewayUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid gateway URL'); }
  if (parsed.protocol !== 'https:') throw new Error('Gateway URL must use HTTPS');
  const host = parsed.hostname.toLowerCase();
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1|localhost$)/.test(host)) {
    throw new Error('Gateway URL must not point to private network');
  }
}

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
fastify.register(fastifyCors, {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nyx-session-token'],
  credentials: false,
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
    token = request.headers['x-nyx-session-token'] as string | undefined;
  }

  if (!token || !verifySessionToken(token)) {
    return reply.status(401).send({ error: 'Unauthorized: Invalid or expired session token' });
  }
});

interface StreamListener {
  write: (chunk: string) => void;
  end: () => void;
}

const activeStreams = new Map<string, Set<StreamListener>>();

// High-performance streaming endpoint that bypasses Express entirely
fastify.post('/api/stream/:provider', { config: { bodyLimit: 1024 * 1024 } }, async (request, reply) => {
  const { provider } = request.params as { provider: string };
  const { model, prompt, settings, systemInstruction, history, messages, temperature, max_tokens } = request.body as {
    model: string;
    prompt?: string;
    settings?: any;
    systemInstruction?: string;
    history?: any[];
    messages?: any[];
    temperature?: number;
    max_tokens?: number;
  };

  const activeKey = getApiKey(provider) || '';
  if (!activeKey && provider !== 'nyx-native') {
    return reply.status(401).send({ error: `${provider} API key required` });
  }

  const fingerprint = JSON.stringify({
    provider,
    model,
    prompt: prompt || '',
    systemInstruction: systemInstruction || '',
    messages: messages || [],
    history: history || [],
    settings: settings || {}
  });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const listener: StreamListener = {
    write: (chunk: string) => {
      reply.raw.write(chunk);
    },
    end: () => {
      reply.raw.end();
    }
  };

  if (activeStreams.has(fingerprint)) {
    console.log(`[Fastify Stream Dedupe] Multiplexing concurrent stream for provider ${provider}, model ${model}`);
    const listeners = activeStreams.get(fingerprint)!;
    listeners.add(listener);

    request.raw.on('close', () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        activeStreams.delete(fingerprint);
      }
    });
    return;
  }

  const listeners = new Set<StreamListener>([listener]);
  activeStreams.set(fingerprint, listeners);

  request.raw.on('close', () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      activeStreams.delete(fingerprint);
    }
  });

  const finalMessages: any[] = [];
  if (messages && Array.isArray(messages)) {
    finalMessages.push(...messages);
  } else {
    if (systemInstruction) {
      finalMessages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      finalMessages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    if (prompt) {
      finalMessages.push({ role: 'user', content: prompt });
    }
  }

  const finalSettings = settings || {
    temperature: temperature ?? 0.7,
    maxTokens: max_tokens ?? 4096
  };

  try {
    await UnifiedEngine.executeStream(
      {
        provider: provider as any,
        model,
        messages: finalMessages,
        settings: finalSettings,
        apiKey: activeKey
      },
      (chunk) => {
        const payload = `data: ${JSON.stringify(chunk)}\n\n`;
        for (const l of listeners) {
          try { l.write(payload); } catch {}
        }
      },
      () => {
        const payload = 'data: [DONE]\n\n';
        for (const l of listeners) {
          try {
            l.write(payload);
            l.end();
          } catch {}
        }
        activeStreams.delete(fingerprint);
      }
    );
  } catch (err: any) {
    const payload = `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`;
    for (const l of listeners) {
      try {
        l.write(payload);
        l.end();
      } catch {}
    }
    activeStreams.delete(fingerprint);
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
fastify.post('/gemini/*', { config: { bodyLimit: 1024 * 1024 } }, async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, settings, systemInstruction, history, messages } = request.body as any;

  const activeKey = getApiKey('gemini') || '';
  if (!activeKey) return reply.status(401).send({ error: 'Gemini API key required' });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const finalMessages: any[] = [];
  if (messages && Array.isArray(messages)) {
    finalMessages.push(...messages);
  } else {
    if (systemInstruction) {
      finalMessages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      finalMessages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    if (prompt) {
      finalMessages.push({ role: 'user', content: prompt });
    }
  }

  let isClosed = false;
  request.raw.on('close', () => {
    isClosed = true;
  });

  try {
    await UnifiedEngine.executeStream(
      {
        provider: 'gemini',
        model,
        messages: finalMessages,
        settings,
        apiKey: activeKey
      },
      (chunk) => {
        if (!isClosed) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
      () => {
        if (!isClosed) {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      }
    );
  } catch (err: any) {
    if (!isClosed) {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  }
});

// ── OPENCODE ─────────────────────────────────────────────────────────────────────
fastify.post('/opencode/*', { config: { bodyLimit: 1024 * 1024 } }, async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, settings, systemInstruction, history, messages } = request.body as any;

  const activeKey = getApiKey('opencode') || '';
  if (!activeKey) return reply.status(401).send({ error: 'OpenCode API key required' });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const finalMessages: any[] = [];
  if (messages && Array.isArray(messages)) {
    finalMessages.push(...messages);
  } else {
    if (systemInstruction) {
      finalMessages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      finalMessages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    if (prompt) {
      finalMessages.push({ role: 'user', content: prompt });
    }
  }

  let isClosed = false;
  request.raw.on('close', () => {
    isClosed = true;
  });

  try {
    await UnifiedEngine.executeStream(
      {
        provider: 'opencode',
        model,
        messages: finalMessages,
        settings,
        apiKey: activeKey
      },
      (chunk) => {
        if (!isClosed) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
      () => {
        if (!isClosed) {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      }
    );
  } catch (err: any) {
    if (!isClosed) {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  }
});

// ── OPENROUTER ──────────────────────────────────────────────────────────────────
fastify.post('/openrouter/*', { config: { bodyLimit: 1024 * 1024 } }, async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, settings, systemInstruction, history, messages } = request.body as any;

  const activeKey = getApiKey('openrouter') || '';
  if (!activeKey) return reply.status(401).send({ error: 'OpenRouter API key required' });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const finalMessages: any[] = [];
  if (messages && Array.isArray(messages)) {
    finalMessages.push(...messages);
  } else {
    if (systemInstruction) {
      finalMessages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      finalMessages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    if (prompt) {
      finalMessages.push({ role: 'user', content: prompt });
    }
  }

  let isClosed = false;
  request.raw.on('close', () => {
    isClosed = true;
  });

  try {
    await UnifiedEngine.executeStream(
      {
        provider: 'openrouter',
        model,
        messages: finalMessages,
        settings,
        apiKey: activeKey
      },
      (chunk) => {
        if (!isClosed) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
      () => {
        if (!isClosed) {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      }
    );
  } catch (err: any) {
    if (!isClosed) {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  }
});

// ── NVIDIA ───────────────────────────────────────────────────────────────────────
// NVIDIA NIM models - requires nvapi-* API key
fastify.post('/nvidia/*', { config: { bodyLimit: 1024 * 1024 } }, async (request, reply) => {
  const model = (request.params as any)['*'];
  const { prompt, settings, systemInstruction, history, messages } = request.body as any;

  // Resolve API key: server-side vault only
  const activeKey = getApiKey('nvidia') || '';
  if (!activeKey || !activeKey.startsWith('nvapi-')) {
    return reply.status(401).send({ error: 'NVIDIA API key is required. Add your nvapi-* key in Settings.' });
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const finalMessages: any[] = [];
  if (messages && Array.isArray(messages)) {
    finalMessages.push(...messages);
  } else {
    if (systemInstruction) {
      finalMessages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      finalMessages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    if (prompt) {
      finalMessages.push({ role: 'user', content: prompt });
    }
  }

  let isClosed = false;
  request.raw.on('close', () => {
    isClosed = true;
  });

  try {
    await UnifiedEngine.executeStream(
      {
        provider: 'nvidia',
        model,
        messages: finalMessages,
        settings,
        apiKey: activeKey
      },
      (chunk) => {
        if (!isClosed) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
      () => {
        if (!isClosed) {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      }
    );
  } catch (err: any) {
    if (!isClosed) {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  }
});

// Model list endpoint
fastify.post('/models/list', { config: { bodyLimit: 1024 * 1024 } }, async (request, reply) => {
  const { provider } = request.body as { provider: string };

  const activeKey = getApiKey(provider) || '';

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
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(120_000)
    });
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
fastify.post('/quota', { config: { bodyLimit: 1024 * 1024 } }, async (request, reply) => {
  const { provider } = request.body as { provider: string };

  const activeKey = getApiKey(provider) || '';

  if (!activeKey) {
    return reply.status(401).send({ error: `API key required for ${provider}` });
  }

  try {
    if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { 'Authorization': `Bearer ${activeKey}` },
        signal: AbortSignal.timeout(120_000)
      });
      const data = await response.json();
      return reply.send(data);
    }

    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`, {
        signal: AbortSignal.timeout(120_000)
      });
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
  const host = '127.0.0.1';
  if (host !== '127.0.0.1') {
    throw new Error('Security Breach: Fastify gateway bound outside localhost.');
  }
  try {
    await fastify.listen({ port, host });
    console.log(`⚡ Fastify API Server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

export { fastify };