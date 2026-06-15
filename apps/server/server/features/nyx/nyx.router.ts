import logger from '../../lib/logger.js';
import { FastifyInstance } from 'fastify';
import { validate } from '../../middleware/validate.js';
import {
  writeFileSchema,
  nyxCriticSchema,
  nyxSearchSchema,
} from './nyx.schema.js';

import { AgentService } from './agent.service.js';
import { SearchService } from './search.service.js';
import { FilesystemService } from './filesystem.service.js';
import { GitService } from './git.service.js';
import { WorkspaceService } from './workspace.service.js';
import { MemoryService } from './memory.service.js';
import { criticQueue, fileWriteQueue } from '../../queues/index.js';

export async function nyxRouter(fastify: FastifyInstance) {
  const agentService = new AgentService();
  const searchService = new SearchService();
  const filesystemService = new FilesystemService();
  const gitService = new GitService();
  const workspaceService = new WorkspaceService();

  // ── Agent/Critic Endpoints ─────────────────────────────────────────────────────

  // POST /api/nyx/subagent-status
  // fallow-ignore-next-line code-duplication
  fastify.post('/subagent-status', (request, reply) => {
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
  fastify.get('/subagent-status', (request, reply) => {
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
  fastify.get('/rules', async (_req, reply) => {
    try {
      const rules = await agentService.getRules();
      reply.send({ success: true, rules });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to fetch rules:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/reset
  fastify.post('/reset', async (request, reply) => {
    if ((request.body as any)?.confirm !== true) {
      return reply.code(400).send({ error: 'Must pass { confirm: true } to reset rules.' });
    }
    try {
      await agentService.resetRules();
      reply.send({ success: true });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to reset rules:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/critic
  fastify.post(
    '/critic',
    {
      preHandler: [validate(nyxCriticSchema)],
    },
    async (request, reply) => {
      const { prompt, response, modelId, provider, apiKey } = request.body as any;
      if (!prompt || !response) {
        return reply.code(400).send({ error: 'Missing prompt or response for critic.' });
      }
      
      const job = await criticQueue!.add('critic-job', {
        prompt,
        response,
        modelId,
        provider,
        apiKey
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      });

      reply.send({ success: true, jobId: job.id });
    }
  );

  // GET /api/nyx/critic/stream
  fastify.get('/critic/stream', async (request, reply) => {
    const { initFastifySse } = await import('../../lib/sseHelpers.js');
    initFastifySse(reply);
    
    const { QueueEvents } = await import('bullmq');
    const queueEvents = new QueueEvents('critic-queue', {
      connection: criticQueue!.opts.connection
    });

    const onProgress = ({ jobId, data }: { jobId: string; data: any }) => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'progress', jobId, data })}\n\n`);
      if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
    };

    const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'completed', jobId, result: returnvalue })}\n\n`);
      if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
    };

    const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'failed', jobId, error: failedReason })}\n\n`);
      if (typeof (reply.raw as any).flush === 'function') (reply.raw as any).flush();
    };

    queueEvents.on('progress', onProgress);
    queueEvents.on('completed', onCompleted);
    queueEvents.on('failed', onFailed);

    request.raw.on('close', () => {
      queueEvents.off('progress', onProgress);
      queueEvents.off('completed', onCompleted);
      queueEvents.off('failed', onFailed);
      queueEvents.close();
    });
  });

  // ── Search Endpoints ───────────────────────────────────────────────────────────

  // GET /api/nyx/search/backends
  fastify.get('/search/backends', (_req, reply) => {
    try {
      reply.send({ success: true, ...searchService.getSearchBackends() });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });



  // POST /api/nyx/search
  fastify.post(
    '/search',
    {
      preHandler: [validate(nyxSearchSchema), async (req, res) => {
        const { searchRateLimiter } = await import('../../middleware/rateLimit.js');
        await searchRateLimiter(req, res);
      }],
    },
    async (request, reply) => {
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
  fastify.get('/search/history', async (request, reply) => {
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
  fastify.post('/prompt-feedback', async (request, reply) => {
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
  fastify.post(
    '/write-file',
    {
      preHandler: [validate(writeFileSchema)],
    },
    async (request, reply) => {
      const { filePath, content, overwrite } = request.body as any;
      try {
        const agentRunId = (request.headers['x-agent-run-id'] as string) || undefined;
        const result = await filesystemService.writeFile(filePath, content, overwrite, agentRunId);
        reply.send(result);
      } catch (error: any) {
        logger.error('[File System Error]:', error.message);
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // POST /api/nyx/read-file
  fastify.post('/read-file', async (request, reply) => {
    try {
      const { filePath, startLine, endLine } = request.body as {
        filePath: string;
        startLine?: number;
        endLine?: number;
      };
      if (!filePath) {
        return reply.code(400).send({ error: 'filePath is required' });
      }
      const content = await filesystemService.readFile(filePath, startLine, endLine);
      reply.send({ success: true, content });
    } catch (error: any) {
      logger.error('[Nyx Router] read-file failed:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/list-directory
  fastify.post('/list-directory', async (request, reply) => {
    try {
      const { dirPath } = request.body as { dirPath?: string };
      const files = filesystemService.listDirectory(dirPath);
      reply.send({ success: true, files });
    } catch (error: any) {
      logger.error('[Nyx Router] list-directory failed:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // ── Git Endpoints ──────────────────────────────────────────────────────────────

  // POST /api/nyx/git-diff
  fastify.post('/git-diff', async (request, reply) => {
    try {
      const { filePath } = request.body as { filePath?: string };
      const diff = await gitService.getDiff(filePath);
      reply.send({ success: true, diff });
    } catch (error: any) {
      logger.error('[Nyx Router] git-diff failed:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/git-status
  fastify.post('/git-status', async (request, reply) => {
    try {
      const status = await gitService.getStatus();
      reply.send({ success: true, status });
    } catch (error: any) {
      logger.error('[Nyx Router] git-status failed:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // ── Intelligence Endpoints ───────────────────────────────────────────────────────

  // POST /api/nyx/claude-md-hierarchy
  fastify.post('/claude-md-hierarchy', async (request, reply) => {
    try {
      const { rootPath, currentFile } = request.body as { rootPath?: string; currentFile?: string };
      if (!rootPath) {
        return reply.code(400).send({ error: 'rootPath is required' });
      }
      const fs = await import('fs');
      const path = await import('path');
      const { getWorkspaceRoot } = await import('../../lib/paths.js');

      const safeRoot = getWorkspaceRoot();
      const normalizedRoot = path.resolve(rootPath);
      if (!normalizedRoot.startsWith(safeRoot)) {
        return reply.code(403).send({ error: 'Directory traversal forbidden.' });
      }

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
  fastify.post('/memory-index', async (request, reply) => {
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
  fastify.post('/keyword-index', async (request, reply) => {
    try {
      const { rootPath } = request.body as { rootPath?: string };
      if (!rootPath) {
        return reply.code(400).send({ error: 'rootPath is required' });
      }
      const fs = await import('fs');
      const path = await import('path');
      const { getWorkspaceRoot } = await import('../../lib/paths.js');

      const safeRoot = getWorkspaceRoot();
      const normalizedRoot = path.resolve(rootPath);
      if (!normalizedRoot.startsWith(safeRoot)) {
        return reply.code(403).send({ error: 'Directory traversal forbidden.' });
      }

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

  // ── Workspace Endpoints ────────────────────────────────────────────────────────

  // GET /api/nyx/workspace-profile
  fastify.get('/workspace-profile', async (request, reply) => {
    try {
      const profile = await workspaceService.getProfile();
      reply.send({ success: true, profile });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to fetch workspace profile:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/workspace-profile
  fastify.post('/workspace-profile', async (request, reply) => {
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
  fastify.post('/validate', async (request, reply) => {
    try {
      const result = await workspaceService.validateWorkspace();
      reply.send(result);
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // GET /api/nyx/memory
  fastify.get('/memory', async (request, reply) => {
    try {
      const agentType = ((request.query as any).agentType as 'chat' | 'code') || 'code';
      reply.send({ success: true, memories: MemoryService.getMemories(agentType) });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to fetch memories:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/memory/commit
  fastify.post('/memory/commit', (request, reply) => {
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
  fastify.post('/memory/reset', async (request, reply) => {
    try {
      const agentType = (request.query as any).agentType as 'chat' | 'code' | undefined;
      MemoryService.resetMemories(agentType);
      reply.send({ success: true });
    } catch (error: any) {
      logger.error('[Nyx Router] Failed to reset memories:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/nyx/generate-image
  fastify.post('/generate-image', async (request, reply) => {
    try {
      const { prompt } = request.body as { prompt?: string };
      if (!prompt) {
        return reply.code(400).send({ error: 'Missing prompt for image generation.' });
      }
      
      const seed = Math.floor(Math.random() * 1000000);
      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=1024&height=1024&nologo=true`;
      
      reply.send({ success: true, imageUrl });
    } catch (error: any) {
      logger.error('[Nyx Router] Image generation failed:', error);
      reply.code(500).send({ error: error.message });
    }
  });
}
