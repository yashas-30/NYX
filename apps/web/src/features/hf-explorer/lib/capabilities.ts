// src/features/hf-explorer/lib/capabilities.ts
import type { CapabilityTag } from '../types';

/**
 * Extracts accurate capability tags based on HF pipeline_tag, verified model tags,
 * and unambiguous model ID naming conventions.
 * Does NOT perform loose full-text substring searches on README bodies to avoid false positives.
 */
export function getCapabilityTags(
  modelId: string,
  tags: string[] = [],
  pipelineTag?: string,
  hasVisionProjector: boolean = false
): CapabilityTag[] {
  const id = modelId.toLowerCase();
  const t = tags.map((x) => x.toLowerCase());
  const p = (pipelineTag || '').toLowerCase();
  const caps: CapabilityTag[] = [];

  // 1. Multimodal / Vision
  const isVision =
    hasVisionProjector ||
    p === 'image-text-to-text' ||
    p === 'image-to-text' ||
    p === 'visual-question-answering' ||
    p === 'document-question-answering' ||
    t.includes('vision') ||
    t.includes('multimodal') ||
    t.includes('image-to-text') ||
    t.includes('image-text-to-text') ||
    /(?:^|\/|[._-])(vision|vl|llava|pixtral|moondream|florence|minicpm-v|internvl|deepseek-vl|qwen2(?:\.5)?-vl)(?:[._-]|$)/i.test(
      id
    );

  if (isVision) {
    caps.push({ label: 'Vision', color: 'purple' });
  }

  // 2. Reasoning / Thinking (CoT / R1 class models)
  const isReasoning =
    t.includes('reasoning') ||
    t.includes('deepseek-r1') ||
    t.includes('chain-of-thought') ||
    /(?:^|\/|[._-])(r1|qwq|o1|reasoning|deepseek-r1|marco-o1|krec-r1)(?:[._-]|$)/i.test(id);

  if (isReasoning) {
    caps.push({ label: 'Reasoning', color: 'amber' });
  }

  // 3. Coding / Programming
  const isCoding =
    t.includes('code') ||
    t.includes('coding') ||
    t.includes('code-generation') ||
    t.includes('programming') ||
    /(?:^|\/|[._-])(coder|starcoder|codellama|deepseek-coder|devstral|wizardcoder|codegeex|qwen2\.5-coder)(?:[._-]|$)/i.test(
      id
    );

  if (isCoding) {
    caps.push({ label: 'Coding', color: 'emerald' });
  }

  // 4. Tool Use / Function Calling
  const isToolUse =
    t.includes('function-calling') ||
    t.includes('tool-use') ||
    t.includes('tools') ||
    /(?:^|\/|[._-])(hermes|functionary|gorilla|tool-use)(?:[._-]|$)/i.test(id);

  if (isToolUse) {
    caps.push({ label: 'Tool Use', color: 'blue' });
  }

  // 5. Mathematics
  const isMath =
    t.includes('math') ||
    t.includes('mathematics') ||
    /(?:^|\/|[._-])(math|numina|deepseek-math|qwen2\.5-math)(?:[._-]|$)/i.test(id);

  if (isMath) {
    caps.push({ label: 'Math', color: 'pink' });
  }

  // 6. Embeddings / Sentence Similarity
  const isEmbedding =
    p === 'feature-extraction' ||
    p === 'sentence-similarity' ||
    t.includes('sentence-similarity') ||
    t.includes('feature-extraction') ||
    t.includes('embeddings') ||
    /(?:^|\/|[._-])(embed|bge|e5|gte|nomic-embed|instructor)(?:[._-]|$)/i.test(id);

  if (isEmbedding) {
    caps.push({ label: 'Embeddings', color: 'indigo' });
  }

  // 7. Audio / Speech
  const isAudio =
    p === 'text-to-speech' ||
    p === 'automatic-speech-recognition' ||
    p === 'audio-to-audio' ||
    p === 'audio-classification' ||
    t.includes('audio') ||
    t.includes('speech') ||
    t.includes('whisper') ||
    t.includes('tts') ||
    t.includes('asr') ||
    /(?:^|\/|[._-])(whisper|bark|tts|speech|audio|parler)(?:[._-]|$)/i.test(id);

  if (isAudio) {
    caps.push({ label: 'Audio', color: 'teal' });
  }

  // 8. Image Generation (Diffusion)
  const isImageGen =
    p === 'text-to-image' ||
    p === 'image-to-image' ||
    t.includes('text-to-image') ||
    t.includes('diffusers') ||
    /(?:^|\/|[._-])(flux|sdxl|stable-diffusion|diffusion)(?:[._-]|$)/i.test(id);

  if (isImageGen) {
    caps.push({ label: 'Image Gen', color: 'rose' });
  }

  // 9. Instruct / Chat
  const isChat =
    t.includes('conversational') ||
    t.includes('chat') ||
    t.includes('instruct') ||
    /(?:^|\/|[._-])(instruct|chat|it|dpo|sft)(?:[._-]|$)/i.test(id);

  if (isChat && !isReasoning && !isCoding && !isVision && caps.length === 0) {
    caps.push({ label: 'Instruct', color: 'sky' });
  }

  return caps;
}

