import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import { getWorkspaceRoot } from './paths.ts';

let isDockerAvailableCache: boolean | null = null;

function checkDockerAvailable(): boolean {
  if (isDockerAvailableCache !== null) return isDockerAvailableCache;
  try {
    execSync('docker --version', { stdio: 'ignore' });
    isDockerAvailableCache = true;
  } catch {
    isDockerAvailableCache = false;
  }
  return isDockerAvailableCache;
}

export interface SandboxSpawnResult {
  child?: ChildProcess;
  isDocker: boolean;
  error?: string;
}

export function spawnSandbox(command: string, cwd?: string): SandboxSpawnResult {
  const targetCwd = cwd || getWorkspaceRoot();
  
  // 1. Scan for blocked dangerous patterns
  const dangerousPatterns = ['rm -rf /', 'curl | bash', 'mkfs', 'dd'];
  for (const pattern of dangerousPatterns) {
    if (command.includes(pattern)) {
      return {
        isDocker: false,
        error: `Security Sandbox Block: Dangerous command pattern detected ('${pattern}')`
      };
    }
  }

  // 2. Extract first token of command (the executable)
  const trimmedCmd = command.trim();
  const commandParts = trimmedCmd.split(/\s+/);
  const rawExecutable = commandParts[0] || '';
  
  // Strip path or extension to get baseline executable name
  const executable = path.basename(rawExecutable).replace(/\.(exe|cmd|bat|sh)$/i, '').toLowerCase();

  // 3. Whitelist allowed commands
  const whitelist = ['npm', 'node', 'python', 'python3', 'git', 'gcc', 'make'];
  if (!whitelist.includes(executable)) {
    return {
      isDocker: false,
      error: `Security Sandbox Block: Executable '${executable}' is not in the whitelist (${whitelist.join(', ')}).`
    };
  }

  const isDockerAvailable = checkDockerAvailable();
  const allowRawTerminal = process.env.ALLOW_RAW_TERMINAL === 'true';

  // 4. Host execution fallback (if ALLOW_RAW_TERMINAL=true)
  if (allowRawTerminal) {
    console.log(`[Sandbox] Executing command on host (ALLOW_RAW_TERMINAL=true): ${trimmedCmd}`);
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const shellArgs = process.platform === 'win32' ? ['/c', trimmedCmd] : ['-c', trimmedCmd];
    
    const child = spawn(shell, shellArgs, {
      cwd: targetCwd,
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    return {
      child,
      isDocker: false
    };
  }

  // 5. Docker sandbox execution (Default Mode)
  if (!isDockerAvailable) {
    return {
      isDocker: false,
      error: `Docker required for sandbox. Set ALLOW_RAW_TERMINAL=true in .env to run on host (insecure).`
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
    image, 'sh', '-c', trimmedCmd
  ];

  console.log(`[Sandbox] Spawning command inside Docker (${image}): docker ${dockerArgs.join(' ')}`);

  const child = spawn('docker', dockerArgs, {
    cwd: targetCwd
  });

  return {
    child,
    isDocker: true
  };
}
