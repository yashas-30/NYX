import { Router } from 'express';
import crypto from 'crypto';
import { spawnSandbox } from '../lib/sandbox.ts';
import { sendSseTokenRotate } from '../lib/sseHelpers.ts';

export const terminalRouter = Router();

// Store pending command executions
interface PendingExec {
  command: string;
  cwd?: string;
}
const pendingExecutions = new Map<string, PendingExec>();

// Store background task outputs for old poll endpoint compatibility
const legacyTasks = new Map<string, { output: string; isFinished: boolean }>();

/**
 * POST /api/terminal/run
 * Runs a command inside the sandbox and waits for completion.
 * Backward compatible synchronous endpoint.
 */
terminalRouter.post('/run', async (req, res) => {
  const { command, cwd } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  const { child, error } = await spawnSandbox(command, cwd);
  if (error) {
    return res.status(400).json({ error });
  }

  if (!child) {
    return res.status(500).json({ error: "Failed to initialize sandboxed process" });
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
    if (code === 0) {
      res.json({ stdout, stderr });
    } else {
      res.status(500).json({
        error: `Process exited with code ${code}`,
        stdout,
        stderr
      });
    }
  });

  child.on('error', (err) => {
    res.status(500).json({
      error: `Process error: ${err.message}`,
      stdout,
      stderr
    });
  });
});

/**
 * POST /api/terminal/prompt
 * Registers a command for background execution. Returns an execId.
 */
terminalRouter.post('/prompt', (req, res) => {
  const { nodeId, prompt, cwd } = req.body;
  const command = prompt;
  if (!command) {
    return res.status(400).json({ error: "Command/prompt is required" });
  }

  const execId = crypto.randomUUID();
  pendingExecutions.set(execId, { command, cwd });

  // Maintain old legacyTasks map for polling compatibility if nodeId was provided
  if (nodeId) {
    legacyTasks.set(nodeId, { output: 'Execution started. Connect to stream or wait.', isFinished: false });
    
    // Spawn in background and gather output for the legacy poll route
    spawnSandbox(command, cwd).then(({ child, error }) => {
      if (error) {
        legacyTasks.set(nodeId, { output: `Sandbox Error: ${error}`, isFinished: true });
      } else if (child) {
        let accum = '';
        child.stdout?.on('data', (d) => { accum += d.toString(); });
        child.stderr?.on('data', (d) => { accum += d.toString(); });
        child.on('close', (code) => {
          legacyTasks.set(nodeId, {
            output: accum || `Exited with code ${code}`,
            isFinished: true
          });
        });
        child.on('error', (err) => {
          legacyTasks.set(nodeId, {
            output: accum + `\nProcess error: ${err.message}`,
            isFinished: true
          });
        });
      }
    });
  }

  res.json({ status: 'started', execId });
});

/**
 * GET /api/terminal/poll
 * Legacy polling route for nodeId execution status.
 */
terminalRouter.get('/poll', (req, res) => {
  const nodeId = req.query.nodeId as string;
  if (!nodeId) {
    return res.status(400).json({ error: "nodeId is required" });
  }

  const task = legacyTasks.get(nodeId);
  if (!task) {
    return res.status(404).json({ error: "No terminal task found for this nodeId" });
  }

  if (task.isFinished) {
    res.json({ status: 'success', output: task.output });
  } else {
    res.json({ status: 'running' });
  }
});

/**
 * GET /api/terminal/stream
 * Server-Sent Events stream for execution.
 * Can consume a registered execId, or spawn command directly via query params.
 */
terminalRouter.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sendSseTokenRotate(res);

  const execId = req.query.execId as string;
  const directCmd = req.query.command as string;
  const directCwd = req.query.cwd as string;

  let command = '';
  let cwd: string | undefined = undefined;

  if (execId) {
    const pending = pendingExecutions.get(execId);
    if (!pending) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Execution session not found" })}\n\n`);
      return res.end();
    }
    command = pending.command;
    cwd = pending.cwd;
    pendingExecutions.delete(execId); // consume
  } else if (directCmd) {
    command = directCmd;
    cwd = directCwd;
  } else {
    res.write(`event: error\ndata: ${JSON.stringify({ message: "execId or command parameter is required" })}\n\n`);
    return res.end();
  }

  const startTime = Date.now();
  const { child, error } = await spawnSandbox(command, cwd);

  if (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: error })}\n\n`);
    return res.end();
  }

  if (!child) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Failed to initialize sandboxed process" })}\n\n`);
    return res.end();
  }

  // Stream stdout
  child.stdout?.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line !== '') {
        res.write(`event: stdout\ndata: ${line}\n\n`);
      }
    }
  });

  // Stream stderr
  child.stderr?.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line !== '') {
        res.write(`event: stderr\ndata: ${line}\n\n`);
      }
    }
  });

  // Handle exit/close
  child.on('close', (code) => {
    const executionTimeMs = Date.now() - startTime;
    res.write(`event: exit\ndata: ${JSON.stringify({ code, executionTimeMs })}\n\n`);
    res.end();
  });

  child.on('error', (err) => {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  });

  // If client disconnects, kill the child process to save resources
  req.on('close', () => {
    if (!child.killed) {
      try {
        child.kill();
      } catch {}
    }
  });
});
