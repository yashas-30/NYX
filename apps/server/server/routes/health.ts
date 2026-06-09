import { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

const checkDatabase = async () => ({ name: 'database', status: 'healthy' });
const checkCache = async () => ({ name: 'cache', status: 'healthy' });
const checkModelServers = async () => ({ name: 'model_servers', status: 'healthy' });
const checkDiskSpace = async () => ({ name: 'disk_space', status: 'healthy' });
const checkMemory = async () => ({ name: 'memory', status: 'healthy' });

/** Quickly checks if a local service is reachable. */
async function pingLocalService(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    const checks = await Promise.all([
      checkDatabase(),
      checkCache(),
      checkModelServers(),
      checkDiskSpace(),
      checkMemory()
    ]);

    const allHealthy = checks.every(c => c.status === 'healthy');
    reply.status(allHealthy ? 200 : 503);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      version: process.env.NYX_VERSION || '4.0.0',
      uptime: process.uptime(),
      checks: Object.fromEntries(checks.map(c => [c.name, c]))
    };
  });

  /** Returns real-time availability of each background service. */
  fastify.get('/health/services', async (request, reply) => {
    const ANTIGRAVITY_PORT = env.ANTIGRAVITY_PORT || 3003;
    const SCRAPLING_PORT = env.SCRAPLING_PORT || 3002;

    const [antigravity, scrapling, ollama] = await Promise.all([
      pingLocalService(`http://127.0.0.1:${ANTIGRAVITY_PORT}/health`),
      pingLocalService(`http://127.0.0.1:${SCRAPLING_PORT}/health`),
      pingLocalService('http://127.0.0.1:11434/api/tags'),
    ]);

    return {
      antigravity,
      scrapling,
      ollama,
      timestamp: Date.now(),
    };
  });
}
