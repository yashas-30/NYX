import { spawn } from 'child_process';
import path from 'path';

export async function runInSandbox(
  command: string,
  workspacePath: string,
  timeoutMs = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const dockerCmd = [
      'docker', 'run',
      '--rm',
      '--network=none',           // No network access
      '--read-only',              // Read-only filesystem
      '--memory=512m',            // Memory limit
      '--cpus=1.0',               // CPU limit
      '-v', `${workspacePath}:/workspace:ro`,  // Mount workspace read-only
      '-w', '/workspace',
      'nyx-sandbox:latest',       // Custom sandbox image
      'sh', '-c', command
    ];

    const child = spawn(dockerCmd[0], dockerCmd.slice(1), {
      signal: AbortSignal.timeout(timeoutMs),
      killSignal: 'SIGKILL'
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
