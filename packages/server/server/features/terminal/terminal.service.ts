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

export interface SandboxSpawnOptions {
  cwd?: string;
  /** When true, grants permission to execute outside the Docker sandbox (e.g. via seccomp/seatbelt). */
  confirmed?: boolean;
}

export interface SandboxSpawnResult {
  child?: ChildProcess;
  isDocker: boolean;
  error?: string;
}

// ── Command validation ──────────────────────────────────────────────────

/**
 * Patterns that are blocked in ALL execution modes as defense-in-depth.
 * The Docker sandbox (`--read-only`, `--network none`, `--cap-drop ALL`)
 * already prevents most of these; this catches the raw-terminal path.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // Shell fork bombs
  /\b:\(\)\s*\{/,       // bash fork bomb
  /\b%0\s*\|/,           // cmd.exe fork bomb
  /\bwhile\s+true\s*;.*\s*done\s*&/, // background infinite loops

  // Destructive filesystem operations
  /\brm\s+(-[rRf]+.*)?\s+\/\s*$/,
  /\brm\s+(-[rRf]+.*)?\s+\/\*\s*/,
  /\brm\s+(-[rRf]+.*)?\s+~[\/\s]/,
  /\b(?:mkfs|mkswap|mkdosfs|mkfs\.\w+)\b/,
  /\bfdisk\b/,
  /\bdd\s+.*\bof=\/dev\/(sd|nvme|vd|hd|xvd)/,

  // Permission / ownership destruction
  /\bchmod\s+(-R.*)?\s*0{3,4}\s+\//,
  /\bchown\s+\d+\s+\/\s*$/,

  // Reverse shells
  /bash\s+-[iI]\s*[>&].*\/dev\/(tcp|udp)/,
  /\bnc\s+(-\w+\s+)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s+\d+\s*-\w/,
  /sh\s+-[iI]\s*[>&].*\/dev\/(tcp|udp)/,

  // Wiping / shredding
  /\bshred\s+(-[rfzun]+.*)?\s+\/(?!dev\/)/,
  /\bwipefs\b/,
];

function isCommandBlocked(cmd: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      return `Command matched dangerous pattern: ${pattern}`;
    }
  }
  return null;
}

// ── Audit logging ───────────────────────────────────────────────────────

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

    AuditLog.log({
      category: 'terminal_command',
      event: { command, reason },
      status: 'blocked',
    }).catch(() => {});
  } catch (err: any) {
    logger.error('[Sandbox] Failed to write security blocks log:', err);
  }
}

// ── OS-native sandbox wrappers ──────────────────────────────────────────

function getOSSpecificSandboxWrapper(cmd: string, cwd: string, confirmed: boolean): { bin: string; args: string[] } {
  const platform = os.platform();

  if (platform === 'linux') {
    // systemd-run with resource limits and network deny
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
    // macOS seatbelt profile
    const profile = [
      '(version 1)',
      '(deny default)',
      `(allow file-read* (subpath "${cwd}"))`,
      `(allow file-write* (subpath "${cwd}"))`,
      '(allow process-exec)',
      '(allow process-fork)',
      '(allow sysctl-read)',
      '(deny network*)',
    ].join('\n');
    const profilePath = path.join(os.tmpdir(), `seatbelt-${crypto.randomUUID()}.sb`);
    fs.writeFileSync(profilePath, profile);
    return {
      bin: 'sandbox-exec',
      args: ['-f', profilePath, 'sh', '-c', cmd],
    };
  } else if (platform === 'win32') {
    // Windows: use Node.js io.js Worker with tight resource limits instead
    // of a useless PowerShell wrapper. The worker script is generated inline.
    const workerScript = [
      `// Tight sandbox wrapper for Windows raw execution`,
      `const vm = require('vm');`,
      `const sandbox = {`,
      `  console: { log: console.log, error: console.error },`,
      `  setTimeout: setTimeout,`,
      `  clearTimeout: clearTimeout,`,
      `  Buffer: Buffer,`,
      `  process: {`,
      `    env: {},  // no host env`,
      `    cwd: () => ${JSON.stringify(cwd)},`,
      `    argv: [],`,
      `    exit: process.exit,`,
      `  },`,
      `};`,
      `try {`,
      `  vm.runInNewContext(${JSON.stringify(cmd)}, sandbox, { timeout: 5000 });`,
      `} catch (e) {`,
      `  console.error('Sandbox error:', e.message);`,
      `}`,
    ].join('\n');

    return {
      bin: process.execPath,   // current node binary
      args: ['-e', workerScript],
    };
  }

  // Fallback: blocked unless confirmed
  if (!confirmed) {
    return { bin: 'false', args: [] };
  }
  return {
    bin: 'sh',
    args: ['-c', cmd],
  };
}

