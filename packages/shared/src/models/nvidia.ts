import { ModelOption } from '../types.js';

/**
 * NVIDIA NIM (NVIDIA Inference Microservices) Catalog
 * Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
 * Documentation: https://build.nvidia.com/explore/discover
 * Free Developer Tier: 40 RPM, 10,000 RPD (1,000 free build credits upon sign-up at build.nvidia.com)
 */
export const NVIDIA_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // NVIDIA NIM CATALOG
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'deepseek-ai/deepseek-v4-pro-0813',
    name: 'DeepSeek V4 Pro',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'DeepSeek V4 Pro frontier MoE reasoning and algorithmic coding model hosted on NVIDIA NIM with TensorRT-LLM optimization. High throughput, deep mathematical logic, and advanced code synthesis.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '16,384 (16K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '128K Token Context Window with TensorRT-LLM acceleration',
      'Advanced mathematical synthesis, algorithmic coding, and multi-step reasoning',
      'High-throughput low-latency inference on NVIDIA DGX Cloud infrastructure',
    ],
    pros: [
      'Frontier reasoning accuracy with deep mathematical and code capabilities',
      'Fast token throughput on NVIDIA NIM cluster',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    name: 'Nemotron 3 Super 120B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Super 120B parameter (12B active) flagship reasoning and coding model with 1M context.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '262,144 (262K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '1M Token Context Window and 262K Max Output Token capacity',
      'MoE architecture optimized for code generation and technical synthesis',
      'TensorRT-LLM optimized fp8 inference',
    ],
    pros: [
      'Balanced reasoning accuracy and high token throughput',
      'Enormous output generation budget',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b',
    name: 'Nemotron 3 Nano 30B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Nano 30B lightweight MoE model with 262K context. High throughput and economical resource footprint.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '262K Context Window',
      '30B MoE (3B active) parameter architecture',
      'Fast batch processing and extraction',
    ],
    pros: ['High concurrency and rapid generation for micro-tasks'],
    cons: ['Best suited for direct tasks rather than multi-layered reasoning'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    name: 'Llama 3.1 Nemotron Ultra 253B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'NVIDIA Nemotron Ultra 253B massive parameter frontier reasoning model with TensorRT-LLM acceleration on NVIDIA DGX Cloud.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '4,096 (4K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '128K Context Window',
      'Ultra-dense 253B parameter reasoning architecture',
      'Advanced mathematical synthesis and code intelligence',
    ],
    pros: [
      'State-of-the-art benchmark reasoning and instruction following',
      'High-throughput inference on NVIDIA NIM clusters',
    ],
    cons: ['4K output limit'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    name: 'Meta Llama 3.3 70B Instruct',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Meta flagship open Llama 3.3 70B model hosted on NVIDIA high-speed NIM infrastructure with TensorRT-LLM acceleration.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '4,096 (4K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '128K Context Window',
      'Proven general knowledge, code generation, and multi-step tool use',
      'TensorRT-LLM optimized low latency',
    ],
    pros: [
      'Extremely fast response generation on NVIDIA infrastructure',
      'Reliable tool and function calling',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'mistralai/mistral-nemotron',
    name: 'Mistral Nemotron',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Mistral Nemotron high-efficiency reasoning model co-developed and optimized by Mistral AI and NVIDIA.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '128K Context Window',
      'Compact architecture fine-tuned for high throughput and reasoning',
      'Excellent multilingual and code generation accuracy',
    ],
    pros: ['Ultra-fast generation and low memory footprint'],
    cons: ['8K output limit'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'google/gemma-4-31b-it',
    name: 'Gemma 4 31B (NVIDIA NIM)',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Google Gemma 4 31B instruction model accelerated with TensorRT-LLM on NVIDIA NIM.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '262K Token Long-Context Window',
      'Dense 31B parameter instruction-tuned weights',
      'TensorRT-LLM acceleration on NVIDIA GPU backend',
    ],
    pros: ['Strong coding accuracy and reasoning on high-speed NIM backend'],
    cons: ['8K output limit'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'mistralai/mistral-large-2-instruct',
    name: 'Mistral Large 2 Instruct',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Mistral AI flagship frontier model with 128K context. Exceptional multilingual fluency, advanced coding, and complex logic.',
    specs: {
      contextWindow: '131,072 (128K)',
      maxOutput: '4,096 (4K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '128K Context Window',
      'Native function calling and agentic task execution',
      'High-tier benchmark performance on coding and reasoning',
    ],
    pros: ['Enterprise-grade code and logic generation'],
    cons: ['4K output limit'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'minimaxai/minimax-m3',
    name: 'MiniMax M3',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'MiniMax M3 ultra-large scale language model with 1M context window hosted on NVIDIA NIM clusters.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '1M Token Context Window for massive document ingestion',
      '64K Maximum Output Token capacity',
      'High multilingual understanding and creative generation',
    ],
    pros: [
      'Extremely large 1M context and ~64K output token budget',
      'Deep context adherence and reasoning',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    name: 'Nemotron 3 Ultra 550B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Ultra 550B parameter (55B active) massive-scale enterprise frontier model with 1M context window. Optimized with TensorRT-LLM on NVIDIA DGX Cloud.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '262,144 (262K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '1M Token Context Window for enterprise codebase and document analysis',
      '550B Parameter MoE Architecture with high reasoning capacity',
      'TensorRT-LLM acceleration with low latency on NVIDIA GPU clusters',
      'Strict JSON output and function calling support',
    ],
    pros: [
      'Massive 1M token input and 262K token output capability',
      'Frontier mathematical and algorithmic reasoning',
      'High rate limit on NVIDIA developer program (40 RPM)',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B (NVIDIA NIM)',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'OpenAI 120B open reasoning model hosted on NVIDIA NIM with TensorRT-LLM optimization. High output capacity with 131K context.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '131,072 (131K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '131K Token Context Window and 131K Output Limit',
      'TensorRT-LLM accelerated inference on NVIDIA GPU infrastructure',
      'Advanced multi-step reasoning and algorithmic coding',
    ],
    pros: [
      'Full 131K output capacity matching the context window',
      'Frontier reasoning on NVIDIA NIM',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT OSS 20B (NVIDIA NIM)',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'OpenAI 20B lightweight reasoning model hosted on NVIDIA NIM with TensorRT-LLM optimization.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '131,072 (131K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      '131K Token Context Window and 131K Output Limit',
      'High-speed generation on NVIDIA NIM backend',
      'Reliable instruction adherence and structured data extraction',
    ],
    pros: [
      'Ultra-fast generation with full 131K output token capacity',
      'Economical latency with strong reasoning abilities',
    ],
    cons: ['Text-only modality'],
    limits: {
      rpm: 40,
      tpm: null,
      rpd: 10000,
    },
  },
];
