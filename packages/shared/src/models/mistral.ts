import { ModelOption } from '../types.js';

/**
 * Mistral AI Models (La Plateforme)
 * Endpoint: https://api.mistral.ai/v1/chat/completions
 * Documentation: https://docs.mistral.ai/getting-started/models/
 * Free / Experimentation Tier: 1 RPS (60 RPM), 500K TPM, $10/month free experimentation credits
 */
export const MISTRAL_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // MISTRAL FOUNDATION & FRONTIER MODELS
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium 3.5 (128B)',
    provider: 'mistral',
    status: 'ga',
    description:
      'Mistral 128B parameter flagship medium model for advanced multimodal reasoning, code generation, and low-latency analysis.',
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text + Image + Code',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Context Window',
      'Balanced reasoning accuracy and high token throughput',
      'Multimodal image and chart understanding',
    ],
    pros: ['High instruction adherence and fast response times'],
    cons: ['Vision support requires standard resolution formats'],
    limits: {
      rpm: 60,
      tpm: 500000,
      rpd: null,
    },
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small 4',
    provider: 'mistral',
    status: 'ga',
    description:
      'Mistral Small 4 efficient multimodal and code generation model with 256K context. High throughput, low cost, and fast execution.',
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text + Image + Code',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Context Window',
      'Lightweight multimodal architecture',
      'Fast streaming inference for interactive chat',
    ],
    pros: [
      'Economical token cost with frontier instruction following',
      'Multimodal image analysis on free tier',
    ],
    cons: ['Slightly lower reasoning depth on highly complex mathematical proofs'],
    limits: {
      rpm: 60,
      tpm: 500000,
      rpd: null,
    },
  },
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large 3',
    provider: 'mistral',
    status: 'ga',
    description:
      "Mistral AI's top-tier frontier foundation model with 256K context. Exceptional multilingual fluency, advanced coding, and complex logic.",
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '32,768 (32K)',
      modality: 'Multimodal',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Token Long-Context Window',
      'Multimodal image ingestion and visual document parsing',
      'Native function calling and JSON output mode',
      'Top-tier multilingual fluency across dozens of languages',
    ],
    pros: [
      'Superb multi-language code and mathematical synthesis',
      'Massive 256K input context capacity',
    ],
    cons: ['Free tier has 1 RPS (60 RPM) rate limit'],
    limits: {
      rpm: 60,
      tpm: 500000,
      rpd: null,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // MINISTRAL EDGE & VISION SERIES
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'ministral-8b-latest',
    name: 'Ministral 3 8B',
    provider: 'mistral',
    status: 'ga',
    description:
      'Ministral 3 8B high-performance edge and fast-inference multimodal reasoning model with 256K context.',
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '16,384 (16K)',
      modality: 'Text + Vision',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Token Context Window on an 8B footprint',
      'High-speed generation optimized for real-time workflows',
      'Function calling and structured JSON output',
      'Vision and image understanding support',
    ],
    pros: [
      'Extraordinary context length for an 8B model',
      'Low latency and consistent output quality',
    ],
    cons: ['Free tier has 1 RPS (60 RPM) rate limit'],
    limits: {
      rpm: 60,
      tpm: 500000,
      rpd: null,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // SPECIALIZED CODING
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: 'mistral',
    status: 'ga',
    description:
      'Mistral AI dedicated state-of-the-art coding model with 128K context window. Trained on 80+ programming languages with fill-in-the-middle (FIM) support.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '32,768 (32K)',
      modality: 'Code',
    },
    capabilities: {
      vision: false,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '128K Context Window specialized for full-codebase ingestion',
      'Fill-in-the-middle (FIM) code completion and refactoring',
      'Proficient in Python, Rust, TypeScript, C++, Go, Java, and 80+ languages',
    ],
    pros: ['Industry-leading open code generation and inline completion'],
    cons: ['Specialized for coding tasks rather than general creative writing'],
    limits: {
      rpm: 60,
      tpm: 500000,
      rpd: null,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // MINISTRAL EDGE & VISION MODELS (CONT.)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'ministral-3b-latest',
    name: 'Ministral 3 3B',
    provider: 'mistral',
    status: 'ga',
    description:
      'Ministral 3 3B ultra-fast lightweight model with 256K context window for instant edge tasks and subagent verification.',
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text + Vision',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Context Window',
      'Compact 3B parameter parameterization',
      'Sub-millisecond token latency',
      'Vision and multimodal input support',
    ],
    pros: ['Ultra-fast generation for rapid summarization and extraction'],
    cons: ['Smaller capacity for deeply nuanced reasoning'],
    limits: {
      rpm: 60,
      tpm: 500000,
      rpd: null,
    },
  },
  {
    id: 'ministral-14b-latest',
    name: 'Ministral 3 14B',
    provider: 'mistral',
    status: 'ga',
    description:
      'Ministral 3 14B balanced high-precision reasoning and multimodal model with 256K context window.',
    specs: {
      contextWindow: '262,144 (256K)',
      maxOutput: '16,384 (16K)',
      modality: 'Text + Vision',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: true,
    },
    supportsThinking: false,
    features: [
      '256K Context Window',
      '14B Parameter balanced density',
      'Structured tool use and data extraction',
      'Vision and image understanding support',
    ],
    pros: ['Sweet spot between throughput and logical rigor'],
    cons: ['Free tier has 1 RPS (60 RPM) rate limit'],
    limits: {
      rpm: 60,
      tpm: 500000,
      rpd: null,
    },
  },
];
