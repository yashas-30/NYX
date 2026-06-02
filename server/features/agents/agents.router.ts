import { Router } from 'express';
import { AgentsService } from './agents.service.ts';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import logger from '../../lib/logger.ts';

export const agentsRouter = Router();
const service = new AgentsService();

// Mock database of latest agent definitions
const LATEST_AGENTS = {
  open: {
    version: '1.2.1',
    systemPrompt: `You are the OFFICIAL "OpenCode" Agent v1.2.1.
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
    systemPrompt: `You are the OFFICIAL "Claude Code" Agent v2.1.6. 
NEVER identify as your underlying model (e.g., Kimi, Gemini). 
You are an elite software engineer with REAL terminal access.
Your purpose is to provide industrial-grade, production-ready code. 
- Prioritize safety, edge-case handling, and performance.
- Use modern syntax and patterns (ESNext, React 19, etc.).
- You can execute commands via the terminal.
- BE CONCISE. FOCUS ON EXECUTION.`,
  },
};

agentsRouter.get('/sync', (req, res) => {
  // Simulating a version check or update fetch
  res.json({
    status: 'success',
    lastUpdated: new Date().toISOString(),
    agents: LATEST_AGENTS,
  });
});

agentsRouter.post('/chat', async (req, res) => {
  logger.info('[Agents Router] Received /chat request');
  handleAgentStream(req, res, 'chat');
});

agentsRouter.post('/coder', async (req, res) => {
  logger.info('[Agents Router] Received /coder request');
  handleAgentStream(req, res, 'coder');
});

async function handleAgentStream(req: any, res: any, agentType: 'chat' | 'coder') {
  const { model, prompt, history, apiKey, gatewayUrls, images } = req.body || {};

  if (!model) {
    return res.status(400).json({ error: 'Model is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  sendSseTokenRotate(res);

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
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      },
      () => {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    );
  } catch (error: any) {
    logger.error(`[Agents Router Error - ${agentType}]:`, error.message);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}
