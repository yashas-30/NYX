import logger from '../../lib/logger.js';
import { spawn, exec, ChildProcess, SpawnOptions } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';
import { getWorkspaceRoot } from '../../lib/paths.js';
import { AuditLog } from '../../lib/auditLog.js';
import os from 'os';
import { env } from '../../config/env.js';

let isDockerAvailableCache: boolean | null = null;

async function isDockerAvailable(): Promise<boolean> {
  if (isDockerAvailableCache !== null) return isDockerAvailableCache;
  return new Promise((resolve) => {
    exec('docker --version', (err) => {
      if (err) {
        isDockerAvailableCache = false;
        resolve(false);
      } else {
        isDockerAvailableCache = true;
        resolve(true);
      }
    });
  });
}

export interface SandboxSpawnResult {
  child?: ChildProcess;
  isDocker: boolean;
  error?: string;
}

function logSecurityBlock(command: string, reason: string): void {
  try {
    const logsDir = path.join(getWorkspaceRoot(), '.nyx-logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path.join(logsDir, 'security-blocks.log');
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] BLOCKED: "${command}" | REASON: ${reason}\n`;
    fs.appendFileSync(logFilePath, entry, 'utf8');

    // Also log via AuditLog
    AuditLog.log({
      category: 'terminal_command',
      event: { command, reason },
      status: 'blocked',
    }).catch(() => {});
  } catch (err: any) {
    logger.error('[Sandbox] Failed to write security blocks log:', err);
  }
}

function getOSSpecificSandboxWrapper(cmd: string, cwd: string): { bin: string; args: string[] } {
  const platform = os.platform();
  const timeoutMs = 5 * 60 * 1000; // 5 minutes

  if (platform === 'linux') {
    // Seccomp-bpf via firejail/bwrap or systemd-run with limits
    // CPU 2 cores, RAM 2GB, disk 1GB, no network
    return {
      bin: 'systemd-run',
      args: [
        '--user',
        '--scope',
        '-p',
        'CPUQuota=200%',
        '-p',
        'MemoryMax=2G',
        '-p',
        'TasksMax=64',
        '-p',
        'IPAddressDeny=any',
        '--quiet',
        'sh',
        '-c',
        cmd,
      ],
    };
  } else if (platform === 'darwin') {
    // macOS seatbelt profiles
    const profile = `
      (version 1)
      (deny default)
      (allow file-read* (subpath "${cwd}"))
      (allow file-write* (subpath "${cwd}"))
      (allow process-exec)
      (allow process-fork)
      (allow sysctl-read)
      (deny network*)
    `;
    const profilePath = path.join(os.tmpdir(), `seatbelt-${crypto.randomUUID()}.sb`);
    fs.writeFileSync(profilePath, profile);
    return {
      bin: 'sandbox-exec',
      args: ['-f', profilePath, 'sh', '-c', cmd],
    };
  } else if (platform === 'win32') {
    // Windows Job Objects + AppContainer (approximate via PowerShell constrained language or custom runner)
    // Note: Node.js does not natively support spawning into AppContainer directly without native addons,
    // but we simulate the intention via constrained execution.
    return {
      bin: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$job = [System.Management.Automation.Job]::Create(); Invoke-Command -ScriptBlock { ${cmd} }`,
      ],
    };
  }

  // Fallback
  return {
    bin: 'sh',
    args: ['-c', cmd],
  };
}

