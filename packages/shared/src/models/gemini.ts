import { ModelOption } from '../types.js';

export const GEMINI_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI 3.7 FLASH — Frontier Hybrid Reasoning & Flagship Workhorse
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    provider: 'gemini',
    status: 'ga',
    description:
      'Google DeepMind flagship frontier model with hybrid reasoning. Dynamically combines instant-response generation with controllable thinking budgets for complex coding, agentic tool workflows, mathematics, and high-fidelity multimodal synthesis.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Multimodal (Text, Code, Vision, Audio, Video, PDF)',
    },
    capabilities: {
      vision: true,
      reasoning: true,
    },
    supportsThinking: true,
    features: [
      'Controllable Hybrid Thinking Budget (0–64K reasoning tokens)',
      '1M Token Context Ingestion with sub-second TTFT',
      'Native Google Search Grounding & URL Citation Ingestion',
      'Advanced Function & Tool Calling with Parallel Execution',
      'Native Multimodal Audio, Video, Image, and Document Parsing',
      'Strict JSON Schema Enforcement & Structured Outputs',
    ],
    pros: [
      'Top-tier benchmark performance on SWE-bench and coding tasks',
      'Low latency with adaptive reasoning depth',
      'Generous 1M input context and 64K maximum output',
    ],
    cons: ['Free tier subject to 15 RPM project limits'],
    limits: {
      rpm: 15,
      tpm: 1000000,
      rpd: 1500,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI 3.6 FLASH — High-Throughput Balanced Workhorse
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'gemini',
    status: 'ga',
    description:
      'Workhorse Flash model delivering rapid response speed, robust code synthesis, document digestion, and token efficiency for high-frequency interactive applications.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Multimodal (Text, Code, Vision, Audio, Video, PDF)',
    },
    capabilities: {
      vision: true,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '1M Token Context Window for large-scale document analysis',
      'Fast Single-Pass Inference without reasoning token overhead',
      'Native Google Search Grounding for real-time web retrieval',
      'Multi-tool invocation and structured function calling',
      'Multimodal video, audio, and visual document reasoning',
    ],
    pros: [
      'Extremely responsive with near-instant generation start',
      'High instruction-following accuracy for structured data',
      'Reliable daily driver for general assistant workflows',
    ],
    cons: ['Does not feature iterative multi-step chain-of-thought thinking'],
    limits: {
      rpm: 15,
      tpm: 1000000,
      rpd: 1500,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI 3.5 FLASH-LITE — Ultra-Fast High-Concurrency Tier
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'gemini',
    status: 'ga',
    description:
      'Ultra-fast, cost-optimized Flash-Lite model engineered for high-throughput batching, subagent loops, real-time transformations, and low-latency micro-tasks with a full 1M context window.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Multimodal (Text, Code, Vision, Audio, Video, PDF)',
    },
    capabilities: {
      vision: true,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      'High Free Tier Quota: 30 RPM & 4M TPM (up to 10M TPM enqueued)',
      '1M Token Context Ingestion at minimal resource footprint',
      'Fast JSON extraction and data normalization',
      'Lightweight multimodal vision and audio processing',
    ],
    pros: [
      'Double the request-per-minute throughput of standard Flash (30 RPM)',
      '4x token-per-minute budget (4M TPM)',
      'Ideal for parallel subagent pipelines and high-volume background tasks',
    ],
    cons: ['Slightly lighter parameter scale for deeply abstract creative prose'],
    limits: {
      rpm: 30,
      tpm: 4000000,
      rpd: 1500,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMINI 3.1 FLASH-LITE — High-Efficiency Production Tier
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    provider: 'gemini',
    status: 'ga',
    description:
      'Lightweight, ultra-fast model built for high-concurrency routing, classification, summarization, and high-frequency production tasks.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Multimodal (Text, Code, Vision, Audio, Video, PDF)',
    },
    capabilities: {
      vision: true,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      'High Free Tier Quota: 30 RPM & 4M TPM',
      '1M Token Context Window',
      'Ultra-low latency generation for interactive UI elements',
      'Reliable schema adherence and structured extraction',
    ],
    pros: [
      '30 RPM free rate limit prevents 429 bottlenecks on frequent queries',
      'Massive 1M token ingestion capability',
      'High speed for rapid conversational responses',
    ],
    cons: ['Best suited for direct tasks rather than multi-layered reasoning'],
    limits: {
      rpm: 30,
      tpm: 4000000,
      rpd: 1500,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMMA 4 31B — Google DeepMind Flagship Open Weights Dense Model
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B',
    provider: 'gemini',
    status: 'ga',
    description:
      'Google DeepMind flagship 31B dense multimodal instruction model available on Google AI Studio. Provides near-frontier coding, math, and general reasoning with open model transparent alignment.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Multimodal (Text, Code, Image)',
    },
    capabilities: {
      vision: true,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '262K Token Long-Context Window',
      'Dense 31B parameter instruction-tuned weights',
      'Multimodal image reasoning and visual comprehension',
      'Open model transparent architecture with high safety alignment',
      'High free rate limit: 30 RPM, 4M TPM',
    ],
    pros: [
      'Dense architectural depth delivers rigorous logic and coding accuracy',
      '262K context window handles large codebases and complex documents',
      'Generous 30 RPM rate limit on Google AI Studio',
    ],
    cons: ['Native Google Search grounding not supported on Gemma architecture'],
    limits: {
      rpm: 30,
      tpm: 4000000,
      rpd: 1500,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEMMA 4 26B MoE — Sparse Mixture-of-Experts Architecture
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B MoE',
    provider: 'gemini',
    status: 'ga',
    description:
      'Google Gemma 4 Mixture-of-Experts (MoE) model featuring 26B total parameters with 4B active parameters per token. Combines 26B-class reasoning with ultra-fast inference speed and high token efficiency.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Multimodal (Text, Code, Image)',
    },
    capabilities: {
      vision: true,
      reasoning: false,
    },
    supportsThinking: false,
    features: [
      '262K Token Long-Context Window',
      'Sparse Mixture-of-Experts (4B active parameter routing)',
      'High-speed inference with minimal latency',
      'Multimodal image understanding and code generation',
      'High free rate limit: 30 RPM, 4M TPM',
    ],
    pros: [
      'Ultra-fast generation speed due to 4B active parameter sparse routing',
      '262K context window for comprehensive document ingestion',
      '30 RPM / 4M TPM free tier quota',
    ],
    cons: ['Native Google Search grounding not supported on Gemma architecture'],
    limits: {
      rpm: 30,
      tpm: 4000000,
      rpd: 1500,
    },
  },
];
