// @ts-nocheck
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentsService } from './agents.service.js';
import { ClineService } from './cline.service.js';
import { sendSseTokenRotate } from '../../lib/sseHelpers.js';
import { verifySessionToken } from '../vault/vault.service.js';
import logger from '../../lib/logger.js';
import { getDedupKey, executeWithDedup } from '../../lib/streamDeduplicator.js';

// ── Request Validation Schemas ─────────────────────────────────────────────

const ImageSchema = z.object({
  mimeType: z.string(),
  data: z.string().refine(val => /^[A-Za-z0-9+/=]+$/.test(val.replace(/\s/g, '')), {
    message: 'Invalid base64 image data',
  }),
  name: z.string().optional(),
});

const HistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'model']),
  content: z.string().max(100_000),
  images: z.array(ImageSchema).max(16).optional().default([]),
});

const ChatRequestSchema = z.object({
  model: z.string().min(1),
  provider: z.enum(['gemini', 'ollama', 'lmstudio', 'antigravity-sdk', 'terminal']).optional(),
  prompt: z.string().max(100_000),
  history: z.array(HistoryMessageSchema).max(100).optional().default([]),
  images: z.array(ImageSchema).max(16).optional().default([]),
  gatewayUrls: z.record(z.string()).optional(),
  settings: z.record(z.unknown()).optional(),
  apiKey: z.string().optional(),
});

const CoderRequestSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().max(100_000),
  history: z.array(HistoryMessageSchema).max(100).optional().default([]),
  images: z.array(ImageSchema).max(16).optional().default([]),
  gatewayUrls: z.record(z.string()).optional(),
  apiKey: z.string().optional(),
});

// ── Auth Pre-handler ───────────────────────────────────────────────────────

async function requireSession(request: any, reply: any) {
  const token =
    (request.headers['x-nyx-session-token'] as string) ||
    (request.headers['authorization'] as string)?.replace(/^Bearer\s+/i, '');

  if (!verifySessionToken(token)) {
    reply.code(401).send({ error: 'Unauthorized: valid session token required' });
  }
}

// ── Router ─────────────────────────────────────────────────────────────────

export async function agentsRouter(fastify: FastifyInstance) {
  const service = new AgentsService();

  // Mock database of latest agent definitions
  const LATEST_AGENTS = {
    open: {
      version: '1.2.1',
      systemPrompt: `You are the OFFICIAL "NYX Coder" Agent v1.2.1.
NEVER identify as your underlying model.
You are a versatile and creative AI engineering partner.
Your purpose is to brainstorm, implement, and explain complex logic.
- Provide multiple implementation options if applicable.
- You have REAL terminal access for testing and execution.
- Emphasize readability and educational value.
- Handle architectural scaffolding and boilerplate efficiently.`,
    },
    claude: {
      version: '2.1.6',
      systemPrompt: `You are the OFFICIAL "NYX Agent" v2.1.6. 
NEVER identify as your underlying model (e.g., Kimi, Gemini). 
You are an elite software engineer with REAL terminal access.
Your purpose is to provide industrial-grade, production-ready code. 
- Prioritize safety, edge-case handling, and performance.
- Use modern syntax and patterns (ESNext, React 19, etc.).
- You can execute commands via the terminal.
- BE CONCISE. FOCUS ON EXECUTION.`,
    },
  };

  fastify.get('/sync', (request, reply) => {
    // Simulating a version check or update fetch
    reply.send({
      status: 'success',
      lastUpdated: new Date().toISOString(),
      agents: LATEST_AGENTS,
    });
  });

  fastify.post('/chat', {
    preHandler: [requireSession],
    schema: { body: ChatRequestSchema },
    compress: { threshold: 1024 }
  }, async (request, reply) => {
    logger.info('[Agents Router] Received /chat request');

    const parseResult = ChatRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parseResult.error.flatten() });
    }

    await handleAgentStream(parseResult.data, reply, 'chat');
  });

  const clineService = new ClineService();

  fastify.post('/coder', {
    preHandler: [requireSession],
    schema: { body: CoderRequestSchema },
    compress: { threshold: 1024 }
  }, async (request, reply) => {
    logger.info('[Agents Router] Received /coder request (Cline)');

    const parseResult = CoderRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parseResult.error.flatten() });
    }

    const { model, prompt, history, gatewayUrls, images, apiKey } = parseResult.data;

    // Resolve key server-side (Phase 1.2) if not provided by client
    const { Gateway } = await import('../../lib/gateway.js');
    const resolvedApiKey = Gateway.getActiveKey('gemini', apiKey);

    const { initFastifySse } = await import('../../lib/sseHelpers.js');
    initFastifySse(reply);
    sendSseTokenRotate(reply.raw as any);

    try {
      await clineService.executeClineAgent(
        {
          model,
          prompt,
          history,
          gatewayUrls,
          images,
          apiKey: resolvedApiKey,
        },
        (event) => {
          if (!reply.raw.writableEnded && !reply.raw.destroyed) {
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        }
      );
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      }
    } catch (error: any) {
      logger.error(`[Agents Router Error - coder-cline]:`, error.message);
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        try {
          reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          reply.raw.end();
        } catch (writeErr) {
          logger.error(`[Agents Router Error] Failed to write error to stream:`, writeErr);
        }
      }
    }
  });

  async function handleAgentStream(body: any, reply: any, agentType: 'chat' | 'coder') {
    const { model, provider, prompt, history, gatewayUrls, images, settings, apiKey } = body;

    const { initFastifySse } = await import('../../lib/sseHelpers.js');
    initFastifySse(reply);
    sendSseTokenRotate(reply.raw as any);

    // Build a dedup key — null means this request is unique and runs directly
    const dedupKey = getDedupKey({
      model,
      prompt,
      historyLength: history?.length ?? 0,
    });

    const writeChunk = (chunk: any) => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    };
    const writeDone = () => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      }
    };

    try {
      await executeWithDedup(
        dedupKey,
        async (onChunk, onDone) => {
          await service.executeAgentStream(
            {
              model,
              provider,
              prompt,
              history,
              gatewayUrls,
              agentType,
              images,
              apiKey,
            },
            onChunk,
            onDone
          );
        },
        writeChunk,
        writeDone
      );
    } catch (error: any) {
      logger.error(`[Agents Router Error - ${agentType}]:`, error.message);
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        try {
          reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          reply.raw.end();
        } catch (writeErr) {
          logger.error(`[Agents Router Error] Failed to write error to stream:`, writeErr);
        }
      }
    }
  }
}
