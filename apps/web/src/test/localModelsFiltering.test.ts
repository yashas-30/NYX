import { describe, it, expect } from 'vitest';
import { isCompanionSupportFile } from '../shared/hooks/useLocalModels';

describe('Local Models & Companion Files Filtering', () => {
  it('identifies MTP (Multi-Token Prediction) companion files', () => {
    expect(isCompanionSupportFile('mtp-gemma-4-E4B-it.gguf')).toBe(true);
    expect(isCompanionSupportFile('MTP/mtp-gemma-4-12B-it-Q4_0.gguf')).toBe(true);
    expect(isCompanionSupportFile('MTP/mtp-gemma-4-12B-it-BF16.gguf')).toBe(true);
    expect(isCompanionSupportFile('mtp_gemma_4.gguf')).toBe(true);
    expect(isCompanionSupportFile('gemma-4-E4B-it-mtp.gguf')).toBe(true);
    expect(isCompanionSupportFile('deepseek-v3-mtp-q4_k_m.gguf')).toBe(true);
    expect(isCompanionSupportFile('model.mtp')).toBe(true);
    expect(isCompanionSupportFile('speculative.mtp.gguf')).toBe(true);
    expect(isCompanionSupportFile('imatrix_unsloth.gguf_file')).toBe(true);
  });

  it('identifies speculative draft companion models', () => {
    expect(isCompanionSupportFile('draft-qwen2.5-0.5b.gguf')).toBe(true);
    expect(isCompanionSupportFile('draft_llama-1b.gguf')).toBe(true);
    expect(isCompanionSupportFile('qwen2.5-7b-draft.gguf')).toBe(true);
    expect(isCompanionSupportFile('deepseek-coder-6.7b_draft.gguf')).toBe(true);
  });

  it('identifies mmproj and multimodal projector files', () => {
    expect(isCompanionSupportFile('mmproj-BF16.gguf')).toBe(true);
    expect(isCompanionSupportFile('mmproj-F16.gguf')).toBe(true);
    expect(isCompanionSupportFile('mmproj-gemma-4-E4B-it-BF16.gguf')).toBe(true);
    expect(isCompanionSupportFile('llava-v1.6-projector.gguf')).toBe(true);
  });

  it('identifies diffusion/VAE/CLIP companion files', () => {
    expect(isCompanionSupportFile('ae.safetensors')).toBe(true);
    expect(isCompanionSupportFile('vae.safetensors')).toBe(true);
    expect(isCompanionSupportFile('clip_l.safetensors')).toBe(true);
    expect(isCompanionSupportFile('t5xxl_fp16.safetensors')).toBe(true);
    expect(isCompanionSupportFile('flux1-vae.safetensors')).toBe(true);
  });

  it('does NOT filter standalone LLM chat models', () => {
    expect(isCompanionSupportFile('gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf')).toBe(false);
    expect(isCompanionSupportFile('qwen2.5-coder-7b-instruct-q4_k_m.gguf')).toBe(false);
    expect(isCompanionSupportFile('llama-3.2-3b-instruct-q8_0.gguf')).toBe(false);
    expect(isCompanionSupportFile('mistral-7b-instruct-v0.3.Q4_K_M.gguf')).toBe(false);
    expect(isCompanionSupportFile('deepseek-coder-v2-lite-instruct.gguf')).toBe(false);
  });

  it('handles null, undefined, or empty inputs gracefully', () => {
    expect(isCompanionSupportFile('')).toBe(false);
    expect(isCompanionSupportFile(null)).toBe(false);
    expect(isCompanionSupportFile(undefined)).toBe(false);
  });

  it('correctly derives capabilities from metadata without hardcoding or overwriting', async () => {
    const { useModelStore } = await import('../core/stores/useModelStore');
    const { getModelCapabilities } = await import('../infrastructure/utils/provider');

    // Simulate an omni-modal model (like Gemma 4 with vision, audio, tools, and reasoning)
    useModelStore.setState({
      localLibraryModels: [
        {
          id: 'llm/unorganized/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf',
          name: 'gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf',
          supports_vision: true,
          supports_audio: true,
          supports_tools: true,
          supports_reasoning: true,
          context_length: 131072,
          specs: {
            contextWindow: '131K',
            maxOutput: '8K',
            modality: 'Omni (Text + Vision + Audio)',
          },
          capabilities: {
            vision: true,
            audio: true,
            tools: true,
            toolCalling: true,
            reasoning: true,
          },
        },
      ],
    });

    const caps = getModelCapabilities('llm/unorganized/gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf');
    expect(caps.supportsVision).toBe(true);
    expect(caps.supportsAudio).toBe(true);
    expect(caps.supportsTools).toBe(true);
    expect(caps.supportsReasoning).toBe(true);
    expect(caps.contextWindow).toBe(131072);
  });
});
