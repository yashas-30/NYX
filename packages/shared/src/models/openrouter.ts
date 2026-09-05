import { ModelOption } from '../types.js';

/**
 * OpenRouter Unified Model Catalog
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 * Documentation: https://openrouter.ai/models
 */
export const OPENROUTER_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENROUTER FREE MODELS CATALOG (11 MODELS)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'Nemotron 3 Super 120B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Super 120B parameter MoE flagship reasoning model with 262K context on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '262,144 (262K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
    },
    supportsThinking: true,
    features: [
      '262K input and 262K output token headroom',
      'MoE architecture optimized for reasoning and logic',
      'Free tier access with zero token cost',
    ],
    pros: ['Huge output token generation capability', 'Top-tier MoE reasoning'],
    cons: ['20 RPM / 50 RPD free tier limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'openai/gpt-oss-20b:free',
    name: 'GPT OSS 20B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'OpenAI 20B parameter open-weight reasoning model with 131K context window on OpenRouter free tier.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
    },
    supportsThinking: true,
    features: [
      '131K Context Window',
      '32K Output Token capacity',
      'Deep algorithmic reasoning and structured tool calling',
    ],
    pros: ['High-speed generation with strong reasoning quality'],
    cons: ['20 RPM / 50 RPD free tier cap'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere North Mini Code (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Cohere dedicated lightweight code generation and reasoning model with 256K context.',
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '65,536 (64K)',
      modality: 'Text (Code)',
    },
    capabilities: {
      vision: false,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Context Window specialized for codebases',
      '64K Output Token limit for comprehensive script generation',
      'Clean syntax generation and debugging support',
    ],
    pros: ['Fast code generation and high output ceiling at zero cost'],
    cons: ['20 RPM free tier rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Gemma 4 26B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Google Gemma 4 26B multimodal instruction-tuned model with 262K context on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text + Image',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '262K Token Long-Context Window',
      'Multimodal image ingestion and visual document parsing',
      'Dense 26B architecture optimized for fast token delivery',
    ],
    pros: ['Free multimodal vision and image understanding'],
    cons: ['20 RPM / 50 RPD limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Gemma 4 31B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Google Gemma 4 31B multimodal instruction model with 262K context on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text + Image',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '262K Context Window',
      'Multimodal image and text reasoning',
      'High instruction-following accuracy',
    ],
    pros: ['Multimodal visual comprehension on free tier'],
    cons: ['20 RPM / 50 RPD limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'inclusionai/ling-3.0-flash:free',
    name: 'Ling 3.0 Flash (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'InclusionAI Ling 3.0 Flash ultra-fast model with 262K context window on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '262K Context Window',
      'Fast inference latency for real-time applications',
      'Strong multilingual comprehension',
    ],
    pros: ['Large context capacity at zero cost'],
    cons: ['Text-only modality'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    name: 'Nemotron 3 Nano 30B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Nano 30B lightweight MoE model with 256K context on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Context Window',
      '30B MoE (3B active) parameter architecture',
      'Fast batch processing and extraction',
    ],
    pros: ['Rapid generation for micro-tasks and extraction'],
    cons: ['Text-only modality'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    name: 'Nemotron Nano 9B v2 (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron Nano 9B v2 compact high-efficiency model with 128K context on OpenRouter free tier.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '128K Context Window',
      'Compact 9B parameter footprint',
      'Low memory latency and snappy responses',
    ],
    pros: ['Fast response times on free tier'],
    cons: ['Text-only modality'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    name: 'Nemotron Nano 12B v2 VL (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron Nano 12B v2 Vision-Language multimodal model with 128K context and 128K max output.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '131,072 (128K)',
      modality: 'Text + Image',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '128K Context Window and 128K Output ceiling',
      'Multimodal image ingestion and visual document parsing',
      'Vision-language understanding on free tier',
    ],
    pros: ['Multimodal visual comprehension with full 128K output headroom'],
    cons: ['20 RPM / 50 RPD limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'poolside/laguna-s-2.1:free',
    name: 'Poolside Laguna S 2.1 (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Poolside Laguna S 2.1 advanced software engineering and software architecture model with 262K context.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text (Code)',
    },
    capabilities: {
      vision: false,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      'Specialized training on real-world Git repositories and software diffs',
      '262K Context Window',
      'Refactoring and multi-file code synthesis',
    ],
    pros: ['Solid refactoring and pull-request synthesis'],
    cons: ['20 RPM rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
  {
    id: 'poolside/laguna-xs-2.1:free',
    name: 'Poolside Laguna XS 2.1 (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Poolside Laguna XS 2.1 compact software engineering and fast code completion model with 262K context.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text (Code)',
    },
    capabilities: {
      vision: false,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '262K Context Window',
      'High-speed code completion and inline suggestion generation',
      'Zero token cost on OpenRouter free tier',
    ],
    pros: ['Ultra-fast code generation for real-time editing'],
    cons: ['20 RPM rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
];
