import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type GPUVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'none';

export interface HardwareProfile {
  os: NodeJS.Platform;
  arch: string;
  gpuVendor: GPUVendor;
  totalVramMB: number;
  availableVramMB: number;
  hasFlashAttentionSupport: boolean;
}

export class HardwareDetector {
  static async getProfile(): Promise<HardwareProfile> {
    const platform = os.platform();
    const arch = os.arch();

    let gpuVendor: GPUVendor = 'none';
    let totalVramMB = 0;
    let availableVramMB = 0;
    let hasFlashAttentionSupport = false;

    if (platform === 'darwin' && arch === 'arm64') {
      gpuVendor = 'apple';
      // Apple Unified Memory - roughly use system RAM limits
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      totalVramMB = Math.floor((totalMem / (1024 * 1024)) * 0.75); // Apple restricts max unified memory to ~75% for GPU usually
      availableVramMB = Math.floor(freeMem / (1024 * 1024));
      hasFlashAttentionSupport = true; // Metal supports FA
    } else {
      // Check NVIDIA
      try {
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=memory.total,memory.free --format=csv,noheader,nounits'
        );
        const lines = stdout.trim().split('\n');
        if (lines.length > 0) {
          gpuVendor = 'nvidia';
          const [total, free] = lines[0].split(',').map((s) => parseInt(s.trim()));
          totalVramMB = total;
          availableVramMB = free;

          // Flash attention mostly supported on Ampere (Compute 8.0) and up, but we assume true for modern NVIDIA and handle gracefully elsewhere
          hasFlashAttentionSupport = true;
        }
      } catch (e) {
        // Not Nvidia
      }

      // Check AMD if no Nvidia
      if (gpuVendor === 'none') {
        try {
          const { stdout } = await execAsync('rocm-smi --showmeminfo vram');
          if (stdout.includes('vram')) {
            gpuVendor = 'amd';
            totalVramMB = 16384; // Mock fallback parsing
            availableVramMB = 16384;
            hasFlashAttentionSupport = false; // often buggy on ROCm out of the box
          }
        } catch (e) {
          // Not AMD
        }
      }
    }

    return {
      os: platform,
      arch,
      gpuVendor,
      totalVramMB,
      availableVramMB,
      hasFlashAttentionSupport,
    };
  }

  static getBinaryName(profile: HardwareProfile): string {
    const base = 'llama-server';

    if (profile.os === 'win32') {
      if (profile.gpuVendor === 'nvidia') return `${base}-cuda.exe`;
      if (profile.gpuVendor === 'amd') return `${base}-vulkan.exe`;
      return `${base}.exe`;
    }

    if (profile.os === 'darwin') {
      return `${base}-metal`;
    }

    if (profile.os === 'linux') {
      if (profile.gpuVendor === 'nvidia') return `${base}-cuda`;
      if (profile.gpuVendor === 'amd') return `${base}-rocm`;
      return base;
    }

    return base;
  }
}
