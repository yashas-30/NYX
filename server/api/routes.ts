import express from 'express';
import { createSessionToken, refreshSessionToken } from '../features/vault/vault.service.ts';
import { getInternalSecret } from '../middleware/requestSigner.ts';

// Import Routers
import { vaultRouter } from '../features/vault/vault.router.ts';
import { adminRouter } from '../features/admin/admin.router.ts';
import { systemRouter } from '../features/system/system.router.ts';
import { chatRouter } from '../features/chat/chat.router.ts';
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

import { providerRateLimiter } from '../middleware/rateLimit.ts';

export function setupRoutes(app: express.Express) {
  const v1Router = express.Router();
  const v2Router = express.Router(); // Placeholder for migration path

  // --- Auth & Session Routes ---
  v1Router.use('/vault', vaultRouter);
  v1Router.get('/auth/session', (req, res) => {
    const isStream = req.query.stream === 'true';
    res.json({ token: createSessionToken(isStream), expiresAt: Date.now() + 5 * 60 * 1000 });
  });
  v1Router.post('/auth/refresh', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (refreshSessionToken(token)) {
        return res.json({ success: true, expiresAt: Date.now() + 5 * 60 * 1000 });
      }
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  });
  v1Router.get('/auth/handshake', (req, res) => {
    // Session token is already validated by sessionValidationMiddleware
    res.json({ secret: getInternalSecret() });
  });

  // --- Feature Routes ---
  v1Router.use('/admin', adminRouter);
  v1Router.use('/', systemRouter);
  v1Router.use('/', healthRouter);
  v1Router.use('/', metricsRouter);
  v1Router.use('/conversations', conversationsRouter);
  v1Router.use('/chat', chatRouter);
  v1Router.use('/files', filesRouter);
  v1Router.use('/cache', cacheRouter);
  v1Router.use('/workspace', workspaceRouter);
  v1Router.use('/models', modelProxyRouter);
  v1Router.use('/prompt-templates', promptTemplatesRouter);

  v1Router.use('/gemini', providerRateLimiter('gemini'), geminiRouter);
  v1Router.use('/terminal', terminalRouter);
  v1Router.use('/agents', agentsRouter);
  v1Router.use('/nyx/local-models', localModelsRouter);
  v1Router.use('/nyx', nyxRouter);
  v1Router.use('/graphql', graphqlRouter);
  v1Router.use('/upload', uploadRouter);

  // Mount versioned routers
  app.use('/api/v1', v1Router);
  app.use('/api/v2', v2Router);
}
