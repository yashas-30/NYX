import { FastifyInstance } from 'fastify';
import { TerminalService } from './terminal.service.js';
import { sendSseTokenRotate } from '../../lib/sseHelpers.js';
import { validate } from '../../middleware/validate.js';
import { terminalRunSchema, terminalPromptSchema } from './terminal.schema.js';

export async function terminalRouter(fastify: FastifyInstance) {
  fastify.post(
    '/run',
    {
      preHandler: [validate(terminalRunSchema)],
    },
    async (request, reply) => {
      const { command, cwd } = request.body as any;
      if (!command) {
        return reply.code(400).send({ error: 'Command is required' });
      }

      const confirmed = request.headers['x-nyx-confirm-execution'] === 'true';
      const { child, error } = await TerminalService.spawn(command, cwd, confirmed);
      if (error) {
        return reply.code(400).send({ error });
      }

      if (!child) {
        return reply.code(500).send({ error: 'Failed to initialize sandboxed process' });
      }

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            reply.send({ stdout, stderr });
          } else {
            reply.code(500).send({
              error: `Process exited with code ${code}`,
              stdout,
              stderr,
            });
          }
          resolve(undefined);
        });

        child.on('error', (err) => {
          reply.code(500).send({
            error: `Process error: ${err.message}`,
            stdout,
            stderr,
          });
          resolve(undefined);
        });
      });
    }
  );

  fastify.post(
    '/prompt',
    {
      preHandler: [validate(terminalPromptSchema)],
    },
    (request, reply) => {
      const { nodeId, prompt, cwd } = request.body as any;
      const command = prompt;
      if (!command) {
        return reply.code(400).send({ error: 'Command/prompt is required' });
      }

      const confirmed = request.headers['x-nyx-confirm-execution'] === 'true';
      const execId = TerminalService.registerPrompt(nodeId, command, cwd, confirmed);
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

  fastify.get('/stream', async (request, reply) => {
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.raw.flushHeaders();
    sendSseTokenRotate(reply);

    const execId = (request.query as any).execId as string;

    let command = '';
    let cwd: string | undefined = undefined;

    if (execId) {
      const pending = TerminalService.getPending(execId);
      if (!pending) {
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({ message: 'Execution session not found' })}\n\n`
        );
        return reply.raw.end();
      }
      command = pending.command;
      cwd = pending.cwd;
    } else {
      reply.raw.write(
        `event: error\ndata: ${JSON.stringify({ message: 'execId parameter is required' })}\n\n`
      );
      return reply.raw.end();
    }

    const confirmed = request.headers['x-nyx-confirm-execution'] === 'true';
    const startTime = Date.now();
    const { child, error } = await TerminalService.spawn(command, cwd, confirmed);

    if (error) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: error })}\n\n`);
      return reply.raw.end();
    }

    if (!child) {
      reply.raw.write(
        `event: error\ndata: ${JSON.stringify({ message: 'Failed to initialize sandboxed process' })}\n\n`
      );
      return reply.raw.end();
    }

    // Stream stdout
    child.stdout?.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line !== '') {
          reply.raw.write(`event: stdout\ndata: ${line}\n\n`);
        }
      }
    });

    // Stream stderr
    child.stderr?.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line !== '') {
          reply.raw.write(`event: stderr\ndata: ${line}\n\n`);
        }
      }
    });

    // Handle exit/close
    child.on('close', (code) => {
      const executionTimeMs = Date.now() - startTime;
      reply.raw.write(`event: exit\ndata: ${JSON.stringify({ code, executionTimeMs })}\n\n`);
      reply.raw.end();
    });

    child.on('error', (err) => {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
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
