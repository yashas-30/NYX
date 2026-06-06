import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TerminalService } from './terminal.service.js';
import { sendSseTokenRotate, sseWrite } from '../../lib/sseHelpers.js';
import { terminalRunSchema, terminalPromptSchema } from './terminal.schema.js';
import { runInSandbox } from '../../sandbox/dockerSandbox.js';

const ALLOWED_COMMANDS = [
  'npm', 'node', 'python', 'python3', 'git', 'gcc', 'make',
  'cargo', 'go', 'rustc', 'javac', 'java', 'dotnet'
];

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  />\s*\/dev\/(null|zero|random)/,  // Dangerous redirects
  /curl\s+.*\|\s*sh/,        // curl | sh
  /wget\s+.*\|\s*sh/,        // wget | sh
  /eval\s*\(/,               // eval()
  /exec\s*\(/,               // exec()
  /;\s*rm\s+/,               // chained rm
  /\|\s*rm\s+/,              // piped rm
];

export async function terminalRouter(fastify: FastifyInstance) {
  fastify.post(
    '/run',
    {
      schema: {
        tags: ['terminal'],
        summary: 'Run a terminal command',
        body: terminalRunSchema,
      },
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      const { command, cwd } = request.body as z.infer<typeof terminalRunSchema>;
      if (!command) {
        return reply.code(400).send({ error: 'Command is required' });
      }

      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
          return reply.code(403).send({ error: 'Command blocked for security reasons' });
        }
      }

      const cmdBase = command.trim().split(' ')[0];
      if (!ALLOWED_COMMANDS.includes(cmdBase)) {
        return reply.code(403).send({ 
          error: `Command '${cmdBase}' is not allowed. Allowed: ${ALLOWED_COMMANDS.join(', ')}` 
        });
      }

      try {
        const result = await runInSandbox(command, cwd || process.cwd());
        if (result.exitCode === 0) {
          reply.send({ stdout: result.stdout, stderr: result.stderr });
        } else {
          reply.code(500).send({
            error: `Process exited with code ${result.exitCode}`,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        }
      } catch (err: any) {
        reply.code(500).send({
          error: `Process error: ${err.message}`,
          stdout: '',
          stderr: '',
        });
      }
    }
  );

  fastify.post(
    '/prompt',
    {
      schema: {
        tags: ['terminal'],
        summary: 'Start a long-running terminal prompt',
        body: terminalPromptSchema,
      }
    },
    (request, reply) => {
      const { nodeId, prompt, cwd } = request.body as z.infer<typeof terminalPromptSchema>;
      const command = prompt;
      if (!command) {
        return reply.code(400).send({ error: 'Command/prompt is required' });
      }

      const execId = TerminalService.registerPrompt(nodeId, command, cwd);
      reply.send({ status: 'started', execId });
    }
  );

  fastify.get('/poll', (request, reply) => {
    const nodeId = (request.query as any).nodeId as string;
    if (!nodeId) {
      return reply.code(400).send({ error: 'nodeId is required' });
    }

    const task = TerminalService.getLegacy(nodeId);
    if (!task) {
      return reply.code(404).send({ error: 'No terminal task found for this nodeId' });
    }

    if (task.isFinished) {
      reply.send({ status: 'success', output: task.output });
    } else {
      reply.send({ status: 'running' });
    }
  });

  fastify.get('/stream', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    const { initFastifySse } = await import('../../lib/sseHelpers.js');
    initFastifySse(reply);
    reply.raw.flushHeaders();
    sendSseTokenRotate(reply.raw as any);

    const execId = (request.query as any).execId as string;

    let command = '';
    let cwd: string | undefined = undefined;

    if (execId) {
      const pending = TerminalService.getPending(execId);
      if (!pending) {
        sseWrite(reply.raw,
          `event: error\ndata: ${JSON.stringify({ message: 'Execution session not found' })}\n\n`
        );
        return reply.raw.end();
      }
      command = pending.command;
      cwd = pending.cwd;
    } else {
      sseWrite(reply.raw,
        `event: error\ndata: ${JSON.stringify({ message: 'execId parameter is required' })}\n\n`
      );
      return reply.raw.end();
    }

    const startTime = Date.now();
    const { child, error } = await TerminalService.spawn(command, cwd);

    if (error) {
      sseWrite(reply.raw, `event: error\ndata: ${JSON.stringify({ message: error })}\n\n`);
      return reply.raw.end();
    }

    if (!child) {
      sseWrite(reply.raw,
        `event: error\ndata: ${JSON.stringify({ message: 'Failed to initialize sandboxed process' })}\n\n`
      );
      return reply.raw.end();
    }

    // Stream stdout
    child.stdout?.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line !== '') {
          sseWrite(reply.raw, `event: stdout\ndata: ${line}\n\n`);
        }
      }
    });

    // Stream stderr
    child.stderr?.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line !== '') {
          sseWrite(reply.raw, `event: stderr\ndata: ${line}\n\n`);
        }
      }
    });

    // Handle exit/close
    child.on('close', (code) => {
      const executionTimeMs = Date.now() - startTime;
      sseWrite(reply.raw, `event: exit\ndata: ${JSON.stringify({ code, executionTimeMs })}\n\n`);
      reply.raw.end();
    });

    child.on('error', (err) => {
      sseWrite(reply.raw, `event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      reply.raw.end();
    });

    // If client disconnects, kill the child process to save resources
    request.raw.on('close', () => {
      if (!child.killed) {
        try {
          child.kill();
        } catch {}
      }
    });
  });
}
