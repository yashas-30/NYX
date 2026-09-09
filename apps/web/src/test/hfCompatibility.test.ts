import { describe, it, expect } from 'vitest';
import {
  extractQuantToken,
  parseQuantDetails,
  findMatchingSupportFile,
  analyzeHardwareMatch,
  pickBestFile,
  classifyHfFile,
  deriveModelFolderName,
  type CompanionFileInfo,
} from '../features/hf-explorer/lib/utils';

describe('HF Explorer - Quantization Parsing & Grammar', () => {
  it('extracts standard and modern quantization tokens accurately', () => {
    expect(extractQuantToken('Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf')).toBe('Q4_K_M');
    expect(extractQuantToken('Meta-Llama-3.1-8B-Instruct-Q4_K_S.gguf')).toBe('Q4_K_S');
    expect(extractQuantToken('Meta-Llama-3.1-8B-Instruct-Q4_K_L.gguf')).toBe('Q4_K_L');
    expect(extractQuantToken('model-Q4_0.gguf')).toBe('Q4_0');
    expect(extractQuantToken('model-Q4_1.gguf')).toBe('Q4_1');
    expect(extractQuantToken('gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf')).toBe('UD-Q4_K_XL');
    expect(extractQuantToken('mistral-7b-UD-IQ4_NL.gguf')).toBe('UD-IQ4_NL');
    expect(extractQuantToken('deepseek-r1-distill-qwen-7b-IQ4_XS.gguf')).toBe('IQ4_XS');
    expect(extractQuantToken('phi-4-IQ3_M.gguf')).toBe('IQ3_M');
    expect(extractQuantToken('qwen2.5-coder-7b-Q8_0.gguf')).toBe('Q8_0');
    expect(extractQuantToken('model-f16.gguf')).toBe('F16');
    expect(extractQuantToken('model-bf16.gguf')).toBe('BF16');
    expect(extractQuantToken('model-q5_k_m-00001-of-00003.gguf')).toBe('Q5_K_M');
  });

  it('parses quant details with accurate bits and quality labels', () => {
    const q4km = parseQuantDetails('Llama-3.1-8B-Instruct-Q4_K_M.gguf');
    expect(q4km.quant).toBe('Q4_K_M');
    expect(q4km.bits).toBe('4.5 bpw');
    expect(q4km.qualityLabel).toContain('Balanced');

    const udQ4 = parseQuantDetails('gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf');
    expect(udQ4.quant).toBe('UD-Q4_K_XL');
    expect(udQ4.bits).toBe('4.9 bpw');
    expect(udQ4.qualityLabel).toContain('Extra-Large');

    const iq4 = parseQuantDetails('model-IQ4_XS.gguf');
    expect(iq4.quant).toBe('IQ4_XS');
    expect(iq4.bits).toBe('4.25 bpw');

    const q8 = parseQuantDetails('model-Q8_0.gguf');
    expect(q8.quant).toBe('Q8_0');
    expect(q8.bits).toBe('8.0 bpw');
    expect(q8.qualityLabel).toContain('Near-Lossless');
  });
});

