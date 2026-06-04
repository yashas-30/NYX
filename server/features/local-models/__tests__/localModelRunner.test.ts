import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalModelRunner } from '../localModelRunner.ts';
import { LocalModelManager } from '../localModelManager.ts';
import { HardwareDetector } from '../hardwareDetector.ts';

// Mock local model manager registry
vi.mock('../localModelManager.ts', () => ({
  LocalModelManager: {
    listModels: () => [
      {
        id: 'nyx-gemma-4-e2b-it',
        name: 'Gemma 2B',
        fileName: 'nyx-gemma-4-e2b-it.gguf',
        status: 'completed',
        size: '1.5',
        filePath: '/mock/models/gemma.gguf',
      },
    ],
  },
}));

describe('LocalModelRunner Layer Math Optimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns 0 GPU layers when no GPU is detected', async () => {
    // Mock detectGPUs and getFreeVram on HardwareDetector
    vi.spyOn(HardwareDetector, 'detectGPUs').mockResolvedValue([]);
    vi.spyOn(HardwareDetector, 'getFreeVram').mockResolvedValue(0);

    const result = await LocalModelRunner.calculateOptimalLayers('nyx-gemma-4-e2b-it', 2048);

    expect(result.hasGPU).toBe(false);
    expect(result.gpuLayers).toBe(0);
    expect(result.message).toContain('No active GPU detected');
  });

  it('calculates partial offloading when usable VRAM is lower than model size', async () => {
    // Usable VRAM is 1.5 GB. Usable VRAM with baseline overhead subtracted (750MB) is ~800MB.
    // 800MB usable VRAM is less than Gemma size (~1.5GB).
    const mockGPUs = [
      { vendor: 'NVIDIA', model: 'GeForce GTX 1650', vramBytes: 1500 * 1024 * 1024, index: 0 },
    ];
    vi.spyOn(HardwareDetector, 'detectGPUs').mockResolvedValue(mockGPUs);
    vi.spyOn(HardwareDetector, 'getFreeVram').mockResolvedValue(1500 * 1024 * 1024);

    const result = await LocalModelRunner.calculateOptimalLayers('nyx-gemma-4-e2b-it', 2048);

    expect(result.hasGPU).toBe(true);
    expect(result.gpuLayers).toBeLessThan(result.totalLayers);
    expect(result.message).toContain('VRAM limit reached');
  });

  it('offloads 100% of layers to GPU when VRAM is abundant', async () => {
    // 16 GB VRAM detected
    const mockGPUs = [
      { vendor: 'NVIDIA', model: 'GeForce RTX 4080', vramBytes: 16 * 1024 * 1024 * 1024, index: 0 },
    ];
    vi.spyOn(HardwareDetector, 'detectGPUs').mockResolvedValue(mockGPUs);
    vi.spyOn(HardwareDetector, 'getFreeVram').mockResolvedValue(16 * 1024 * 1024 * 1024);

    const result = await LocalModelRunner.calculateOptimalLayers('nyx-gemma-4-e2b-it', 2048);

    expect(result.hasGPU).toBe(true);
    expect(result.gpuLayers).toBe(result.totalLayers);
    expect(result.message).toContain('Loaded all');
  });
});
