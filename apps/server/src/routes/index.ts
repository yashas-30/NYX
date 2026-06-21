import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import {
  createSessionToken,
  refreshSessionToken,
  verifySessionToken,
  getRequestSignerSecrets,
} from '../features/vault/vault.service.js';
import { requestSignerMiddleware } from '../middleware/requestSigner.js';
import { requestDedupeMiddleware } from '../middleware/dedupe.js';

// Import Routers (they will be rewritten as Fastify plugins)
import { vaultRouter } from '../features/vault/vault.router.js';
import { adminRouter } from '../features/admin/admin.router.js';
import { systemRouter } from '../features/system/system.router.js';
import { chatRouter } from '../features/chat/chat.router.js';
import { router as authRouter } from '../features/auth/auth.router.js';
import { healthRouter } from '../features/system/health.router.js';
import { metricsRouter } from '../features/system/metrics.router.js';
import { conversationsRouter } from '../features/conversations/conversations.router.js';
import { workspaceRouter } from '../features/workspace/workspace.router.js';
import { filesRouter } from '../features/files/files.router.js';
import { modelProxyRouter } from '../features/model-proxy/modelProxy.router.js';
import { promptTemplatesRouter } from '../features/prompt-templates/prompt-templates.router.js';
import { geminiRouter } from '../features/ai-providers/gemini.router.js';
import { terminalRouter } from '../features/terminal/terminal.router.js';
import { agentsRouter } from '../features/agents/agents.router.js';
import { localModelsRouter } from '../features/local-models/localModels.router.js';
import { nyxRouter } from '../features/nyx/nyx.router.js';
import { gitRouter } from '../features/nyx/git.router.js';
import { uploadRouter } from '../features/upload/upload.router.js';
import { cacheRouter } from '../features/cache/cache.router.js';
import { assistantRouter } from '../features/assistant/assistant.router.js';
import { memoryRouter } from '../features/memory/memory.router.js';

import { providerRateLimiter } from '../middleware/rateLimit.js';

export const registerRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Global config endpoint
  app.get('/api/config', async (request, reply) => {
    return reply.send({
      version: '3.0.0',
      nodeEnv: env.NODE_ENV,
      featureFlags: {
        useCloudflareGateway: env.USE_CLOUDFLARE_GATEWAY,
        allowRawTerminal: env.NYX_ALLOW_RAW_TERMINAL,
        enforceRequestSignature: env.ENFORCE_REQUEST_SIGNATURE,
      },
      limits: {
        rulesDbMaxEntries: env.RULES_DB_MAX_ENTRIES,
        maxTokenQuota: env.MAX_TOKEN_QUOTA,
      },
    });
  });

  // V1 Plugin
  app.register(async (v1: FastifyInstance) => {
    // Auth Middleware Hook
    v1.addHook('preHandler', async (request, reply) => {
      const fullPath = request.url.split('?')[0].replace(/\/$/, '');
      const isPublic =
        new Set([
          '/api/v1/health',
          '/api/v1/vault/status',
          '/api/v1/vault/token',
          '/api/v1/admin/logs',
          '/api/v1/metrics',
          '/api/v1/config',
        ]).has(fullPath) || fullPath.startsWith('/api/v1/auth');

      if (isPublic) return; // proceed

      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ') && verifySessionToken(authHeader.substring(7))) {
        return; // proceed
      }

      reply.code(401).send({ error: 'Unauthorized: Invalid or expired session token' });
      return reply; // stop processing
    });

    // Request Signer Hook
    v1.addHook('preHandler', requestSignerMiddleware);

    // Request Dedupe Hook
    v1.addHook('preHandler', requestDedupeMiddleware);

    // --- Auth & Session Routes ---
    v1.register(vaultRouter, { prefix: '/vault' });
    v1.register(authRouter, { prefix: '/auth' });

    v1.get('/auth/session', async (request, reply) => {
      const isStream = (request.query as any)?.stream === 'true';
      return reply.send({
        token: createSessionToken(isStream),
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
    });

    v1.get('/config', async (request, reply) => {
      return reply.send({
        version: '3.0.0',
        nodeEnv: env.NODE_ENV,
        featureFlags: {
          useCloudflareGateway: env.USE_CLOUDFLARE_GATEWAY,
          allowRawTerminal: env.NYX_ALLOW_RAW_TERMINAL,
          enforceRequestSignature: env.ENFORCE_REQUEST_SIGNATURE,
        },
        limits: {
          rulesDbMaxEntries: env.RULES_DB_MAX_ENTRIES,
          maxTokenQuota: env.MAX_TOKEN_QUOTA,
        },
      });
    });

    v1.post('/auth/refresh', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const newToken = refreshSessionToken(authHeader.substring(7));
        if (newToken) {
          return reply.send({ success: true, token: newToken, expiresAt: Date.now() + 30 * 60 * 1000 });
        }
      }
      return reply.code(401).send({ error: 'Unauthorized: Invalid or expired session token' });
    });


    // --- Feature Routes ---
    v1.register(adminRouter, { prefix: '/admin' });
    v1.register(systemRouter);
    v1.register(healthRouter);
    v1.register(metricsRouter);
    v1.register(conversationsRouter, { prefix: '/conversations' });
    v1.register(chatRouter, { prefix: '/chat' });
    v1.register(filesRouter, { prefix: '/files' });
    v1.register(cacheRouter, { prefix: '/cache' });
    v1.register(workspaceRouter, { prefix: '/workspace' });
    v1.register(modelProxyRouter, { prefix: '/models' });
    v1.register(promptTemplatesRouter, { prefix: '/prompt-templates' });
    v1.register(assistantRouter, { prefix: '/assistant' });
    v1.register(memoryRouter, { prefix: '/memory' });

    // For gemini router with providerRateLimiter
    v1.register(async (geminiScope: FastifyInstance) => {
      geminiScope.addHook('preHandler', providerRateLimiter('gemini'));
      geminiScope.register(geminiRouter);
    }, { prefix: '/gemini' });

    v1.register(terminalRouter, { prefix: '/terminal' });
    v1.register(agentsRouter, { prefix: '/agents' });
    v1.register(localModelsRouter, { prefix: '/nyx/local-models' });
    v1.register(nyxRouter, { prefix: '/nyx' });
    v1.register(gitRouter, { prefix: '/git' });
    v1.register(uploadRouter, { prefix: '/upload' });
  }, { prefix: '/api/v1' });

  // V2 Plugin (Placeholder)
  app.register(async (v2: FastifyInstance) => {
    // V2 routes
  }, { prefix: '/api/v2' });
};