// ── Main entry point ────────────────────────────────────────────────────

export async function spawnSandbox(
  command: string,
  options?: SandboxSpawnOptions
): Promise<SandboxSpawnResult> {
  const targetCwd = options?.cwd || getWorkspaceRoot();
  const confirmed = options?.confirmed ?? false;
  const trimmedCmd = command.trim();

  if (!trimmedCmd) {
    return { isDocker: false, error: 'Empty command.' };
  }

  // 1. Command validation layer (defense-in-depth)
  const blockReason = isCommandBlocked(trimmedCmd);
  if (blockReason) {
    logSecurityBlock(trimmedCmd, blockReason);
    return { isDocker: false, error: `Security: ${blockReason}` };
  }

  // 2. Resolve and validate cwd to prevent path traversal
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
      error: 'Security: Working directory must be within the workspace.',
    };
  }

  // 3. Decide execution mode
  const isDockerAvail = await isDockerAvailable();
  const ALLOW_RAW = env.NYX_ALLOW_RAW_TERMINAL && env.NODE_ENV === 'development';

  if (ALLOW_RAW) {
    if (!confirmed) {
      return {
        isDocker: false,
        error:
          'Security: Raw terminal execution requires `x-nyx-confirm-execution: true` header. This is a secondary confirmation gate to prevent accidental command injection from agent loops.',
      };
    }

    logger.warn(
      '[Sandbox] WARNING: Raw terminal mode enabled. Using OS-native capability sandboxing.'
    );
    const wrapper = getOSSpecificSandboxWrapper(trimmedCmd, resolvedCwd, confirmed);

    AuditLog.log({
      category: 'terminal_command',
      event: { command: trimmedCmd, cwd: resolvedCwd, mode: 'raw_sandbox', confirmed: true },
      status: 'executed',
    }).catch(() => {});

    const child = spawn(wrapper.bin, wrapper.args, {
      cwd: resolvedCwd,
      env: { ...process.env, FORCE_COLOR: '1' },
      timeout: 5 * 60 * 1000,
    });

    return { child, isDocker: false };
  }

  if (!isDockerAvail) {
    logSecurityBlock(trimmedCmd, 'Docker is unavailable and raw execution is disabled.');
    return {
      isDocker: false,
      error: 'Docker is not available. Install Docker Desktop or set NYX_ALLOW_RAW_TERMINAL=true in development.',
    };
  }

  // 4. Default: Docker sandbox
  const image = trimmedCmd.includes('python') ? 'python:3.11-slim' : 'node:20-alpine';
  const dockerArgs = [
    'run',
    '--rm',
    '-i',
    '--network', 'none',
    '--read-only',
    '--tmpfs', '/tmp:noexec,nosuid,size=1G',
    '-v', `${resolvedCwd}:/workspace:rw`,
    '-w', '/workspace',
    '--cpus', '2.0',
    '--memory', '2G',
    '--pids-limit', '64',
    '--security-opt', 'no-new-privileges:true',
    '--cap-drop', 'ALL',
    image,
    'sh', '-c', trimmedCmd,
  ];

  logger.info(
    `[Sandbox] Spawning command inside Docker (${image}): docker ${dockerArgs.join(' ')}`
  );
  AuditLog.log({
    category: 'terminal_command',
    event: { command: trimmedCmd, mode: 'docker_sandbox' },
    status: 'executed',
  }).catch(() => {});

  const child = spawn('docker', dockerArgs, {
    cwd: resolvedCwd,
    timeout: 5 * 60 * 1000,
  });

  return { child, isDocker: true };
}

// ── TerminalService (thin façade) ───────────────────────────────────────

export class TerminalService {
  private static pendingExecutions = new Map<string, { command: string; cwd?: string; confirmed?: boolean }>();
  private static legacyTasks = new Map<string, { output: string; isFinished: boolean }>();

  static async spawn(command: string, cwd?: string, confirmed?: boolean) {
    return await spawnSandbox(command, { cwd, confirmed });
  }

  static registerPrompt(nodeId: string | undefined, command: string, cwd?: string, confirmed?: boolean) {
    const execId = crypto.randomUUID();
    TerminalService.pendingExecutions.set(execId, { command, cwd, confirmed });

    if (nodeId) {
      TerminalService.legacyTasks.set(nodeId, {
        output: 'Execution started. Connect to stream or wait.',
        isFinished: false,
      });

      spawnSandbox(command, { cwd, confirmed }).then(({ child, error }) => {
        if (error) {
          TerminalService.legacyTasks.set(nodeId, {
            output: `Sandbox Error: ${error}`,
            isFinished: true,
          });
        } else if (child) {
          let accum = '';
          child.stdout?.on('data', (d) => { accum += d.toString(); });
          child.stderr?.on('data', (d) => { accum += d.toString(); });
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
