// src/features/hf-explorer/lib/capabilities.ts
import type { CapabilityTag } from '../types';

export function getCapabilityTags(
  modelId: string,
  tags: string[],
  hasVision: boolean,
  readme: string
): CapabilityTag[] {
  const id = modelId.toLowerCase();
  const t = tags.map(x => x.toLowerCase());
  const r = readme.toLowerCase();
  const caps: CapabilityTag[] = [];

  if (
    hasVision ||
    id.includes('vision') ||
    id.includes('-vl') ||
    id.includes('vl-') ||
    id.includes('llava') ||
    id.includes('pixtral') ||
    id.includes('moondream') ||
    t.some(x => x.includes('vision') || x.includes('multimodal'))
  ) {
    caps.push({ label: 'Vision', color: 'purple' });
  }

  if (
    id.includes('reasoning') ||
    id.includes('think') ||
    id.includes('-r1') ||
    id.includes('qwq') ||
    id.includes('-o1') ||
    r.includes('chain-of-thought') ||
    r.includes(' reasoning')
  ) {
    caps.push({ label: 'Thinking', color: 'amber' });
  }

  if (
    id.includes('coder') ||
    id.includes('-code') ||
    id.includes('code-') ||
    id.includes('devstral') ||
    id.includes('starcoder') ||
    id.includes('codellama') ||
    t.some(x => x.includes('code') || x.includes('programming'))
  ) {
    caps.push({ label: 'Coding', color: 'emerald' });
  }

  if (
    id.includes('tool') ||
    id.includes('hermes') ||
    id.includes('functionary') ||
    t.some(x => x.includes('tool') || x.includes('function')) ||
    r.includes('tool calling') ||
    r.includes('function calling')
  ) {
    caps.push({ label: 'Tool Use', color: 'blue' });
  }

  if (
    id.includes('math') ||
    id.includes('numina') ||
    t.some(x => x.includes('math'))
  ) {
    caps.push({ label: 'Math', color: 'pink' });
  }

  if (
    id.includes('instruct') ||
    id.includes('-chat') ||
    id.includes('chat-') ||
    id.includes('-it') ||
    id.includes('-sft') ||
    id.includes('-dpo')
  ) {
    caps.push({ label: 'Instruct', color: 'sky' });
  }

  if (
    id.includes('multilingual') ||
    t.filter(x => x.length === 2 && /^[a-z]{2}$/.test(x) && x !== 'en').length >= 2 ||
    r.includes('multilingual')
  ) {
    caps.push({ label: 'Multilingual', color: 'teal' });
  }

  if (
    id.includes('embed') ||
    id.includes('e5-') ||
    id.includes('bge-') ||
    t.some(x => x === 'sentence-similarity' || x === 'feature-extraction')
  ) {
    caps.push({ label: 'Embeddings', color: 'indigo' });
  }

  if (
    id.includes('roleplay') ||
    id.includes('uncensored') ||
    id.includes('dolphin') ||
    id.includes('abliterated')
  ) {
    caps.push({ label: 'Roleplay', color: 'rose' });
  }

  return caps;
}

export function getDisplayTags(tags: string[], modelId: string): string[] {
  const NOISE_TAGS = new Set([
    'gguf', 'transformers', 'quantized', 'safetensors', 'pytorch', 'jax',
    'endpoints_compatible', 'text-generation-inference', 'region:us', 'autotrain_compatible',
    'has_space', 'diffusers', 'text-generation', 'conversational', 'en', 'dataset:unknown',
  ]);

  const meaningful: string[] = [];
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (NOISE_TAGS.has(t) || t.startsWith('license:') || t.startsWith('base_model:') || t.length <= 1) continue;
    if (/^[a-z]{2}$/.test(t) && t !== 'en') {
      meaningful.push(t.toUpperCase());
      continue;
    }
    if (
      ['llama', 'mistral', 'qwen', 'gemma', 'phi', 'falcon', 'mpt', 'rwkv', 'mamba', 'gpt', 'bloom', 'olmo']
        .some(f => t.includes(f))
    ) {
      meaningful.push(tag);
      continue;
    }
    if (
      t.includes('128k') ||
      t.includes('64k') ||
      t.includes('32k') ||
      t.includes('1m') ||
      /\d+b$/.test(t)
    ) {
      meaningful.push(tag);
      continue;
    }
    if (tag.length <= 20 && !t.includes('/') && !t.includes(':')) {
      meaningful.push(tag);
    }
  }

  const seen = new Set<string>();
  return meaningful
    .filter(t => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 6);
}
