import { ModelOption } from '../types.js';

/**
 * Groq Cloud Models (Ultra-Fast LPU Inference Engine)
 * Endpoint: https://api.groq.com/openai/v1/chat/completions
 * Documentation: https://console.groq.com/docs/models
 * Free Developer Tier: 30 RPM, 6,000–30,000 TPM, 1,000–14,400 RPD
 */
export const GROQ_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENAI GPT OSS SERIES ACCELERATED ON GROQ LPU
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B (Groq LPU)',
    provider: 'groq',
    status: 'ga',
    description:
      'OpenAI flagship open-weight 120B parameter reasoning model running at blazing speed on Groq Language Processing Units (LPUs). Advanced multi-step logic, coding, and mathematical reasoning.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '65,536 (65K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '131K Token Context Window',
      '65K Maximum Output Token Limit',
      'Ultra-fast generation on Groq LPU silicon',
      'Deep chain-of-thought mathematical and algorithmic reasoning',
    ],
    pros: [
      'Massive 65K output token capacity for large-scale code synthesis and documents',
      'Top-tier reasoning on Groq ultra-low latency architecture',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 30,
      tpm: 20000,
      rpd: 1000,
    },
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT OSS 20B (Groq LPU)',
    provider: 'groq',
    status: 'ga',
    description:
      'OpenAI lightweight 20B parameter reasoning model optimized for high-speed inference, real-time code generation, and structured outputs on Groq LPUs.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '65,536 (65K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '131K Token Context Window',
      '65K Maximum Output Token Limit',
      'Sub-millisecond token-to-token latency',
      'Reliable tool calling and structured extraction',
    ],
    pros: [
      'High-speed generation with 65K max output capacity',
      '1,000 RPD daily quota on free tier',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 30,
      tpm: 20000,
      rpd: 1000,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GROQ COMPOUND AGENTIC MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'groq/compound',
    name: 'Groq Compound',
    provider: 'groq',
    status: 'ga',
    description:
      'Groq Compound agentic model engineered for compound multi-step reasoning, tool coordination, and iterative plan execution.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      'Compound task decomposition and automated tool routing',
      '131K Context Window',
      'Multi-turn state tracking',
    ],
    pros: ['Designed specifically for autonomous agent loops and workflows'],
    cons: ['Daily request limit (250 RPD)'],
    limits: {
      rpm: 30,
      tpm: 10000,
      rpd: 250,
    },
  },
  {
    id: 'groq/compound-mini',
    name: 'Groq Compound Mini',
    provider: 'groq',
    status: 'ga',
    description:
      'Groq Compound Mini fast agentic model optimized for low-latency intermediate subagent steps and rapid verification.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      'Fast agentic decision routing',
      '131K Context Window',
      'Ultra-low latency execution',
    ],
    pros: ['Quick turnarounds in multi-agent pipelines'],
    cons: ['250 RPD daily quota'],
    limits: {
      rpm: 30,
      tpm: 10000,
      rpd: 250,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // HIGH-THROUGHPUT MULTILINGUAL MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'qwen/qwen3.6-27b',
    name: 'Qwen 3.6 27B',
    provider: 'groq',
    status: 'ga',
    description:
      'Alibaba Qwen 3.6 27B high-performance model running at high throughput on Groq LPUs. Strong multilingual, math, and code generation performance.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '16,384 (16K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '131K Token Context Window',
      'High-speed LPU inference (~400+ tokens/sec)',
      'Rich multilingual comprehension and code generation',
    ],
    pros: ['Balanced 27B parameter weight with high throughput', '16K output token capacity'],
    cons: ['Text-only modality'],
    limits: {
      rpm: 30,
      tpm: 20000,
      rpd: 1000,
    },
  },
];