describe('HF Explorer - Dynamic Quantization-Aware Support File Pairing', () => {
  const createMockCompanion = (
    filename: string,
    size: number,
    type: 'vision' | 'audio' | 'draft' = 'vision'
  ): CompanionFileInfo => ({
    file: {
      filename,
      size,
    },
    type,
    label: `Companion (${filename})`,
  });

  it('pairs exact quantization support file when available', () => {
    const companions: CompanionFileInfo[] = [
      createMockCompanion('mmproj-model-f16.gguf', 1_200_000_000),
      createMockCompanion('mmproj-model-Q4_K_M.gguf', 450_000_000),
      createMockCompanion('mmproj-model-Q8_0.gguf', 750_000_000),
    ];

    const paired = findMatchingSupportFile(companions, 'Q4_K_M', 'vision');
    expect(paired).toBeDefined();
    expect(paired?.file.filename).toBe('mmproj-model-Q4_K_M.gguf');
    expect(paired?.file.size).toBe(450_000_000);
  });

  it('pairs family quantization support file when exact variant is not present', () => {
    const companions: CompanionFileInfo[] = [
      createMockCompanion('mmproj-model-f16.gguf', 1_200_000_000),
      createMockCompanion('mmproj-model-q4_0.gguf', 420_000_000),
      createMockCompanion('mmproj-model-Q8_0.gguf', 750_000_000),
    ];

    // For a Q4_K_S model, it should prefer q4_0 over f16
    const paired = findMatchingSupportFile(companions, 'Q4_K_S', 'vision');
    expect(paired).toBeDefined();
    expect(paired?.file.filename).toBe('mmproj-model-q4_0.gguf');
  });

  it('falls back cleanly to F16 when no quantized support file exists in the repository', () => {
    const companions: CompanionFileInfo[] = [
      createMockCompanion('mmproj-model-f16.gguf', 1_200_000_000),
      createMockCompanion('mmproj-model-bf16.gguf', 1_200_000_000),
    ];

    const paired = findMatchingSupportFile(companions, 'Q4_K_M', 'vision');
    expect(paired).toBeDefined();
    expect(paired?.file.filename).toBe('mmproj-model-f16.gguf');
  });

  it('returns undefined if no matching companion category exists', () => {
    const companions: CompanionFileInfo[] = [
      createMockCompanion('draft-model-q4_0.gguf', 500_000_000, 'draft'),
    ];

    const paired = findMatchingSupportFile(companions, 'Q4_K_M', 'vision');
    expect(paired).toBeNull();
  });
});

describe('HF Explorer - Device Compatibility Logic (VRAM vs Shared Memory)', () => {
  // Test hardware scenario: Dedicated GPU with 8 GB VRAM, 16 GB Total RAM (8 GB Shared GPU Memory)
  const dGpuHardware = {
    total_ram: 16 * 1024 ** 3,
    gpu_vram: 8 * 1024 ** 3,
    dedicated_vram: 8 * 1024 ** 3,
    shared_gpu_memory: 8 * 1024 ** 3,
    has_dedicated_gpu: true,
    gpu_name: 'NVIDIA GeForce RTX 4060 Laptop GPU',
  };

  it('returns "Fits in device" when model and support files completely fit in dedicated VRAM', () => {
    // 4 GB model + 400 MB support file + KV cache fits easily in 8 GB VRAM
    const modelBytes = 4 * 1024 ** 3;
    const supportBytes = 400 * 1024 ** 2;

    const result = analyzeHardwareMatch(modelBytes, supportBytes, dGpuHardware);
    expect(result.tier).toBe('full_gpu');
    expect(result.label).toBe('Fits in device');
    expect(result.badgeText).toContain('Fits in device');
    expect(result.color).toBe('emerald');
    expect(result.estimatedOffloadPercent).toBe(100);
  });

  it('returns "Some layers and support files will be loaded in shared GPU memory" when dedicated VRAM is exceeded but shared memory can accommodate it', () => {
    // 9 GB model + 600 MB support file exceeds 8 GB VRAM (usable ~6.8 GB),
    // but easily fits in Dedicated VRAM + Shared GPU Memory (~14.4 GB limit)
    const modelBytes = 9 * 1024 ** 3;
    const supportBytes = 600 * 1024 ** 2;

    const result = analyzeHardwareMatch(modelBytes, supportBytes, dGpuHardware);
    expect(result.tier).toBe('partial_gpu');
    expect(result.label).toBe('Some layers and support files will be loaded in shared GPU memory');
    expect(result.badgeText).toContain(
      'Some layers and support files will be loaded in shared GPU memory'
    );
    expect(result.color).toBe('blue');
    expect(result.estimatedOffloadPercent).toBeGreaterThan(0);
    expect(result.estimatedOffloadPercent).toBeLessThan(100);
    expect(result.explanation).toContain('shared GPU memory');
  });

  it('returns "Will not fit" when model and support files exceed both dedicated VRAM and shared GPU memory', () => {
    // 25 GB model exceeds both 8 GB VRAM and 8 GB Shared Memory
    const modelBytes = 25 * 1024 ** 3;
    const supportBytes = 1 * 1024 ** 3;

    const result = analyzeHardwareMatch(modelBytes, supportBytes, dGpuHardware);
    expect(result.tier).toBe('too_large');
    expect(result.label).toBe('Will not fit');
    expect(result.badgeText).toContain('Will not fit');
    expect(result.color).toBe('rose');
    expect(result.explanation).toContain('Will not fit');
  });

  it('handles unified memory / integrated GPU architectures cleanly', () => {
    // Integrated GPU with 16 GB unified RAM (no dedicated VRAM)
    const igpuHardware = {
      total_ram: 16 * 1024 ** 3,
      gpu_vram: 0,
      dedicated_vram: 0,
      shared_gpu_memory: 8 * 1024 ** 3,
      has_dedicated_gpu: false,
    };

    // 4 GB model fits in unified memory
    const fitResult = analyzeHardwareMatch(4 * 1024 ** 3, 0, igpuHardware);
    expect(fitResult.tier).toBe('full_gpu');
    expect(fitResult.label).toBe('Fits in device');

    // 15 GB model exceeds system memory budget
    const noFitResult = analyzeHardwareMatch(15 * 1024 ** 3, 0, igpuHardware);
    expect(noFitResult.tier).toBe('too_large');
    expect(noFitResult.label).toBe('Will not fit');
  });
});