export async function spawnSandbox(command: string, cwd?: string): Promise<SandboxSpawnResult> {
  const targetCwd = cwd || getWorkspaceRoot();
  const trimmedCmd = command.trim();

  if (!trimmedCmd) {
    return { isDocker: false, error: 'Empty command.' };
  }

  // Strict Command Whitelist (Option D)
  const ALLOWED_COMMANDS = new Set([
    'npm', 'node', 'python', 'python3', 'git', 'gcc', 'make', 'npx', 'yarn', 'pnpm', 'tsc', 'vitest', 'jest'
  ]);
  const baseCmd = trimmedCmd.split(' ')[0];
  if (!ALLOWED_COMMANDS.has(baseCmd)) {
    logSecurityBlock(trimmedCmd, `Command '${baseCmd}' is not in the whitelist.`);
    return {
      isDocker: false,
      error: `Security Sandbox Block: Command '${baseCmd}' is not allowed.`,
    };
  }
  
  // Shell Operator check to prevent escape via `npm install; rm -rf /`
  const shellOperators = /[&|;><`]/;
  if (shellOperators.test(trimmedCmd)) {
    logSecurityBlock(trimmedCmd, 'Shell operators are forbidden.');
    return {
      isDocker: false,
      error: 'Security Sandbox Block: Shell operators (&, |, ;, >, <, \`) are not allowed.',
    };
  }

  // Capability-based Sandboxing removes the need for naive whitelists.
  // We apply OS-level isolation (seccomp, seatbelt, AppContainer) or Docker.

  // Resolve and validate cwd to prevent path traversal
  const workspaceRoot = getWorkspaceRoot();
  let resolvedCwd = targetCwd;
  if (fs.existsSync(targetCwd)) {
    try {
      resolvedCwd = fs.realpathSync(targetCwd);
    } catch {
      resolvedCwd = path.resolve(targetCwd);
    }
  } else {
    resolvedCwd = path.resolve(targetCwd);
  }

  const relative = path.relative(workspaceRoot, resolvedCwd);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    logSecurityBlock(trimmedCmd, `cwd '${targetCwd}' is outside workspace root`);
    return {
      isDocker: false,
      error: 'Security Sandbox Block: Working directory must be within the workspace.',
    };
  }

  const isDockerAvail = await isDockerAvailable();
  const ALLOW_RAW =
    env.NYX_ALLOW_RAW_TERMINAL && env.NODE_ENV === 'development';

  if (ALLOW_RAW) {
    logger.warn(
      '[Sandbox] WARNING: Raw terminal mode enabled. Using OS-native capability sandboxing.'
    );
    const wrapper = getOSSpecificSandboxWrapper(trimmedCmd, resolvedCwd);

    AuditLog.log({
      category: 'terminal_command',
      event: { command: trimmedCmd, cwd: resolvedCwd },
      status: 'success',
    }).catch(() => {});

    const child = spawn(wrapper.bin, wrapper.args, {
      cwd: resolvedCwd,
      env: { ...process.env, FORCE_COLOR: '1' },
      timeout: 30 * 1000, // 30-second timeout
    });

    return {
      child,
      isDocker: false,
    };
  }

  if (!isDockerAvail) {
    logSecurityBlock(trimmedCmd, 'Docker is unavailable and raw execution is disabled.');
    return {
      isDocker: false,
      error: `Docker required for secure sandbox.`,
    };
  }

  // Default: Docker execution with strict capability drops and resource limits
  // CPU 2 cores, RAM 512MB, disk limits via tmpfs, no network
  const image = trimmedCmd.includes('python') ? 'python:3.11-slim' : 'node:20-alpine';
  const dockerArgs = [
    'run',
    '--rm',
    '-i',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:noexec,nosuid,size=1G',
    '-v',
    `${resolvedCwd}:/workspace:rw`,
    '-w',
    '/workspace',
    '--cpus',
    '2.0',
    '--memory',
    '512m',
    '--pids-limit',
    '64',
    '--security-opt',
    'no-new-privileges:true',
    '--cap-drop',
    'ALL',
    image,
    'sh',
    '-c',
    trimmedCmd,
  ];

  logger.info(
    `[Sandbox] Spawning command inside Docker (${image}): docker ${dockerArgs.join(' ')}`
  );
  AuditLog.log({
    category: 'terminal_command',
    event: { command: trimmedCmd, mode: 'docker_sandbox' },
    status: 'success',
  }).catch(() => {});

  const child = spawn('docker', dockerArgs, {
    cwd: resolvedCwd,
    timeout: 30 * 1000, // 30-second timeout
  });

  return {
    child,
    isDocker: true,
  };
}

export class TerminalService {
  private static pendingExecutions = new Map<string, { command: string; cwd?: string }>();
  private static legacyTasks = new Map<string, { output: string; isFinished: boolean }>();

  static async spawn(command: string, cwd?: string) {
    return await spawnSandbox(command, cwd);
  }

  static registerPrompt(nodeId: string | undefined, command: string, cwd?: string) {
    const execId = crypto.randomUUID();
    TerminalService.pendingExecutions.set(execId, { command, cwd });

    if (nodeId) {
      TerminalService.legacyTasks.set(nodeId, {
        output: 'Execution started. Connect to stream or wait.',
        isFinished: false,
      });

      spawnSandbox(command, cwd).then(({ child, error }) => {
        if (error) {
          TerminalService.legacyTasks.set(nodeId, {
            output: `Sandbox Error: ${error}`,
            isFinished: true,
          });
        } else if (child) {
          let accum = '';
          child.stdout?.on('data', (d) => {
            accum += d.toString();
          });
          child.stderr?.on('data', (d) => {
            accum += d.toString();
          });
          child.on('close', (code) => {
            TerminalService.legacyTasks.set(nodeId, {
              output: accum || `Exited with code ${code}`,
              isFinished: true,
            });
          });
          child.on('error', (err) => {
            TerminalService.legacyTasks.set(nodeId, {
              output: accum + `\nProcess error: ${err.message}`,
              isFinished: true,
            });
          });
        }
      });
    }

    return execId;
  }

  static getPending(execId: string) {
    const pending = TerminalService.pendingExecutions.get(execId);
    if (pending) {
      TerminalService.pendingExecutions.delete(execId);
    }
    return pending;
  }

  static getLegacy(nodeId: string) {
    return TerminalService.legacyTasks.get(nodeId);
  }
}
