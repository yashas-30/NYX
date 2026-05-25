import { spawn, exec, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getWorkspaceRoot } from './paths.ts';

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

interface ShellToken {
  type: 'word' | 'operator' | 'subshell' | 'variable';
  value: string;
}

export function parseShellCommand(cmd: string): { tokens: ShellToken[]; hasForbiddenChaining: boolean } {
  const tokens: ShellToken[] = [];
  let hasForbiddenChaining = false;
  let i = 0;
  const len = cmd.length;

  while (i < len) {
    const char = cmd[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Check for logical chaining operators
    if (cmd.startsWith('&&', i)) {
      tokens.push({ type: 'operator', value: '&&' });
      hasForbiddenChaining = true;
      i += 2;
      continue;
    }
    if (cmd.startsWith('||', i)) {
      tokens.push({ type: 'operator', value: '||' });
      hasForbiddenChaining = true;
      i += 2;
      continue;
    }
    if (char === ';') {
      tokens.push({ type: 'operator', value: ';' });
      hasForbiddenChaining = true;
      i++;
      continue;
    }
    if (char === '|') {
      tokens.push({ type: 'operator', value: '|' });
      hasForbiddenChaining = true;
      i++;
      continue;
    }
    if (char === '`') {
      tokens.push({ type: 'subshell', value: '`' });
      hasForbiddenChaining = true;
      i++;
      continue;
    }
    if (cmd.startsWith('$()', i) || cmd.startsWith('$(', i)) {
      tokens.push({ type: 'subshell', value: '$(' });
      hasForbiddenChaining = true;
      i += 2;
      continue;
    }
    if (cmd.startsWith('${', i)) {
      tokens.push({ type: 'variable', value: '${' });
      hasForbiddenChaining = true;
      i += 2;
      continue;
    }
    if (cmd.startsWith('<(', i)) {
      tokens.push({ type: 'subshell', value: '<(' });
      hasForbiddenChaining = true;
      i += 2;
      continue;
    }
    if (cmd.startsWith('>(', i)) {
      tokens.push({ type: 'subshell', value: '>(' });
      hasForbiddenChaining = true;
      i += 2;
      continue;
    }

    // Handle single quotes
    if (char === "'") {
      let value = '';
      i++; // skip quote
      while (i < len && cmd[i] !== "'") {
        value += cmd[i];
        i++;
      }
      i++; // skip quote
      tokens.push({ type: 'word', value });
      continue;
    }

    // Handle double quotes
    if (char === '"') {
      let value = '';
      i++; // skip quote
      while (i < len && cmd[i] !== '"') {
        const innerChar = cmd[i];
        if (innerChar === '`' || cmd.startsWith('$(', i) || cmd.startsWith('${', i)) {
          hasForbiddenChaining = true;
        }
        value += innerChar;
        i++;
      }
      i++; // skip quote
      tokens.push({ type: 'word', value });
      continue;
    }

    // Handle normal word
    let word = '';
    while (i < len && !/\s/.test(cmd[i]) && !['&', '|', ';', '`', "'", '"', '$'].includes(cmd[i])) {
      word += cmd[i];
      i++;
    }
    if (cmd[i] === '$') {
      if (cmd.startsWith('$(', i) || cmd.startsWith('${', i)) {
        hasForbiddenChaining = true;
      } else {
        word += '$';
        i++;
      }
    }
    if (word.length > 0) {
      tokens.push({ type: 'word', value: word });
    }
  }

  return { tokens, hasForbiddenChaining };
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
  } catch (err) {
    console.error('[Sandbox] Failed to write security blocks log:', err);
  }
}

