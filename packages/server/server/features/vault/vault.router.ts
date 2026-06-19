import logger from '../../lib/logger.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  loadKeys,
  saveKeys,
  createSessionToken,
  getVaultStatus,
  backupVault,
  exportVault,
  importVault,
} from './vault.service.js';
import { validate } from '../../middleware/validate.js';
import { vaultStoreSchema } from './vault.schema.js';
import { env } from '../../config/env.js';

export async function vaultRouter(fastify: FastifyInstance) {
  fastify.post(
    '/store',
    {
      preHandler: [validate(vaultStoreSchema)],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const { keys } = request.body as any;
      try {
        const currentKeys = await loadKeys();
        const updatedKeys = { ...currentKeys, ...keys };
        await saveKeys(updatedKeys);
        reply.send({ status: 'ok' });
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  const handleGetToken = (request: FastifyRequest, reply: FastifyReply) => {
    const isStream = (request.query as any).stream === 'true';
    const token = createSessionToken(isStream);
    reply.send({ token, expiresAt: Date.now() + 5 * 60 * 1000 });
  };

  fastify.get(
    '/token',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '15 minutes',
        },
      },
    },
    handleGetToken
  );

  fastify.get('/status', async (request, reply) => {
    reply.send(await getVaultStatus());
  });

  fastify.get(
    '/keys',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      try {
        const keys = await loadKeys();
        reply.send({ keys });
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  fastify.post(
    '/backup',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      try {
        const backupPath = await backupVault();
        reply.send({ status: 'ok', path: backupPath });
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  fastify.post(
    '/export',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await exportVault();
        reply.send({ status: 'ok', data });
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  fastify.post(
    '/import',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const { data } = request.body as any;
      if (!data || typeof data !== 'string') {
        return reply.code(400).send({ error: 'Missing or invalid encrypted vault data in body' });
      }
      try {
        await importVault(data);
        reply.send({ status: 'ok' });
      } catch (error: any) {
        reply.code(500).send({ error: error.message });
      }
    }
  );

  fastify.post(
    '/validate',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const { provider, apiKey, key: keyField } = request.body as any;
      let resolvedKey = apiKey || keyField;

      if (!resolvedKey && provider) {
        try {
          const keys = await loadKeys();
          resolvedKey = keys[provider];
        } catch (e) {
          logger.error({ err: e }, '[Vault Validate] Failed to load keys from vault');
        }
      }

      if (!provider || !resolvedKey) {
        return reply.code(400).send({ error: 'Missing provider or key in request body' });
      }

      const key = resolvedKey.trim();

      try {
        if (provider === 'gemini') {
          const baseUrl = (
            (request.body as any).geminiUrl || 'https://generativelanguage.googleapis.com/v1beta'
          )
            .trim()
            .replace(/\/$/, '');
          const response = await fetch(`${baseUrl}/models?key=${key}`);
          if (response.ok) {
            return reply.send({ valid: true });
          } else {
            const errData = (await response.json().catch(() => ({}))) as any;
            return reply
              .code(400)
              .send({ valid: false, error: errData.error?.message || 'Invalid API Key' });
          }
        }

        if (provider === 'scrapling') {
          const scraplingPort = env.SCRAPLING_PORT || 3002;
          const url = (
            (request.body as any).scraplingUrl || `http://localhost:${scraplingPort}`
          ).trim();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (key) {
            headers['Authorization'] = `Bearer ${key}`;
          }

          try {
            const response = await fetch(`${url}/v1/search`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ query: 'test', limit: 1 }),
              signal: AbortSignal.timeout(5000),
            });

            if (response.ok || response.status === 400) {
              return reply.send({ valid: true });
            }

            const healthResponse = await fetch(`${url}/health`, {
              signal: AbortSignal.timeout(3000),
            });
            if (healthResponse.ok) {
              return reply.send({ valid: true });
            }
            return reply.code(400).send({
              valid: false,
              error: `Scrapling service returned status ${response.status}`,
            });
          } catch (error: any) {
            try {
              const healthResponse = await fetch(`${url}/health`, {
                signal: AbortSignal.timeout(3000),
              });
              if (healthResponse.ok) {
                return reply.send({ valid: true });
              }
            } catch {}
            return reply.code(400).send({
              valid: false,
              error: `Scrapling service unreachable at ${url}: ${error.message}`,
            });
          }
        }

        return reply
          .code(400)
          .send({ error: `Validation not supported for provider: ${provider}` });
      } catch (error: any) {
        return reply.code(500).send({ error: `Connection failed: ${error.message}` });
      }
    }
  );
}
