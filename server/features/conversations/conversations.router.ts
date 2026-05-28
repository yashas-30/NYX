import { Router } from 'express';
import { ConversationStore } from './conversations.service.ts';

export const conversationsRouter = Router();

conversationsRouter.get('/', (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'chat';
    res.json(ConversationStore.list(agentType));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

conversationsRouter.get('/:id', (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'chat';
    const c = ConversationStore.get(req.params.id, agentType);
    if (c) {
      res.json(c);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

conversationsRouter.post('/', (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'chat';
    ConversationStore.upsert(req.body, agentType);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

conversationsRouter.delete('/:id', (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'chat';
    ConversationStore.delete(req.params.id, agentType);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

conversationsRouter.delete('/', (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'chat';
    ConversationStore.clear(agentType);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

conversationsRouter.get('/:id/export', (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'chat';
    const c = ConversationStore.get(req.params.id, agentType);
    if (!c) {
      return res.status(404).json({ error: 'Not found' });
    }

    const format = ((req.query.format as string) || 'json').toLowerCase();

    if (format === 'markdown' || format === 'md') {
      let md = `# NYX Chat Export\n\n`;
      md += `**Title:** ${c.title}\n`;
      md += `**Model:** ${c.model}\n`;
      md += `**Date:** ${new Date(c.createdAt).toLocaleString()}\n\n`;
      md += `---\n\n`;

      for (const msg of c.messages) {
        const roleName = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
        md += `### ${roleName} (${new Date(msg.timestamp).toLocaleTimeString()})\n\n`;
        md += `${msg.content}\n\n`;
        md += `---\n\n`;
      }

      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="nyx-chat-${c.id}.md"`);
      return res.send(md);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="nyx-chat-${c.id}.json"`);
      return res.json(c);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
