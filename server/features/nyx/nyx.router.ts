import { Router } from 'express';
import { validate } from '../../middleware/validate.ts';
import {
  writeFileSchema,
  nyxCriticSchema,
  nyxSearchSchema,
  codebaseSearchSchema,
} from './nyx.schema.ts';

import { AgentService } from './agent.service.ts';
import { SearchService } from './search.service.ts';
import { FilesystemService } from './filesystem.service.ts';
import { GitService } from './git.service.ts';
import { WorkspaceService } from './workspace.service.ts';

export const nyxRouter = Router();

const agentService = new AgentService();
const searchService = new SearchService();
const filesystemService = new FilesystemService();
const gitService = new GitService();
const workspaceService = new WorkspaceService();

// ── Agent/Critic Endpoints ─────────────────────────────────────────────────────

// POST /api/nyx/subagent-status
nyxRouter.post('/subagent-status', (req, res) => {
  try {
    const token = req.headers['x-nyx-session-token'] as string | undefined;
    if (!token) {
      return res.status(401).json({ error: 'Missing x-nyx-session-token header' });
    }
    const { tasks } = req.body as { tasks?: unknown[] };
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'tasks must be an array' });
    }
    agentService.setSubagentStatus(token, tasks);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// GET /api/nyx/subagent-status
nyxRouter.get('/subagent-status', (req, res) => {
  try {
    const token = req.headers['x-nyx-session-token'] as string | undefined;
    if (!token) {
      return res.status(401).json({ error: 'Missing x-nyx-session-token header' });
    }
    const tasks = agentService.getSubagentStatus(token);
    res.json({ success: true, tasks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// GET /api/nyx/rules
nyxRouter.get('/rules', (_req, res) => {
  try {
    const rules = agentService.getRules();
    res.json({ success: true, rules });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to fetch rules:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/reset
nyxRouter.post('/reset', (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: 'Must pass { confirm: true } to reset rules.' });
  }
  try {
    agentService.resetRules();
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to reset rules:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/critic
nyxRouter.post('/critic', validate(nyxCriticSchema), (req, res) => {
  const { prompt, response, modelId, provider } = req.body;
  if (!prompt || !response) {
    return res.status(400).json({ error: 'Missing prompt or response for critic.' });
  }
  res.json({ success: true, processing: true });
  setImmediate(async () => {
    try {
      await agentService.runBackgroundCritic(prompt, response, modelId, provider);
    } catch (criticError) {
      console.error('[Nyx Critic Layer Error]:', criticError);
    }
  });
});

// ── Search Endpoints ───────────────────────────────────────────────────────────

// GET /api/nyx/search/backends
nyxRouter.get('/search/backends', (_req, res) => {
  try {
    res.json({ success: true, ...searchService.getSearchBackends() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/codebase-search
nyxRouter.post('/codebase-search', validate(codebaseSearchSchema), async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameters for codebase search.' });
  }
  try {
    const result = await searchService.codebaseSearch(query);
    res.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[Nyx Router] Codebase search failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/search
nyxRouter.post('/search', validate(nyxSearchSchema), async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameters for search.' });
  }
  try {
    const results = await searchService.performWebSearch(query);
    res.json({ success: true, results });
  } catch (e: any) {
    console.error('[Nyx Router] Web search route handler failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Filesystem Endpoints ───────────────────────────────────────────────────────

// POST /api/nyx/write-file
nyxRouter.post('/write-file', validate(writeFileSchema), async (req, res) => {
  const { filePath, content, overwrite } = req.body;
  try {
    const result = await filesystemService.writeFile(filePath, content, overwrite);
    if (result.conflict) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (e: any) {
    console.error('[File System Error]:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/read-file
nyxRouter.post('/read-file', async (req, res) => {
  try {
    const { filePath, startLine, endLine } = req.body as {
      filePath: string;
      startLine?: number;
      endLine?: number;
    };
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }
    const content = await filesystemService.readFile(filePath, startLine, endLine);
    res.json({ success: true, content });
  } catch (e: any) {
    console.error('[Nyx Router] read-file failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/list-directory
nyxRouter.post('/list-directory', async (req, res) => {
  try {
    const { dirPath } = req.body as { dirPath?: string };
    const files = filesystemService.listDirectory(dirPath);
    res.json({ success: true, files });
  } catch (e: any) {
    console.error('[Nyx Router] list-directory failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Git Endpoints ──────────────────────────────────────────────────────────────

// POST /api/nyx/git-diff
nyxRouter.post('/git-diff', async (req, res) => {
  try {
    const { filePath } = req.body as { filePath?: string };
    const diff = await gitService.getDiff(filePath);
    res.json({ success: true, diff });
  } catch (e: any) {
    console.error('[Nyx Router] git-diff failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/git-status
nyxRouter.post('/git-status', async (req, res) => {
  try {
    const status = await gitService.getStatus();
    res.json({ success: true, status });
  } catch (e: any) {
    console.error('[Nyx Router] git-status failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Workspace Endpoints ────────────────────────────────────────────────────────

// GET /api/nyx/workspace-profile
nyxRouter.get('/workspace-profile', async (req, res) => {
  try {
    const profile = await workspaceService.getProfile();
    res.json({ success: true, profile });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to fetch workspace profile:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/workspace-profile
nyxRouter.post('/workspace-profile', async (req, res) => {
  try {
    const { openFiles } = req.body as { openFiles?: string[] };
    if (openFiles && Array.isArray(openFiles)) {
      workspaceService.trackOpenFiles(openFiles);
    }
    const profile = await workspaceService.getProfile();
    res.json({ success: true, profile });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to update/fetch workspace profile:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/validate
nyxRouter.post('/validate', async (req, res) => {
  try {
    const result = await workspaceService.validateWorkspace();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/nyx/memory
nyxRouter.get('/memory', async (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'code';
    const { MemoryService } = await import('./memory.service.ts');
    res.json({ success: true, memories: MemoryService.getMemories(agentType) });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to fetch memories:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/memory/commit
nyxRouter.post('/memory/commit', (req, res) => {
  const { prompt, response, modelId, provider, agentType } = req.body;
  if (!prompt || !response) {
    return res.status(400).json({ error: 'Missing prompt or response.' });
  }
  res.json({ success: true, processing: true });
  setImmediate(async () => {
    try {
      const { MemoryService } = await import('./memory.service.ts');
      const targetAgentType = agentType || 'code';
      await MemoryService.runBackgroundMemoryKeeper(
        prompt,
        response,
        modelId,
        provider,
        targetAgentType
      );
    } catch (memoryError) {
      console.error('[Nyx Memory Keeper Layer Error]:', memoryError);
    }
  });
});

// POST /api/nyx/memory/reset
nyxRouter.post('/memory/reset', async (req, res) => {
  try {
    const agentType = req.query.agentType as 'chat' | 'code' | undefined;
    const { MemoryService } = await import('./memory.service.ts');
    MemoryService.resetMemories(agentType);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to reset memories:', e);
    res.status(500).json({ error: e.message });
  }
});
