import { FastifyInstance } from 'fastify';

const checkDatabase = async () => ({ name: 'database', status: 'healthy' });
const checkCache = async () => ({ name: 'cache', status: 'healthy' });
const checkModelServers = async () => ({ name: 'model_servers', status: 'healthy' });
const checkDiskSpace = async () => ({ name: 'disk_space', status: 'healthy' });
const checkMemory = async () => ({ name: 'memory', status: 'healthy' });

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
}