/**
 * Extracts architecture family name from tags or model ID
 */
export function getArchitectureName(modelId: string, tags: string[] = []): string {
  const t = tags.map((x) => x.toLowerCase());
  const id = modelId.toLowerCase();

  const families = [
    {
      name: 'Llama',
      match: ['llama', 'llama-2', 'llama-3', 'llama-3.1', 'llama-3.2', 'llama-3.3'],
    },
    { name: 'Qwen', match: ['qwen', 'qwen2', 'qwen2.5', 'qwq'] },
    { name: 'DeepSeek', match: ['deepseek', 'deepseek-v2', 'deepseek-v3', 'deepseek-r1'] },
    { name: 'Mistral', match: ['mistral', 'mixtral', 'devstral', 'codestral', 'ministral'] },
    { name: 'Gemma', match: ['gemma', 'gemma-2'] },
    { name: 'Phi', match: ['phi', 'phi-3', 'phi-3.5', 'phi-4'] },
    { name: 'Falcon', match: ['falcon'] },
    { name: 'Command R', match: ['command-r', 'cohere'] },
    { name: 'Mamba', match: ['mamba', 'mamba2'] },
    { name: 'RWKV', match: ['rwkv'] },
    { name: 'Whisper', match: ['whisper'] },
    { name: 'Flux', match: ['flux'] },
    { name: 'Stable Diffusion', match: ['stable-diffusion', 'sdxl'] },
  ];

  for (const f of families) {
    if (f.match.some((m) => id.includes(m) || t.some((tag) => tag.includes(m)))) {
      return f.name;
    }
  }

  return 'Transformer';
}

/**
 * Extracts parameter count string e.g. "7B", "14B", "70B"
 */
export function extractParameterCount(
  modelId: string,
  tags: string[] = [],
  numParameters?: number
): string | null {
  if (numParameters && numParameters > 0) {
    if (numParameters >= 1_000_000_000) {
      const b = numParameters / 1_000_000_000;
      return b % 1 === 0 ? `${b}B` : `${parseFloat(b.toFixed(1))}B`;
    }
    if (numParameters >= 1_000_000) {
      const m = numParameters / 1_000_000;
      return m % 1 === 0 ? `${m}M` : `${parseFloat(m.toFixed(1))}M`;
    }
  }

  const name = modelId.split('/').pop() || modelId;
  const match = name.match(/(\d+(?:\.\d+)?)[Bb](?:[._-]|$)/);
  if (match) return `${match[1].toUpperCase()}B`;

  const tagMatch = tags.find((t) => typeof t === 'string' && /^[\d.]+[BM]$/i.test(t));
  if (tagMatch) return tagMatch.toUpperCase();

  const mMatch = name.match(/(\d+(?:\.\d+)?)[Mm](?:[._-]|$)/);
  if (mMatch) return `${mMatch[1].toUpperCase()}M`;

  return null;
}