describe('HF Explorer - Best File Recommendation', () => {
  const dGpuHardware = {
    total_ram: 16 * 1024 ** 3,
    gpu_vram: 8 * 1024 ** 3,
    dedicated_vram: 8 * 1024 ** 3,
    shared_gpu_memory: 8 * 1024 ** 3,
    has_dedicated_gpu: true,
  };

  it('picks the highest quality quant that fits in dedicated VRAM', () => {
    const files = [
      { filename: 'model-Q8_0.gguf', size: 10 * 1024 ** 3, supportSize: 500 * 1024 ** 2 }, // Exceeds VRAM
      { filename: 'model-Q5_K_M.gguf', size: 6 * 1024 ** 3, supportSize: 400 * 1024 ** 2 }, // Tight/spills over
      { filename: 'model-Q4_K_M.gguf', size: 4.8 * 1024 ** 3, supportSize: 400 * 1024 ** 2 }, // Fits in VRAM
      { filename: 'model-IQ3_M.gguf', size: 3.5 * 1024 ** 3, supportSize: 300 * 1024 ** 2 },
    ];

    const best = pickBestFile(files, dGpuHardware);
    expect(best).toBe('model-Q4_K_M.gguf');
  });

  it('returns null if all files exceed total device capacity', () => {
    const files = [
      { filename: '70b-Q8_0.gguf', size: 75 * 1024 ** 3 },
      { filename: '70b-Q4_K_M.gguf', size: 42 * 1024 ** 3 },
      { filename: '70b-IQ2_XXS.gguf', size: 28 * 1024 ** 3 },
    ];

    const best = pickBestFile(files, dGpuHardware);
    expect(best).toBeNull();
  });
});