export async function spawnSandbox(command: string, cwd?: string): Promise<SandboxSpawnResult> {
  const targetCwd = cwd || getWorkspaceRoot();
  const trimmedCmd = command.trim();

  // 1. Lexer-based Shell Command Parsing
  const { tokens, hasForbiddenChaining } = parseShellCommand(trimmedCmd);

  if (hasForbiddenChaining) {
    logSecurityBlock(trimmedCmd, 'Forbidden chaining or subshell expansion detected');
    return {
      isDocker: false,
      error: `Security Sandbox Block: Forbidden command chaining/operators detected.`,
    };
  }

  if (tokens.length === 0) {
    return {
      isDocker: false,
      error: 'Security Sandbox Block: Empty command.',
    };
  }

  const rawExecutable = tokens[0].value;
  const executable = path.basename(rawExecutable).replace(/\.(exe|cmd|bat|sh)$/i, '').toLowerCase();

  // 2. Whitelist Allowed Commands
  const whitelist = ['npm', 'node', 'python', 'python3', 'git', 'gcc', 'make'];
  if (!whitelist.includes(executable)) {
    logSecurityBlock(trimmedCmd, `Executable '${executable}' is not in the whitelist`);
    return {
      isDocker: false,
      error: `Security Sandbox Block: Executable '${executable}' is not in the whitelist (${whitelist.join(', ')}).`,
    };
  }

  // 3. Scan for forced Docker execution triggers (eval / code-execution parameters)
  let forceDocker = false;
  
  if (['node', 'python', 'python3'].includes(executable)) {
    // Check if arguments contain eval/execute parameters
    for (const token of tokens) {
      if (token.type === 'word') {
        const val = token.value.toLowerCase();
        if (val === '-e' || val === '--eval' || val.includes('eval(') || val.includes('require(')) {
          forceDocker = true;
          break;
        }
      }
    }
  }

  const isDockerAvail = await isDockerAvailable();
  const ALLOW_RAW = process.env.NYX_ALLOW_RAW_TERMINAL === 'true' && 
                    process.env.NODE_ENV === 'development';
  if (ALLOW_RAW) {
    console.warn('[Sandbox] WARNING: Raw terminal mode enabled. All sandbox protections disabled.');
  }

  // 4. Force Docker Execution Gate
  if (forceDocker) {
    if (!isDockerAvail) {
      logSecurityBlock(trimmedCmd, `Forced Docker execution failed: Docker is not available for eval flags on executable '${executable}'`);
      return {
        isDocker: false,
        error: 'Sandboxed execution requires Docker. Install Docker or remove -e/--eval flags.',
      };
    }

    // Docker is available, proceed to run in Docker container
    console.log(`[Sandbox] Forcing Docker sandboxed execution for command with eval flags: ${trimmedCmd}`);
  }

  // 5. Host execution fallback (if ALLOW_RAW_TERMINAL=true and not forced to Docker)
  if (ALLOW_RAW && !forceDocker) {
    console.log(`[Sandbox] Executing command on host (NYX_ALLOW_RAW_TERMINAL=true): ${trimmedCmd}`);
    const shellBin = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const shellArgs = process.platform === 'win32' ? ['/c', trimmedCmd] : ['-c', trimmedCmd];
    
    const child = spawn(shellBin, shellArgs, {
      cwd: targetCwd,
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    
    return {
      child,
      isDocker: false,
    };
  }

  // 6. Docker sandbox execution (Default Mode)
  if (!isDockerAvail) {
    return {
      isDocker: false,
      error: `Docker required for sandbox. Set NYX_ALLOW_RAW_TERMINAL=true in .env to run on host (insecure).`,
    };
  }

  // Determine appropriate image based on command
  const image = (executable.startsWith('python')) ? 'python:3.11-slim' : 'node:20-alpine';
  
  // Format exact Docker run command arguments (Amendment A)
  const dockerArgs = [
    'run', '--rm', '-i',
    '--network', 'none',
    '--read-only',
    '--tmpfs', '/tmp:noexec,nosuid,size=100m',
    '-v', `${targetCwd}:/workspace:ro`, // ONLY mount targetCwd, read-only
    '-w', '/workspace',
    '--cpus', '1.0',
    '--memory', '512m',
    '--pids-limit', '64',
    '--security-opt', 'no-new-privileges:true',
    '--cap-drop', 'ALL',
    image, 'sh', '-c', trimmedCmd,
  ];

  console.log(`[Sandbox] Spawning command inside Docker (${image}): docker ${dockerArgs.join(' ')}`);

  const child = spawn('docker', dockerArgs, {
    cwd: targetCwd,
  });

  return {
    child,
    isDocker: true,
  };
}
