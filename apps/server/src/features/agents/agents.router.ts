import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { AgentsService } from './agents.service.js';
import { ClineService } from './cline.service.js';
import { sendSseTokenRotate, emitAgUiEvent, AgUiEvent } from '../../lib/sseHelpers.js';
import { AgentSafetyEnvelope } from '../../lib/agentSafety.js';
import logger from '../../lib/logger.js';

export const agentsRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
  // Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
  const router = agentsRouter;
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

  app.get('/sync', (request: FastifyRequest, reply: FastifyReply) => {
    // Simulating a version check or update fetch
    reply.send({
      status: 'success',
      lastUpdated: new Date().toISOString(),
      agents: LATEST_AGENTS,
    });
  });

  app.post('/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('[Agents Router] Received /chat request');
    handleAgentStream(request, reply, 'chat');
  });

  const clineService = new ClineService();

  app.post('/coder', async (request: FastifyRequest, reply: FastifyReply) => {
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
    sendSseTokenRotate(reply as any);

    // Instantiate safety envelope for this request
    const safety = new AgentSafetyEnvelope();

    // Emit RUN_STARTED
    emitAgUiEvent(reply, { type: 'run-started', timestamp: Date.now() });

    // Generate a message ID for this text message
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Emit TEXT_MESSAGE_START
    emitAgUiEvent(reply, { type: 'text-message-start', messageId, timestamp: Date.now() });

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
          // Call safety tick with the output (assuming event is a string or can be stringified)
          const output = typeof event === 'string' ? event : JSON.stringify(event);
          safety.tick(output, 0); // cost increment 0 for now; could be enhanced with token usage
          // Stream event back to the client as AG-UI TEXT_MESSAGE_CONTENT
          emitAgUiEvent(reply, { type: 'text-message-content', messageId, content: output, timestamp: Date.now() });
        }
      );
      // Emit RUN_FINISHED
      emitAgUiEvent(reply, { type: 'run-finished', timestamp: Date.now() });
      reply.raw.end();
    } catch (error: any) {
      logger.error({ err: error }, `[Agents Router Error - coder-cline]: ${error.message}`);
      // Check if it's a safety violation
      if (error.message.includes('Agent safety limit exceeded')) {
        // Emit RUN_ERROR with safety reason
        emitAgUiEvent(reply, { type: 'run-error', error: error.message, timestamp: Date.now() });
      } else {
        // Emit RUN_ERROR with original error
        emitAgUiEvent(reply, { type: 'run-error', error: error.message, timestamp: Date.now() });
      }
      reply.raw.end();
    }
  });

  async function handleAgentStream(request: any, reply: any, agentType: 'chat' | 'coder') {
    const { provider, model, prompt, history, apiKey, gatewayUrls, images } = (request.body as any) || {};

    if (!model) {
      // fallow-ignore-next-line code-duplication
      return reply.code(400).send({ error: 'Model is required' });
    }

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();
    sendSseTokenRotate(reply as any);

    // Instantiate safety envelope for this request
    const safety = new AgentSafetyEnvelope();

    // Emit RUN_STARTED
    emitAgUiEvent(reply, { type: 'run-started', timestamp: Date.now() });

    // Generate a message ID for this text message
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Emit TEXT_MESSAGE_START
    emitAgUiEvent(reply, { type: 'text-message-start', messageId, timestamp: Date.now() });

    try {
      await service.executeAgentStream(
        {
          provider,
          model,
          prompt,
          history,
          apiKey,
          gatewayUrls,
          agentType,
          images,
        },
        (chunk) => {
          // Call safety tick with the chunk
          const output = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
          safety.tick(output, 0); // cost increment 0 for now
          // Stream chunk back to the client as AG-UI TEXT_MESSAGE_CONTENT
          emitAgUiEvent(reply, { type: 'text-message-content', messageId, content: output, timestamp: Date.now() });
        },
        () => {
          // Emit RUN_FINISHED
          emitAgUiEvent(reply, { type: 'run-finished', timestamp: Date.now() });
          reply.raw.end();
        }
      );
    } catch (error: any) {
      logger.error({ err: error }, `[Agents Router Error - ${agentType}]: ${error.message}`);
      // Check if it's a safety violation
      if (error.message.includes('Agent safety limit exceeded')) {
        // Emit RUN_ERROR with safety reason
        emitAgUiEvent(reply, { type: 'run-error', error: error.message, timestamp: Date.now() });
      } else {
        // Emit RUN_ERROR with original error
        emitAgUiEvent(reply, { type: 'run-error', error: error.message, timestamp: Date.now() });
      }
      reply.raw.end();
    }
  }


}

};