describe('HF Explorer - Live Repository File Classification (Real HF Structures)', () => {
  it('correctly classifies standalone models vs companions with directories', () => {
    expect(classifyHfFile('MTP/mtp-gemma-4-12B-it-BF16.gguf')).toEqual({
      category: 'draft',
      companionType: 'draft',
      label: 'MTP Speculative Model (mtp-gemma-4-12b-it-bf16.gguf)',
    });
    expect(classifyHfFile('MTP/mtp-gemma-4-12B-it-Q4_0.gguf')).toEqual({
      category: 'draft',
      companionType: 'draft',
      label: 'MTP Speculative Model (mtp-gemma-4-12b-it-q4_0.gguf)',
    });
    expect(classifyHfFile('mmproj-BF16.gguf')).toEqual({
      category: 'vision',
      companionType: 'vision',
      label: 'Vision Projector (mmproj-bf16.gguf)',
    });
    expect(classifyHfFile('gemma-4-12B-it-qat-UD-Q4_K_XL.gguf')).toEqual({
      category: 'model',
    });
    expect(classifyHfFile('README.md')).toEqual({
      category: 'ignored',
    });
    expect(classifyHfFile('imatrix_unsloth.gguf_file')).toEqual({
      category: 'ignored',
    });
  });

  it('accurately resolves real unsloth/gemma-4-12B-it-qat-GGUF repository files without fake 650MB models', () => {
    const liveHfFiles = [
      { filename: 'MTP/README.md', size: 2513 },
      { filename: 'MTP/mtp-gemma-4-12B-it-BF16.gguf', size: 861538816 },
      { filename: 'MTP/mtp-gemma-4-12B-it-F16.gguf', size: 861538816 },
      { filename: 'MTP/mtp-gemma-4-12B-it-Q4_0.gguf', size: 253708800 },
      { filename: 'MTP/mtp-gemma-4-12B-it-Q8_0.gguf', size: 465127936 },
      { filename: 'README.md', size: 30915 },
      { filename: 'gemma-4-12B-it-qat-UD-Q4_K_XL.gguf', size: 6716356800 },
      { filename: 'mmproj-BF16.gguf', size: 175115840 },
      { filename: 'mmproj-F16.gguf', size: 175115840 },
      { filename: 'mmproj-F32.gguf', size: 209522240 },
      { filename: 'mtp-gemma-4-12B-it.gguf', size: 253708800 },
    ];

    const models = liveHfFiles.filter((f) => classifyHfFile(f.filename).category === 'model');
    const companions = liveHfFiles.filter((f) => {
      const cat = classifyHfFile(f.filename).category;
      return cat === 'vision' || cat === 'audio' || cat === 'draft';
    });

    // Exactly 1 real model: 6.7GB UD-Q4_K_XL
    expect(models).toHaveLength(1);
    expect(models[0].filename).toBe('gemma-4-12B-it-qat-UD-Q4_K_XL.gguf');
    expect(models[0].size).toBe(6716356800);

    // MTP files are companions, not models
    expect(companions).toHaveLength(8);
    const draftCompanions = companions.filter(
      (c) => classifyHfFile(c.filename).category === 'draft'
    );
    expect(draftCompanions).toHaveLength(5);
  });

  it('classifies broad community vision and audio projector variations accurately', () => {
    expect(classifyHfFile('qwen2.5-vl-7b-instruct-vision-f16.gguf')).toEqual({
      category: 'vision',
      companionType: 'vision',
      label: 'Vision Projector (qwen2.5-vl-7b-instruct-vision-f16.gguf)',
    });
    expect(classifyHfFile('SmolVLM-Instruct.vision.f16.gguf')).toEqual({
      category: 'vision',
      companionType: 'vision',
      label: 'Vision Projector (smolvlm-instruct.vision.f16.gguf)',
    });
    expect(classifyHfFile('vit.gguf')).toEqual({
      category: 'vision',
      companionType: 'vision',
      label: 'Vision Projector (vit.gguf)',
    });
    expect(classifyHfFile('clip.gguf')).toEqual({
      category: 'vision',
      companionType: 'vision',
      label: 'Vision Projector (clip.gguf)',
    });
    expect(classifyHfFile('whisper-small-audio-projector.gguf')).toEqual({
      category: 'audio',
      companionType: 'audio',
      label: 'Audio Projector (whisper-small-audio-projector.gguf)',
    });
  });

  it('derives dedicated model folder names identically to the Rust backend', () => {
    expect(deriveModelFolderName('unsloth/gemma-4-E2B-it-GGUF')).toBe('gemma-4-E2B-it');
    expect(deriveModelFolderName('unsloth/gemma-4-E4B-it-qat-GGUF')).toBe('gemma-4-E4B-it-qat');
    expect(deriveModelFolderName('Qwen/Qwen3.5-3B-GGUF')).toBe('Qwen3.5-3B');
    expect(deriveModelFolderName('unsloth/Qwen3.5-9B-GGUF')).toBe('Qwen3.5-9B');
    expect(deriveModelFolderName('', 'model-alpha-Q4_K_M.gguf')).toBe('model-alpha');
    expect(deriveModelFolderName('', 'Ornith-1.5-9B.mmproj-bf16.gguf')).toBe('Ornith-1.5-9B');
    expect(deriveModelFolderName('', 'mtp-model-alpha.gguf')).toBe('model-alpha');
    expect(deriveModelFolderName('', 'mmproj-model-alpha-BF16.gguf')).toBe('model-alpha');
  });
});
