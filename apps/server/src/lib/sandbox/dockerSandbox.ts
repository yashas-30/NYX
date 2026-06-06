import Docker from 'dockerode';

const docker = new Docker();

export interface SandboxOptions {
  language: 'node' | 'python' | 'rust' | 'go' | 'cpp';
  code: string;
  timeout?: number; // seconds
  memory?: number; // MB
  cpu?: number; // percentage (0-1)
  network?: boolean;
  workspacePath?: string;
}

export interface SandboxResult {
  output: string;
  exitCode: number | null;
  error?: string;
}

function getRunCommand(language: string): string {
  switch (language) {
    case 'node': return 'node';
    case 'python': return 'python3';
    case 'rust': return 'rustc - && ./rust_out'; // rough approximation
    case 'go': return 'go run';
    case 'cpp': return 'g++ -x c++ - -o out && ./out';
    default: return 'sh';
  }
}

export async function createSandbox(opts: SandboxOptions): Promise<SandboxResult> {
  const timeoutSecs = opts.timeout || 30;
  const memoryMB = opts.memory || 256;
  const cpuQuota = opts.cpu ? Math.floor(opts.cpu * 100000) : 50000;
  
  const image = `nyx-sandbox-${opts.language}:latest`;

  try {
    const container = await docker.createContainer({
      Image: image,
      Cmd: ['sh', '-c', `echo '${Buffer.from(opts.code).toString('base64')}' | base64 -d | ${getRunCommand(opts.language)}`],
      HostConfig: {
        Memory: memoryMB * 1024 * 1024,
        CpuQuota: cpuQuota,
        CpuPeriod: 100000,
        NetworkMode: opts.network ? 'bridge' : 'none',
        Binds: opts.workspacePath ? [`${opts.workspacePath}:/workspace:ro`] : [],
        AutoRemove: true
      },
      WorkingDir: '/workspace',
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    const outputChunks: Buffer[] = [];
    
    stream.on('data', (chunk) => {
      // Dockerode stream format sometimes includes headers. Simplest buffer collection:
      outputChunks.push(chunk);
    });

    await container.start();

    // Setup timeout
    let timedOut = false;
    const timeoutHandle = setTimeout(async () => {
      timedOut = true;
      try {
        await container.kill();
      } catch (e) {
        // Handle error silently, container might be dead already
      }
    }, timeoutSecs * 1000);

    const waitResult = await container.wait();
    clearTimeout(timeoutHandle);

    let output = Buffer.concat(outputChunks).toString('utf-8');
    
    if (timedOut) {
      output += '\n[Execution timed out]';
    }

    return {
      output,
      exitCode: waitResult.StatusCode
    };
  } catch (error: any) {
    return {
      output: '',
      exitCode: null,
      error: error.message
    };
  }
}
