import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createSessionToken,
  refreshSessionToken,
  verifySessionToken,
} from '../features/vault/vault.service.ts';
import { requestSignerMiddleware } from '../middleware/requestSigner.ts';
import { requestDedupeMiddleware } from '../middleware/dedupe.ts';
import { getRequestSignerSecrets } from '../features/vault/vault.service.ts';

// Import Routers
import { vaultRouter } from '../features/vault/vault.router.ts';
import { adminRouter } from '../features/admin/admin.router.ts';
import { systemRouter } from '../features/system/system.router.ts';
import { chatRouter } from '../features/chat/chat.router.ts';
import authRouter from '../features/auth/auth.router.ts';
import { healthRouter } from '../features/system/health.router.ts';
import { metricsRouter } from '../features/system/metrics.router.ts';
import { conversationsRouter } from '../features/conversations/conversations.router.ts';
import { workspaceRouter } from '../features/workspace/workspace.router.ts';
import { filesRouter } from '../features/files/files.router.ts';
import { modelProxyRouter } from '../features/model-proxy/modelProxy.router.ts';
import { promptTemplatesRouter } from '../features/prompt-templates/prompt-templates.router.ts';
import { geminiRouter } from '../features/ai-providers/gemini.router.ts';
import { terminalRouter } from '../features/terminal/terminal.router.ts';
import { agentsRouter } from '../features/agents/agents.router.ts';
import { localModelsRouter } from '../features/local-models/localModels.router.ts';
import { nyxRouter } from '../features/nyx/nyx.router.ts';
import { graphqlRouter } from '../features/graphql/graphql.router.ts';
import { uploadRouter } from '../features/upload/upload.router.ts';
import { cacheRouter } from '../features/cache/cache.router.ts';
import { assistantRouter } from '../features/assistant/assistant.router.ts';

import { providerRateLimiter } from '../middleware/rateLimit.ts';

export async function setupRoutes(app: FastifyInstance) {
  // V1 Plugin
  app.register(
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
          ]).has(fullPath) || fullPath.startsWith('/api/v1/auth');

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
        const isStream = (request.query as any)?.stream === 'true';
        return reply.send({
          token: createSessionToken(isStream),
          expiresAt: Date.now() + 5 * 60 * 1000,
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
        // Session token is already validated by hook
        const secrets = await getRequestSignerSecrets();
        return reply.send({ secret: secrets.current });
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
      v1.register(workspaceRouter, { prefix: '/workspace' });
      v1.register(modelProxyRouter, { prefix: '/models' });
      v1.register(promptTemplatesRouter, { prefix: '/prompt-templates' });
      v1.register(assistantRouter, { prefix: '/assistant' });

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
      v1.register(localModelsRouter, { prefix: '/nyx/local-models' });
      v1.register(nyxRouter, { prefix: '/nyx' });
      v1.register(graphqlRouter, { prefix: '/graphql' });
      v1.register(uploadRouter, { prefix: '/upload' });
    },
    { prefix: '/api/v1' }
  );

  // V2 Plugin (Placeholder)
  app.register(
    async function v2Router(v2: FastifyInstance) {
      // V2 routes
    },
    { prefix: '/api/v2' }
  );
}
