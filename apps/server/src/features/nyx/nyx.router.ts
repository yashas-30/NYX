import logger from '../../lib/logger.js';
import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../middleware/validate.js';
import {
  writeFileSchema,
  writeFilesSchema,
  readFileSchema,
  listDirSchema,
  executeSchema,
  nyxCriticSchema,
  nyxSearchSchema,
  codebaseSearchSchema,
} from './nyx.schema.js';

import { AgentService } from './agent.service.js';
import { TerminalService } from '../terminal/terminal.service.js';
import { SearchService } from './search.service.js';
import { FilesystemService } from './filesystem.service.js';
import { GitService } from './git.service.js';
import { WorkspaceService } from './workspace.service.js';
import { MemoryService } from './memory.service.js';

export const nyxRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = nyxRouter;
  const agentService = new AgentService();
  const searchService = new SearchService();
  const filesystemService = new FilesystemService();
  const gitService = new GitService();
  const workspaceService = new WorkspaceService();

  // GET /api/nyx/health
  app.get('/health', async (_request, reply) => {
    reply.send({ status: 'ok', timestamp: Date.now() });
  });

  // ── Agent/Critic Endpoints ─────────────────────────────────────────────────────

  // POST /api/nyx/subagent-status
  // fallow-ignore-next-line code-duplication
  app.post('/subagent-status', (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers['x-nyx-session-token'] as string | undefined;
      if (!token) {
        return reply.code(401).send({ error: 'Missing x-nyx-session-token header' });
      }
      const { tasks } = request.body as { tasks?: unknown[] };
      if (!Array.isArray(tasks)) {
        return reply.code(400).send({ error: 'tasks must be an array' });
      }
      agentService.setSubagentStatus(token, tasks);
      // fallow-ignore-next-line code-duplication
      reply.send({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      reply.code(500).send({ error: msg });
    }
  });

  // GET /api/nyx/subagent-status
  // fallow-ignore-next-line code-duplication
  app.get('/subagent-status', (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers['x-nyx-session-token'] as string | undefined;
      if (!token) {
        return reply.code(401).send({ error: 'Missing x-nyx-session-token header' });
      }
      const tasks = agentService.getSubagentStatus(token);
      // fallow-ignore-next-line code-duplication
      reply.send({ success: true, tasks });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      reply.code(500).send({ error: msg });
    }
  });

  // GET /api/nyx/rules
  app.get('/rules', (_req, reply) => {
    try {
      const rules = agentService.getRules();
      reply.send({ success: true, rules });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to fetch rules:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/reset
  app.post('/reset', (request: FastifyRequest, reply: FastifyReply) => {
    if ((request.body as any)?.confirm !== true) {
      return reply.code(400).send({ error: 'Must pass { confirm: true } to reset rules.' });
    }
    try {
      agentService.resetRules();
      reply.send({ success: true });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to reset rules:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/critic
  app.post('/critic', { preHandler: [validate(nyxCriticSchema)] },
    (request: FastifyRequest, reply: FastifyReply) => {
      const { prompt, response, modelId, provider } = request.body as any;
      if (!prompt || !response) {
        return reply.code(400).send({ error: 'Missing prompt or response for critic.' });
      }
      reply.send({ success: true, processing: true });
      setImmediate(async () => {
        try {
          await agentService.runBackgroundCritic(prompt, response, modelId, provider);
        } catch (criticError: any) {
          logger.error('[Nyx Critic Layer Error]:', criticError);
        }
      });
    }
  );

  // ── Search Endpoints ───────────────────────────────────────────────────────────

  // GET /api/nyx/search/backends
  app.get('/search/backends', (_req, reply) => {
    try {
      reply.send({ success: true, ...searchService.getSearchBackends() });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/codebase-search
  app.post('/codebase-search', { preHandler: [validate(codebaseSearchSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { query } = request.body as any;
      if (!query) {
        return reply.code(400).send({ error: 'Missing query parameters for codebase search.' });
      }
      try {
        const result = await searchService.codebaseSearch(query);
        reply.send({ success: true, ...result });
      } catch (error: any) {
        logger.error('[Nyx Router] Codebase search failed:', error);
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // POST /api/nyx/search
  app.post('/search', { preHandler: [validate(nyxSearchSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { query } = request.body as any;
      if (!query) {
        return reply.code(400).send({ error: 'Missing query parameters for search.' });
      }
      try {
        const results = await searchService.performWebSearch(query);
        reply.send({ success: true, results });
      } catch (error: any) {
        logger.error('[Nyx Router] Web search route handler failed:', error);
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // GET /api/nyx/search/history
  app.get('/search/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { db } = await import('../../db/client.js');
      const { searchQueries, searchResults } = await import('../../db/schema.js');
      const { desc, eq } = await import('drizzle-orm');

      const recentQueries = await db
        .select()
        .from(searchQueries)
        .orderBy(desc(searchQueries.timestamp))
        .limit(50);

      const history = [];
      for (const q of recentQueries) {
        const results = await db
          .select()
          .from(searchResults)
          .where(eq(searchResults.queryId, q.id))
          .orderBy(searchResults.rank);
        history.push({ ...q, results });
      }

      reply.send({ success: true, history });
    } catch (error: any) {
      logger.error('[Nyx Router] Web search history route failed:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/prompt-feedback
  app.post('/prompt-feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { optimizationId, rating } = request.body as any;
    if (!optimizationId || typeof rating !== 'number') {
      return reply.code(400).send({ error: 'Missing optimizationId or rating.' });
    }
    try {
      const { db } = await import('../../db/client.js');
      const { promptOptimizations } = await import('../../db/schema.js');
      const { eq } = await import('drizzle-orm');
      await db
        .update(promptOptimizations)
        .set({ rating })
        .where(eq(promptOptimizations.id, optimizationId));
      reply.send({ success: true });
    } catch (error: any) {
      logger.error('[Nyx Router] Prompt feedback failed:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // ── Filesystem Endpoints ───────────────────────────────────────────────────────

  // POST /api/nyx/write-file
  app.post('/write-file', { preHandler: [validate(writeFileSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { filePath, content, overwrite } = request.body as any;
      try {
        const result = await filesystemService.writeFile(filePath, content, overwrite);
        if (result.conflict) {
          return reply.code(409).send(result);
        }
        reply.send(result);
      } catch (error: any) {
        logger.error('[File System Error]:', error.message);
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // POST /api/nyx/write-files
  app.post('/write-files', { preHandler: [validate(writeFilesSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { files } = request.body as any;
      try {
        const results = [];
        for (const file of files) {
          try {
            const result = await filesystemService.writeFile(file.filePath, file.content, file.overwrite);
            if (result.conflict) {
              return reply.code(409).send(result);
            }
            results.push(result);
          } catch (err: any) {
            results.push({ success: false, path: file.filePath, error: err.message });
          }
        }
        reply.send({ success: true, results });
      } catch (error: any) {
        logger.error('[File System Error - Batch]:', error.message);
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // POST /api/nyx/read-file
  app.post(
    '/read-file',
    { preHandler: [validate(readFileSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { filePath, startLine, endLine } = request.body as any;
        const content = await filesystemService.readFile(filePath, startLine, endLine);
        reply.send({ success: true, content });
      } catch (error: any) {
        logger.error('[Nyx Router] read-file failed:', error);
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // POST /api/nyx/list-dir
  app.post(
    '/list-dir',
    { preHandler: [validate(listDirSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { dirPath } = request.body as any;
        const rawFiles = filesystemService.listDirectory(dirPath);
        // Map to the exact format expected by the frontend
        const path = (await import('path')).default;
        const files = rawFiles.map((f: any) => ({
          name: f.name,
          isDirectory: f.isDir,
          isFile: !f.isDir,
          path: path.join(dirPath || '.', f.name).replace(/\\/g, '/')
        }));
        reply.send({ success: true, files });
      } catch (error: any) {
        logger.error('[Nyx Router] list-dir failed:', error);
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // ── Git Endpoints migrated to git.router.ts ──────────────────────────────────


  // POST /api/nyx/claude-md-hierarchy
  app.post('/claude-md-hierarchy', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { rootPath, currentFile } = request.body as { rootPath?: string; currentFile?: string };
      if (!rootPath) {
        return reply.code(400).send({ error: 'rootPath is required' });
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

      reply.send({ files });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/memory-index
  app.post('/memory-index', async (request: FastifyRequest, reply: FastifyReply) => {
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
      reply.send({ entries: mapped });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/keyword-index
  app.post('/keyword-index', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { rootPath } = request.body as { rootPath?: string };
      if (!rootPath) {
        return reply.code(400).send({ error: 'rootPath is required' });
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
      reply.send({ snippets: snippets.slice(0, 500) });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // ── Command Execution ──────────────────────────────────────────────────────────
  
  // POST /api/nyx/execute
  app.post('/execute', { preHandler: [validate(executeSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { command, cwd } = request.body as any;
      const { child, error } = await TerminalService.spawn(command, cwd);
      
      if (error) {
        return reply.code(400).send({ error });
      }
      
      if (!child) {
        return reply.code(500).send({ error: 'Failed to initialize sandboxed process' });
      }
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        reply.send({ exitCode: code, stdout, stderr });
      });
      
      child.on('error', (err) => {
        reply.code(500).send({ error: err.message, stdout, stderr });
      });
    }
  );

  // ── Workspace Endpoints ────────────────────────────────────────────────────────

  // GET /api/nyx/workspace-profile
  app.get('/workspace-profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const profile = await workspaceService.getProfile();
      reply.send({ success: true, profile });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to fetch workspace profile:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/workspace-profile
  app.post('/workspace-profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { openFiles } = request.body as { openFiles?: string[] };
      if (openFiles && Array.isArray(openFiles)) {
        workspaceService.trackOpenFiles(openFiles);
      }
      const profile = await workspaceService.getProfile();
      reply.send({ success: true, profile });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to update/fetch workspace profile:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/validate
  app.post('/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await workspaceService.validateWorkspace();
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // GET /api/nyx/memory
  app.get('/memory', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agentType = ((request.query as any).agentType as 'chat' | 'code') || 'code';
      reply.send({ success: true, memories: MemoryService.getMemories(agentType) });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to fetch memories:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/memory/commit
  app.post('/memory/commit', (request: FastifyRequest, reply: FastifyReply) => {
    const { prompt, response, modelId, provider, agentType } = request.body as any;
    if (!prompt || !response) {
      return reply.code(400).send({ error: 'Missing prompt or response.' });
    }
    reply.send({ success: true, processing: true });
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
  app.post('/memory/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agentType = (request.query as any).agentType as 'chat' | 'code' | undefined;
      MemoryService.resetMemories(agentType);
      reply.send({ success: true });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to reset memories:', error);
      reply.code(500).send({ error: error.message });
    }
  });


}

};
