import net from 'net';
import { spawn, ChildProcess } from 'child_process';
import { HardwareDetector, HardwareProfile } from './hardware';

export interface LocalModelInstance {
  id: string;
  modelPath: string;
  port: number;
  process: ChildProcess;
  vramUsedMB: number;
}

export class LocalModelManager {
  private static instances: Map<string, LocalModelInstance> = new Map();

  static async findAvailablePort(startPort: number = 8080): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      // fallow-ignore-next-line code-duplication
      server.listen(startPort, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(this.findAvailablePort(startPort + 1));
        } else {
          reject(err);
        }
      });
    });
  }

  static async startModel(
    modelPath: string,
    contextSize: number = 4096,
    draftModelPath?: string
  ): Promise<LocalModelInstance> {
    const profile = await HardwareDetector.getProfile();
    const binary = HardwareDetector.getBinaryName(profile);
    const port = await this.findAvailablePort(8080);

    // Calculate required VRAM roughly (1MB per 1M parameters + KV Cache)
    const estimatedVramMB = 4000; // Mock estimate for a 3B model

    if (profile.availableVramMB < estimatedVramMB) {
      throw new Error(
        `Insufficient VRAM. Needed: ${estimatedVramMB}MB, Available: ${profile.availableVramMB}MB`
      );
    }

    const args = [
      '-m',
      modelPath,
      '--port',
      port.toString(),
      '-c',
      contextSize.toString(),
      '--parallel',
      '4', // Dynamic batching concurrency
      '--cont-batching', // Enable continuous batching
    ];

    if (profile.hasFlashAttentionSupport) {
      args.push('--flash-attn');
    }

    if (draftModelPath) {
      args.push('--model-draft', draftModelPath); // Speculative decoding
    }

    if (profile.gpuVendor === 'nvidia' || profile.gpuVendor === 'amd') {
      args.push('--n-gpu-layers', '999'); // Offload all
    }

    console.log(`Starting ${binary} on port ${port}...`);

    const child = spawn(binary, args, { stdio: 'ignore', detached: true });

    const instance: LocalModelInstance = {
      id: Math.random().toString(36).substring(7),
      modelPath,
      port,
      process: child,
      vramUsedMB: estimatedVramMB,
    };

    this.instances.set(instance.id, instance);
    return instance;
  }

  static async stopModel(id: string) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.process.kill();
      this.instances.delete(id);
    }
  }

  static getInstances() {
    return Array.from(this.instances.values());
  }
}
