import { FastifyInstance } from 'fastify';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { LOGS_DIR } from '../../lib/paths.js';
import chokidar from 'chokidar';
import logger from '../../lib/logger.js';
import { timingSafeEqual } from 'crypto';
import { RulesDb, UsageTracker } from './admin.service.js';
import { env } from '../../config/env.js';

// Scrapling health state (updated by server.ts health-check loop)
export let scraplingHealthState: 'running' | 'restarting' | 'offline' = 'offline';
export function setScraplingHealthState(state: 'running' | 'restarting' | 'offline') {
  scraplingHealthState = state;
}

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function adminRouter(fastify: FastifyInstance) {
  fastify.get('/logs/stream', async (request, reply) => {
    const adminKey = env.ADMIN_KEY;
    if (!adminKey) {
      return reply.code(404).send('Not Found');
    }
    const clientKey = (request.headers['x-admin-key'] || (request.query as any).adminKey) as
      | string
      | undefined;
    if (!clientKey || !safeCompare(String(clientKey), String(adminKey))) {
      return reply.code(401).send({ error: 'Unauthorized: Invalid admin key' });
    }

    const { initFastifySse } = await import('../../lib/sseHelpers.js');
    initFastifySse(reply);

    const dateStr = new Date().toISOString().slice(0, 10);
    const logPath = path.join(LOGS_DIR, `nyx-${dateStr}.log`);

    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({ status: 'connected', logPath })}\n\n`
    );

    let filePosition = 0;
    try {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        filePosition = stats.size;
      }
    } catch {}

    const readNewLogs = () => {
      try {
        if (!fs.existsSync(logPath)) return;
        const stats = fs.statSync(logPath);
        if (stats.size > filePosition) {
          const fd = fs.openSync(logPath, 'r');
          const buffer = Buffer.alloc(stats.size - filePosition);
          fs.readSync(fd, buffer, 0, buffer.length, filePosition);
          fs.closeSync(fd);
          filePosition = stats.size;
          const newLines = buffer.toString('utf8').split('\n');
          for (const line of newLines) {
            const trimmed = line.trim();
            if (trimmed) {
              reply.raw.write(`event: log\ndata: ${trimmed}\n\n`);
            }
          }
        }
      } catch (error: any) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      }
    };

    let watcher: any = null;
    try {
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }
      watcher = chokidar.watch(logPath, {
        persistent: true,
        ignoreInitial: true,
        usePolling: false,
      });
      watcher.on('change', () => {
        readNewLogs();
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to start chokidar watcher for logs');
    }

    request.raw.on('close', () => {
      if (watcher) watcher.close();
    });
  });

  // MISSING-3: Usage cost tracking endpoint (admin-key protected)
  fastify.get('/usage', async (request, reply) => {
    const adminKey = env.ADMIN_KEY as string | undefined;
    if (adminKey) {
      const clientKey = (request.headers['x-admin-key'] || (request.query as any).adminKey) as
        | string
        | undefined;
      if (!clientKey || !safeCompare(String(clientKey), String(adminKey))) {
        return reply.code(401).send({ error: 'Unauthorized: Invalid admin key' });
      }
    }
    try {
      const days = parseInt(String((request.query as any).days || '30'), 10);
      const summary = await UsageTracker.getUsageSummary(days);
      const totalCost = await UsageTracker.getTotalCost(days);
      reply.send({ success: true, summary, totalCostUsd: totalCost, days });
    } catch (error: any) {
      logger.error({ error }, '[Admin] Failed to get usage summary');
      reply.code(500).send({ error: 'Failed to retrieve usage data' });
    }
  });

  // MISSING-11: Scrapling health status endpoint for frontend indicator
  fastify.get('/scrapling-status', (_req, reply) => {
    reply.send({ status: scraplingHealthState });
  });

  // MISSING-8: Manual rule prune endpoint
  fastify.post('/rules/prune', async (request, reply) => {
    try {
      const rules = await RulesDb.getRules();
      const maxCount = (request.body as any)?.maxCount
        ? parseInt(String((request.body as any).maxCount), 10)
        : env.RULES_DB_MAX_ENTRIES;
      const before = rules.length;
      // Pruning is automatic on addRule — this endpoint forces an immediate prune
      if (rules.length > maxCount) {
        const { RuleRepository } = await import('../../repositories/rule.repo.js');
        await RuleRepository.pruneRules(maxCount);
      }
      const afterRules = await RulesDb.getRules();
      reply.send({ success: true, before, after: afterRules.length, pruned: before - afterRules.length });
    } catch (error: any) {
      logger.error({ error }, '[Admin] Failed to prune rules');
      reply.code(500).send({ error: 'Failed to prune rules' });
    }
  });

  // Rules management endpoints
  fastify.get('/rules', async (_req, reply) => {
    try {
      const rules = await RulesDb.getRules();
      reply.send({ success: true, rules, count: rules.length });
    } catch (error: any) {
      reply.code(500).send({ error: 'Failed to get rules' });
    }
  });

  fastify.delete('/rules', async (_req, reply) => {
    try {
      await RulesDb.resetRules();
      reply.send({ success: true, message: 'All rules cleared' });
    } catch (error: any) {
      reply.code(500).send({ error: 'Failed to reset rules' });
    }
  });

  fastify.get('/stats', async (request, reply) => {
    const adminKey = env.ADMIN_KEY as string | undefined;
    if (adminKey) {
      const clientKey = (request.headers['x-admin-key'] || (request.query as any).adminKey) as
        | string
        | undefined;
      if (!clientKey || !safeCompare(String(clientKey), String(adminKey))) {
        return reply.code(401).send({ error: 'Unauthorized: Invalid admin key' });
      }
    }
    try {
      const memoryUsage = process.memoryUsage();
      const systemMemory = {
        total: os.totalmem(),
        free: os.freemem(),
      };
      const cpus = os.cpus();

      // Aggregate token info from UsageTracker
      const days = 30;
      const summary = await UsageTracker.getUsageSummary(days);

      // We can surface the quotas or remaining tokens if we have them in env or some config,
      // otherwise we just show consumed. We'll send a placeholder for remaining if unknown.
      let totalConsumed = 0;
      summary.forEach((v: any) => {
        totalConsumed += (v.total_prompt_tokens || 0) + (v.total_completion_tokens || 0);
      });

      const tokenQuotas = {
        consumed: totalConsumed,
        remaining: env.MAX_TOKEN_QUOTA
          ? Number(env.MAX_TOKEN_QUOTA) - totalConsumed
          : 'unlimited',
        breakdown: summary,
      };

      reply.send({
        success: true,
        system: {
          memory: {
            process: memoryUsage,
            system: systemMemory,
          },
          cpus: cpus.length,
          loadavg: os.loadavg(),
          uptime: os.uptime(),
        },
        tokens: tokenQuotas,
      });
    } catch (error: any) {
      logger.error({ error }, '[Admin] Failed to get stats');
      reply.code(500).send({ error: 'Failed to retrieve stats' });
    }
  });

  fastify.get('/debug', (request, reply) => {
    const adminKey = env.ADMIN_KEY as string | undefined;
    if (adminKey) {
      const clientKey = (request.headers['x-admin-key'] || (request.query as any).adminKey) as
        | string
        | undefined;
      if (!clientKey || !safeCompare(String(clientKey), String(adminKey))) {
        return reply.code(401).send({ error: 'Unauthorized: Invalid admin key' });
      }
    }

    try {
      const memoryUsage = process.memoryUsage();
      // In a real app we might measure event loop lag here
      const uptime = process.uptime();

      reply.send({
        success: true,
        debug: {
          memory: memoryUsage,
          uptime,
          pid: process.pid,
          nodeVersion: process.version,
          platform: os.platform(),
          arch: os.arch(),
          env: env.NODE_ENV,
        },
      });
    } catch (error: any) {
      logger.error({ error }, '[Admin] Failed to get debug metrics');
      reply.code(500).send({ error: 'Failed to retrieve debug metrics' });
    }
  });
}
