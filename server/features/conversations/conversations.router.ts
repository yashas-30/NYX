import { Router } from 'express';
import { ConversationStore, FolderStore } from './conversations.service.ts';

function getAgentType(req: any): 'chat' | 'code' {
  const t = req.query.agentType;
  return t === 'coder' || t === 'code' ? 'code' : 'chat';
}

export const conversationsRouter = Router();

// Folders routes
conversationsRouter.get('/folders', (req, res) => {
  try {
    res.json(FolderStore.list());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.post('/folders', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const id = FolderStore.create(name);
    res.json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.put('/folders/:id', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const ok = FolderStore.update(req.params.id, name);
    if (!ok) return res.status(404).json({ error: 'Folder not found' });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.delete('/folders/:id', (req, res) => {
  try {
    const ok = FolderStore.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Folder not found' });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.get('/', (req, res) => {
  try {
    const agentType = getAgentType(req);
    res.json(ConversationStore.list(agentType));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.get('/share/:shareId', (req, res) => {
  try {
    const c = ConversationStore.getByShareId(req.params.shareId);
    if (c) {
      res.json(c);
    } else {
      res.status(404).json({ error: 'Shared conversation not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.post('/:id/share', (req, res) => {
  try {
    const agentType = getAgentType(req);
    const shareId = ConversationStore.generateShareId(req.params.id, agentType);
    res.json({ shareId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.get('/:id', (req, res) => {
  try {
    const agentType = getAgentType(req);
    const c = ConversationStore.get(req.params.id, agentType);
    if (c) {
      res.json(c);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.post('/', (req, res) => {
  try {
    const agentType = getAgentType(req);
    ConversationStore.upsert(req.body, agentType);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.delete('/:id', (req, res) => {
  try {
    const agentType = getAgentType(req);
    ConversationStore.delete(req.params.id, agentType);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.delete('/', (req, res) => {
  try {
    const agentType = getAgentType(req);
    ConversationStore.clear(agentType);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

conversationsRouter.get('/:id/export', (req, res) => {
  try {
    const agentType = getAgentType(req);
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
