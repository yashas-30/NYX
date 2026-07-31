// src/features/hf-explorer/constants/capabilities.ts
export const CAP_COLOR_MAP: Record<string, string> = {
  purple:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pink:    'bg-pink-500/10 text-pink-400 border-pink-500/20',
  sky:     'bg-sky-500/10 text-sky-400 border-sky-500/20',
  teal:    'bg-teal-500/10 text-teal-400 border-teal-500/20',
  indigo:  'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  rose:    'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export const NOISE_TAGS = new Set([
  'gguf', 'transformers', 'quantized', 'safetensors', 'pytorch', 'jax',
  'endpoints_compatible', 'text-generation-inference', 'region:us', 'autotrain_compatible',
  'has_space', 'diffusers', 'text-generation', 'conversational', 'en', 'dataset:unknown',
]);
