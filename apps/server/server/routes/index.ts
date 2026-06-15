import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import {
  createSessionToken,
  refreshSessionToken,
  verifySessionToken,
  getRequestSignerSecrets,
} from '../features/vault/vault.service.js';
import { requestSignerMiddleware } from '../middleware/requestSigner.js';
import { requestDedupeMiddleware } from '../middleware/dedupe.js';

// Import Routers
import { vaultRouter } from '../features/vault/vault.router.js';
import { adminRouter } from '../features/admin/admin.router.js';
import { systemRouter } from '../features/system/system.router.js';
import { chatRouter } from '../features/chat/chat.router.js';
import authRouter from '../features/auth/auth.router.js';
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
import { mcpRouter } from '../features/mcp/mcp.router.js';
import { localModelsRouter } from '../features/local-models/localModels.router.js';
import { nyxRouter } from '../features/nyx/nyx.router.js';
import { graphqlRouter } from '../features/graphql/graphql.router.js';
import { uploadRouter } from '../features/upload/upload.router.js';
import { cacheRouter } from '../features/cache/cache.router.js';
import { assistantRouter } from '../features/assistant/assistant.router.js';
import { sessionsRouter } from '../features/sessions/sessions.router.js';
import { memoryRouter } from '../features/memory/memory.router.js';
import { documentRouter } from '../features/upload/document.router.js';
import { voiceRouter } from '../features/voice/voice.router.js';

import { providerRateLimiter } from '../middleware/rateLimit.js';

export async function registerRoutes(app: FastifyInstance) {
  // Global config endpoint handled in v1

  // V1 Plugin
  await app.register(
    async function v1Router(v1: FastifyInstance) {
      // Auth Middleware Hook
      v1.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const fullPath = request.url.split('?')[0].replace(/\/$/, '');
        const isPublic =
          new Set([
            '/api/v1/health',
            '/api/v1/vault/status',
            '/api/v1/vault/token',
            '/api/v1/admin/logs',
            '/api/v1/metrics',
            '/api/v1/graphql',
            '/api/v1/config',
            '/api/v1/sessions',
          ]).has(fullPath) || fullPath.startsWith('/api/v1/auth') || fullPath.startsWith('/api/v1/sessions');

        if (isPublic) return;

        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ') && verifySessionToken(authHeader.substring(7))) {
          return;
        }

        reply.code(401).send({ error: 'Unauthorized: Invalid or expired session token' });
        return reply; // stop further processing
      });

      // Request Signer Hook
      v1.addHook('onRequest', requestSignerMiddleware);

      // Request Dedupe Hook
      v1.addHook('onRequest', requestDedupeMiddleware);

      // --- Auth & Session Routes ---
      v1.register(vaultRouter, { prefix: '/vault' });
      v1.register(authRouter, { prefix: '/auth' });

      v1.get('/auth/session', async (request, reply) => {
        try {
          const isStream = (request.query as any)?.stream === 'true';
          const token = createSessionToken(isStream);
          return reply.send({
            token,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
        } catch (error) {
          console.error("ERROR IN /auth/session:", error);
          reply.code(500).send({ error: "Internal Server Error", details: String(error) });
        }
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
          const token = authHeader.substring(7);
          if (refreshSessionToken(token)) {
            return reply.send({ success: true, expiresAt: Date.now() + 5 * 60 * 1000 });
          }
        }
        return reply.code(401).send({ error: 'Unauthorized: Invalid or expired session token' });
      });

      v1.get('/auth/handshake', async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ') || !verifySessionToken(authHeader.substring(7))) {
          reply.code(401).send({ error: 'Unauthorized: Invalid or expired session token' });
          return reply;
        }
        const token = authHeader.substring(7);
        const secrets = await getRequestSignerSecrets();
        const crypto = await import('crypto');
        const derivedSecret = crypto
          .createHmac('sha256', secrets.current)
          .update(token)
          .digest('hex');
        return reply.send({ secret: derivedSecret });
      });

      // --- Feature Routes ---
      v1.register(adminRouter, { prefix: '/admin' });
      v1.register(systemRouter, { prefix: '/' });
      v1.register(healthRouter, { prefix: '/' });
      v1.register(metricsRouter, { prefix: '/' });
      v1.register(conversationsRouter, { prefix: '/conversations' });
      v1.register(chatRouter, { prefix: '/chat' });
      v1.register(filesRouter, { prefix: '/files' });
      v1.register(cacheRouter, { prefix: '/cache' });
      v1.register(sessionsRouter, { prefix: '/sessions' });
      v1.register(workspaceRouter, { prefix: '/workspace' });
      v1.register(modelProxyRouter, { prefix: '/models' });
      v1.register(promptTemplatesRouter, { prefix: '/prompt-templates' });
      v1.register(assistantRouter, { prefix: '/assistant' });
      v1.register(memoryRouter, { prefix: '/' });
      v1.register(documentRouter, { prefix: '/' });

      // For gemini router with providerRateLimiter
      v1.register(
        async function geminiScope(scope) {
          scope.addHook('onRequest', providerRateLimiter('gemini'));
          scope.register(geminiRouter);
        },
        { prefix: '/gemini' }
      );

      v1.register(terminalRouter, { prefix: '/terminal' });
      v1.register(agentsRouter, { prefix: '/agents' });
      v1.register(mcpRouter, { prefix: '/mcp' });
      v1.register(localModelsRouter, { prefix: '/nyx/local-models' });
      v1.register(nyxRouter, { prefix: '/nyx' });
      v1.register(graphqlRouter, { prefix: '/graphql' });
      v1.register(uploadRouter, { prefix: '/upload' });
      v1.register(voiceRouter, { prefix: '/voice' });
    },
    { prefix: '/api/v1' }
  );

  // V2 Plugin (Placeholder)
  await app.register(
    async function v2Router(v2: FastifyInstance) {
      // V2 routes
    },
    { prefix: '/api/v2' }
  );
}
