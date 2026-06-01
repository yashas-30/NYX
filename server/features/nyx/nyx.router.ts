import logger from '../../lib/logger.ts';
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
import { MemoryService } from './memory.service.ts';

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
  } catch (error: any) {
    logger.error('[Nyx Router] Failed to fetch rules:', error);
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    logger.error('[Nyx Router] Failed to reset rules:', error);
    res.status(500).json({ error: error.message });
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
    } catch (criticError: any) {
      logger.error('[Nyx Critic Layer Error]:', criticError);
    }
  });
});

// ── Search Endpoints ───────────────────────────────────────────────────────────

// GET /api/nyx/search/backends
nyxRouter.get('/search/backends', (_req, res) => {
  try {
    res.json({ success: true, ...searchService.getSearchBackends() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    logger.error('[Nyx Router] Codebase search failed:', error);
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    logger.error('[Nyx Router] Web search route handler failed:', error);
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    logger.error('[File System Error]:', error.message);
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    logger.error('[Nyx Router] read-file failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nyx/list-directory
nyxRouter.post('/list-directory', async (req, res) => {
  try {
    const { dirPath } = req.body as { dirPath?: string };
    const files = filesystemService.listDirectory(dirPath);
    res.json({ success: true, files });
  } catch (error: any) {
    logger.error('[Nyx Router] list-directory failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Git Endpoints ──────────────────────────────────────────────────────────────

// POST /api/nyx/git-diff
nyxRouter.post('/git-diff', async (req, res) => {
  try {
    const { filePath } = req.body as { filePath?: string };
    const diff = await gitService.getDiff(filePath);
    res.json({ success: true, diff });
  } catch (error: any) {
    logger.error('[Nyx Router] git-diff failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nyx/git-status
nyxRouter.post('/git-status', async (req, res) => {
  try {
    const status = await gitService.getStatus();
    res.json({ success: true, status });
  } catch (error: any) {
    logger.error('[Nyx Router] git-status failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Intelligence Endpoints ───────────────────────────────────────────────────────

// POST /api/nyx/claude-md-hierarchy
nyxRouter.post('/claude-md-hierarchy', async (req, res) => {
  try {
    const { rootPath, currentFile } = req.body as { rootPath?: string; currentFile?: string };
    if (!rootPath) {
      return res.status(400).json({ error: 'rootPath is required' });
    }
    const fs = await import('fs');
    const path = await import('path');

    const files: any[] = [];
    const targetNames = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md', 'DESIGN.md', '.claude.md'];

    // 1. Scan root directory
    for (const name of targetNames) {
      const fullPath = path.join(rootPath, name);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          const content = fs.readFileSync(fullPath, 'utf8');
          files.push({
            path: name,
            level: name === 'CLAUDE.md' ? 'global' : 'project',
            content,
            lastModified: stats.mtime.toISOString(),
          });
        }
      }
    }

    // 2. Scan subdirectories up to the currentFile if provided
    if (currentFile && currentFile.startsWith(rootPath)) {
      let currentDir = path.dirname(currentFile);
      // Traverse up to rootPath
      while (currentDir.length >= rootPath.length && currentDir !== rootPath) {
        for (const name of targetNames) {
          const fullPath = path.join(currentDir, name);
          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
              const content = fs.readFileSync(fullPath, 'utf8');
              const relPath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
              files.push({
                path: relPath,
                level: 'directory',
                content,
                lastModified: stats.mtime.toISOString(),
              });
            }
          }
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break;
        currentDir = parentDir;
      }
    }

    res.json({ files });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nyx/memory-index
nyxRouter.post('/memory-index', async (req, res) => {
  try {
    const codeMemories = MemoryService.getMemories('code');
    const chatMemories = MemoryService.getMemories('chat');
    const allMemories = [...codeMemories, ...chatMemories];
    const mapped = allMemories.map((m) => {
      let type: 'user' | 'feedback' | 'project' | 'reference' = 'project';
      if (m.category === 'user_preference') type = 'user';
      else if (m.category === 'project_fact') type = 'project';
      else if (m.category === 'decision') type = 'reference';
      else if (m.category === 'summary') type = 'feedback';
      return {
        id: m.id,
        type,
        content: m.content,
        timestamp: new Date(m.timestamp).toISOString(),
        tags: [m.category, m.agentType || 'code'].filter(Boolean) as string[],
        sourceFile: undefined,
      };
    });
    res.json({ entries: mapped });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nyx/keyword-index
nyxRouter.post('/keyword-index', async (req, res) => {
  try {
    const { rootPath } = req.body as { rootPath?: string };
    if (!rootPath) {
      return res.status(400).json({ error: 'rootPath is required' });
    }
    const fs = await import('fs');
    const path = await import('path');

    const snippets: any[] = [];
    const EXCLUDE_DIRS = new Set([
      'node_modules',
      '.git',
      '.nyx-cache',
      '.stitch',
      '.agents',
      '.antigravitycli',
      '.claude',
      '.vscode',
      'dist',
      'dist-server',
      'dist-desktop',
      'public',
      'graphify-out',
      'scratch',
    ]);
    const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']);

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const relPath = path.relative(rootPath!, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (!EXCLUDE_DIRS.has(file)) {
            scanDir(fullPath);
          }
        } else {
          const ext = path.extname(file).toLowerCase();
          if (ALLOWED_EXTENSIONS.has(ext)) {
            parseFile(fullPath, relPath);
          }
        }
      }
    }

    function parseFile(filePath: string, relPath: string) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let match = line.match(/(?:export\s+)?class\s+(\w+)/);
          if (match) {
            snippets.push(createSnippet(relPath, match[1], 'class', i + 1, lines));
            continue;
          }
          match = line.match(/(?:export\s+)?function\s+(\w+)/);
          if (match) {
            snippets.push(createSnippet(relPath, match[1], 'function', i + 1, lines));
            continue;
          }
          match = line.match(/(?:export\s+)?interface\s+(\w+)/);
          if (match) {
            snippets.push(createSnippet(relPath, match[1], 'interface', i + 1, lines));
            continue;
          }
          match = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
          if (match) {
            snippets.push(createSnippet(relPath, match[1], 'type', i + 1, lines));
            continue;
          }
        }
      } catch {}
    }

    function createSnippet(
      relPath: string,
      name: string,
      type: string,
      lineNum: number,
      lines: string[]
    ) {
      const startLine = Math.max(1, lineNum - 1);
      const endLine = Math.min(lines.length, lineNum + 8);
      const snippetContent = lines.slice(startLine - 1, endLine).join('\n');
      return {
        id: `sem_${relPath.replace(/\//g, '_')}_${lineNum}`,
        filePath: relPath,
        content: snippetContent,
        startLine,
        endLine,
        metadata: {
          type,
          name,
          signature: lines[lineNum - 1].trim(),
          dependencies: [],
        },
      };
    }

    scanDir(rootPath);
    res.json({ snippets: snippets.slice(0, 500) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Workspace Endpoints ────────────────────────────────────────────────────────

// GET /api/nyx/workspace-profile
nyxRouter.get('/workspace-profile', async (req, res) => {
  try {
    const profile = await workspaceService.getProfile();
    res.json({ success: true, profile });
  } catch (error: any) {
    logger.error('[Nyx Router] Failed to fetch workspace profile:', error);
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    logger.error('[Nyx Router] Failed to update/fetch workspace profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nyx/validate
nyxRouter.post('/validate', async (req, res) => {
  try {
    const result = await workspaceService.validateWorkspace();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/nyx/memory
nyxRouter.get('/memory', async (req, res) => {
  try {
    const agentType = (req.query.agentType as 'chat' | 'code') || 'code';
    res.json({ success: true, memories: MemoryService.getMemories(agentType) });
  } catch (error: any) {
    logger.error('[Nyx Router] Failed to fetch memories:', error);
    res.status(500).json({ error: error.message });
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
      const targetAgentType = agentType || 'code';
      await MemoryService.runBackgroundMemoryKeeper(
        prompt,
        response,
        modelId,
        provider,
        targetAgentType
      );
    } catch (memoryError: any) {
      logger.error('[Nyx Memory Keeper Layer Error]:', memoryError);
    }
  });
});

// POST /api/nyx/memory/reset
nyxRouter.post('/memory/reset', async (req, res) => {
  try {
    const agentType = req.query.agentType as 'chat' | 'code' | undefined;
    MemoryService.resetMemories(agentType);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('[Nyx Router] Failed to reset memories:', error);
    res.status(500).json({ error: error.message });
  }
});
