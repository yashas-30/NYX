// src/features/hf-explorer/lib/capabilities.ts
import type { CapabilityTag } from '../types';

export interface ModelMetadataContext {
  tags?: string[];
  pipelineTag?: string;
  hasVisionProjector?: boolean;
  hasAudioProjector?: boolean;
  gguf?: {
    architecture?: string;
    context_length?: number;
    chat_template?: string;
    total?: number;
    [key: string]: any;
  };
  config?: {
    architectures?: string[];
    model_type?: string;
    [key: string]: any;
  };
  baseModelTags?: string[];
}

/**
 * Extracts capability tags based on live HF metadata: pipeline_tag, verified tags,
 * Jinja2 chat_template tokens (thought, tool_call, etc.), and projector companion files.
 * Zero hardcoded model names.
 */
export function getCapabilityTags(
  modelId: string,
  tags: string[] = [],
  pipelineTag?: string,
  hasVisionProjector: boolean = false,
  extra?: ModelMetadataContext
): CapabilityTag[] {
  const t = [...tags, ...(extra?.baseModelTags || []), ...(extra?.tags || [])].map((x) =>
    x.toLowerCase()
  );
  const p = (pipelineTag || extra?.pipelineTag || '').toLowerCase();
  const chatTpl = (extra?.gguf?.chat_template || '').toLowerCase();
  const caps: CapabilityTag[] = [];

  const hasTag = (kw: string) => t.some((tag) => tag === kw || tag.includes(kw));

  // 1. Multimodal / Vision
  const isVision =
    hasVisionProjector ||
    Boolean(extra?.hasVisionProjector) ||
    p === 'image-text-to-text' ||
    p === 'image-to-text' ||
    p === 'visual-question-answering' ||
    p === 'document-question-answering' ||
    p === 'any-to-any' ||
    hasTag('vision') ||
    hasTag('multimodal') ||
    hasTag('image-to-text') ||
    hasTag('image-text-to-text') ||
    hasTag('any-to-any') ||
    chatTpl.includes('<|image|>') ||
    chatTpl.includes('image_url');

  if (isVision) {
    caps.push({ label: 'Vision', color: 'purple' });
  }

  // 2. Reasoning / Thinking (Chain-of-thought, thinking tokens)
  const isReasoning =
    hasTag('reasoning') ||
    hasTag('thinking') ||
    hasTag('thought') ||
    hasTag('chain-of-thought') ||
    p === 'reasoning' ||
    chatTpl.includes('<think>') ||
    chatTpl.includes('<|thought|>') ||
    chatTpl.includes('<|channel>thought') ||
    chatTpl.includes('thought\n') ||
    chatTpl.includes('enable_thinking') ||
    chatTpl.includes('strip_thinking') ||
    chatTpl.includes('[think]') ||
    chatTpl.includes('reasoning_content');

  if (isReasoning) {
    caps.push({ label: 'Reasoning', color: 'amber' });
  }

  // 3. Coding / Programming
  const isCoding =
    hasTag('code') ||
    hasTag('coding') ||
    hasTag('code-generation') ||
    hasTag('programming') ||
    p === 'code-generation';

  if (isCoding) {
    caps.push({ label: 'Coding', color: 'emerald' });
  }

  // 4. Tool Use / Function Calling / Agents
  const isToolUse =
    hasTag('function-calling') ||
    hasTag('tool-use') ||
    hasTag('tools') ||
    hasTag('agentic') ||
    hasTag('agent') ||
    chatTpl.includes('tool_call') ||
    chatTpl.includes('tool_response') ||
    chatTpl.includes('declaration:') ||
    chatTpl.includes('<|tool');

  if (isToolUse) {
    caps.push({ label: 'Tool Use', color: 'blue' });
  }

  // 5. Mathematics
  const isMath = hasTag('math') || hasTag('mathematics');

  if (isMath) {
    caps.push({ label: 'Math', color: 'pink' });
  }

  // 6. Embeddings / Sentence Similarity
  const isEmbedding =
    p === 'feature-extraction' ||
    p === 'sentence-similarity' ||
    hasTag('sentence-similarity') ||
    hasTag('feature-extraction') ||
    hasTag('embeddings');

  if (isEmbedding) {
    caps.push({ label: 'Embeddings', color: 'indigo' });
  }

  // 7. Audio / Speech
  const isAudio =
    Boolean(extra?.hasAudioProjector) ||
    p === 'text-to-speech' ||
    p === 'automatic-speech-recognition' ||
    p === 'audio-to-audio' ||
    p === 'audio-classification' ||
    hasTag('audio') ||
    hasTag('speech') ||
    hasTag('voice') ||
    hasTag('text-to-speech') ||
    hasTag('asr') ||
    hasTag('tts') ||
    chatTpl.includes('<|audio|>') ||
    chatTpl.includes('input_audio');

  if (isAudio) {
    caps.push({ label: 'Audio', color: 'teal' });
  }

  // 8. Image Generation (Diffusion)
  const isImageGen =
    p === 'text-to-image' ||
    p === 'image-to-image' ||
    hasTag('text-to-image') ||
    hasTag('diffusers');

  if (isImageGen) {
    caps.push({ label: 'Image Gen', color: 'rose' });
  }

  // 9. Instruct / Chat / Conversational
  const isChat =
    p === 'conversational' || hasTag('conversational') || hasTag('chat') || hasTag('instruct');

  if (isChat) {
    caps.push({ label: 'Instruct', color: 'sky' });
  }

  return caps;
}

