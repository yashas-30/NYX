import Docker from 'dockerode';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const docker = new Docker();

export async function executeCodeInDocker(code: string, language: string = 'python'): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nyx-sandbox-'));
    
    let imageName = 'python:3.11-slim';
    let filename = 'script.py';
    let cmd = ['python', `/sandbox/${filename}`];

    if (language === 'javascript' || language === 'node') {
        imageName = 'node:20-slim';
        filename = 'script.js';
        cmd = ['node', `/sandbox/${filename}`];
    } else if (language === 'bash' || language === 'sh') {
        imageName = 'alpine:latest';
        filename = 'script.sh';
        cmd = ['sh', `/sandbox/${filename}`];
    }

    await fs.writeFile(path.join(tmpDir, filename), code);

    try {
        // Ensure image exists
        try {
            await docker.getImage(imageName).inspect();
        } catch (e) {
            console.log(`Pulling image ${imageName}...`);
            await new Promise((resolve, reject) => {
                docker.pull(imageName, (err: any, stream: any) => {
                    if (err) return reject(err);
                    docker.modem.followProgress(stream, onFinished);
                    function onFinished(err: any, output: any) {
                        if (err) return reject(err);
                        resolve(output);
                    }
                });
            });
        }

        const container = await docker.createContainer({
            Image: imageName,
            Cmd: cmd,
            HostConfig: {
                Binds: [`${tmpDir}:/sandbox`],
                AutoRemove: true,
                Memory: 512 * 1024 * 1024, // 512MB limit
                NetworkMode: 'none' // Disable network for security
            }
        });

        const stream = await container.attach({ stream: true, stdout: true, stderr: true });
        
        let output = '';
        stream.on('data', (chunk) => {
            // Docker payload header is 8 bytes, followed by actual data
            if (chunk.length > 8) {
                const payload = chunk.slice(8).toString('utf8');
                output += payload;
            }
        });

        await container.start();
        
        // Timeout mechanism
        const timeoutPromise = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Execution timed out')), 15000));
        const waitPromise = container.wait();

        await Promise.race([waitPromise, timeoutPromise]);

        return output.trim() || `Executed successfully with no output.`;
    } catch (err: any) {
        return `Error executing code: ${err.message}`;
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

export async function executeCommandInDocker(command: string, cwd?: string): Promise<string> {
    const imageName = 'ubuntu:latest';
    
    try {
        // Ensure image exists
        try {
            await docker.getImage(imageName).inspect();
        } catch (e) {
            console.log(`Pulling image ${imageName}...`);
            await new Promise((resolve, reject) => {
                docker.pull(imageName, (err: any, stream: any) => {
                    if (err) return reject(err);
                    docker.modem.followProgress(stream, (err: any, output: any) => {
                        if (err) return reject(err);
                        resolve(output);
                    });
                });
            });
        }

        const binds = [];
        let workingDir = '/sandbox';
        
        // If there's a workspace path, we mount it. For safety, we should ideally restrict what is mounted.
        // We'll mount the given CWD as /sandbox if it exists
        if (cwd) {
            binds.push(`${path.resolve(cwd)}:/sandbox`);
        } else {
            // Provide a temporary dir if none given
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nyx-cmd-'));
            binds.push(`${tmpDir}:/sandbox`);
        }

        const container = await docker.createContainer({
            Image: imageName,
            Cmd: ['bash', '-c', command],
            WorkingDir: workingDir,
            HostConfig: {
                Binds: binds,
                AutoRemove: true,
                Memory: 512 * 1024 * 1024,
                NetworkMode: 'none' // Disable network for security
            }
        });

        const stream = await container.attach({ stream: true, stdout: true, stderr: true });
        
        let output = '';
        stream.on('data', (chunk) => {
            if (chunk.length > 8) {
                const payload = chunk.slice(8).toString('utf8');
                output += payload;
            }
        });

        await container.start();
        
        const timeoutPromise = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Execution timed out')), 30000));
        const waitPromise = container.wait();

        await Promise.race([waitPromise, timeoutPromise]);

        return output.trim() || `Executed successfully with no output.`;
    } catch (err: any) {
        return `Error executing command: ${err.message}`;
    }
}

