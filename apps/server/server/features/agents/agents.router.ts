import { FastifyInstance } from 'fastify';
import { AgentsService } from './agents.service.js';
import { ClineService } from './cline.service.js';
import { sendSseTokenRotate } from '../../lib/sseHelpers.js';
import logger from '../../lib/logger.js';

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

  fastify.post('/chat', async (request, reply) => {
    logger.info('[Agents Router] Received /chat request');
    handleAgentStream(request, reply, 'chat');
  });

  const clineService = new ClineService();

  fastify.post('/coder', async (request, reply) => {
    logger.info('[Agents Router] Received /coder request (Cline)');
    const { model, prompt, history, apiKey, gatewayUrls, images } = (request.body as any) || {};

    if (!model) {
      return reply.code(400).send({ error: 'Model is required' });
    }

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();
    sendSseTokenRotate(reply.raw as any);

    try {
      await clineService.executeClineAgent(
        {
          model,
          prompt,
          history,
          apiKey,
          gatewayUrls,
          images,
        },
        (event) => {
          // Stream event back to the client
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      );
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (error: any) {
      logger.error(`[Agents Router Error - coder-cline]:`, error.message);
      reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      reply.raw.end();
    }
  });

  async function handleAgentStream(request: any, reply: any, agentType: 'chat' | 'coder') {
    const { model, prompt, history, apiKey, gatewayUrls, images } = (request.body as any) || {};

    if (!model) {
      // fallow-ignore-next-line code-duplication
      return reply.code(400).send({ error: 'Model is required' });
    }

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();
    sendSseTokenRotate(reply.raw as any);

    try {
      await service.executeAgentStream(
        {
          model,
          prompt,
          history,
          apiKey,
          gatewayUrls,
          agentType,
          images,
        },
        (chunk) => {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        },
        () => {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      );
    } catch (error: any) {
      logger.error(`[Agents Router Error - ${agentType}]:`, error.message);
      reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      reply.raw.end();
    }
  }
}