/**
 * Formats a raw architecture or model type string into a human-readable title.
 * e.g. "gemma4" -> "Gemma 4", "Gemma4ForConditionalGeneration" -> "Gemma 4",
 * "qwen2_5_vl" -> "Qwen 2.5 VL", "llama" -> "Llama"
 */
function formatArchitecture(raw: string): string {
  if (!raw) return 'Transformer';
  let s = raw
    .replace(
      /(ForCausalLM|ForConditionalGeneration|ForSequenceClassification|Model|LMHeadModel)$/i,
      ''
    )
    .replace(/[_-]+/g, ' ')
    .trim();
  // Insert space between letters and numbers e.g. "gemma4" -> "gemma 4"
  s = s.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2');
  return s
    .split(' ')
    .map((w) => {
      const lower = w.toLowerCase();
      if (lower === 'vl') return 'VL';
      if (lower === 'moe') return 'MoE';
      if (lower === 'lm') return 'LM';
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * Extracts architecture name directly from GGUF metadata or model config.
 * Falls back to generic token derivation without hardcoding.
 */
export function getArchitectureName(
  modelId: string,
  tags: string[] = [],
  config?: { architectures?: string[]; model_type?: string },
  ggufMeta?: { architecture?: string }
): string {
  // 1. Direct from GGUF metadata
  if (ggufMeta?.architecture) {
    return formatArchitecture(ggufMeta.architecture);
  }

  // 2. Direct from config.model_type
  if (config?.model_type) {
    return formatArchitecture(config.model_type);
  }

  // 3. Direct from config.architectures[0]
  if (config?.architectures && config.architectures.length > 0) {
    return formatArchitecture(config.architectures[0]);
  }

  // 4. From tags containing architecture: or model_type:
  for (const t of tags) {
    const tl = t.toLowerCase();
    if (tl.startsWith('model_type:')) {
      return formatArchitecture(t.slice(11));
    }
    if (tl.startsWith('architecture:')) {
      return formatArchitecture(t.slice(13));
    }
  }

  // 5. Dynamic fallback: extract from model ID leading family word
  const name = modelId.split('/').pop() || modelId;
  const match = name.match(/^([a-zA-Z]+)(?:[-_](\d+(?:\.\d+)?))?/);
  if (match) {
    const base = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const ver = match[2] ? ` ${match[2]}` : '';
    return `${base}${ver}`;
  }

  return 'Transformer';
}

/**
 * Extracts parameter count string e.g. "2B", "7B", "14B", "26B (A4B)"
 */
export function extractParameterCount(
  modelId: string,
  tags: string[] = [],
  numParameters?: number,
  ggufMeta?: { total?: number; totalFileSize?: number; [key: string]: any }
): string | null {
  const count = numParameters || ggufMeta?.total;
  if (count && count > 0) {
    if (count >= 1_000_000_000) {
      const b = count / 1_000_000_000;
      return b % 1 === 0 ? `${b}B` : `${parseFloat(b.toFixed(1))}B`;
    }
    if (count >= 1_000_000) {
      const m = count / 1_000_000;
      return m % 1 === 0 ? `${m}M` : `${parseFloat(m.toFixed(1))}M`;
    }
  }

  const name = modelId.split('/').pop() || modelId;

  // Check for MoE pattern e.g. "26B-A4B", "120B-A12B"
  const moeMatch = name.match(/(\d+(?:\.\d+)?)[Bb][-._]?[Aa](\d+(?:\.\d+)?)[Bb]/i);
  if (moeMatch) {
    return `${moeMatch[1].toUpperCase()}B (A${moeMatch[2].toUpperCase()}B)`;
  }

  // Check for standard param notations e.g. "E2B", "E4B", "7B", "70B"
  const paramMatch = name.match(/(?:^|[-._/]|[Ee])(\d+(?:\.\d+)?)[Bb](?:[-._]|$)/);
  if (paramMatch) {
    return `${paramMatch[1].toUpperCase()}B`;
  }

  const tagMatch = tags.find((t) => typeof t === 'string' && /^[\d.]+[BM]$/i.test(t));
  if (tagMatch) return tagMatch.toUpperCase();

  const mMatch = name.match(/(?:^|[-._/]|[Ee])(\d+(?:\.\d+)?)[Mm](?:[-._]|$)/);
  if (mMatch) return `${mMatch[1].toUpperCase()}M`;

  return null;
}
