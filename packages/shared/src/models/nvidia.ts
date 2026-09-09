import { ModelOption } from '../types.js';

/**
 * NVIDIA NIM (NVIDIA Inference Microservices) Catalog
 * Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
 * Documentation: https://build.nvidia.com/explore/discover
 *
 * Dedicated, bloat-free catalog featuring exclusively the 12 verified frontier models
 * running on NVIDIA NIM accelerated infrastructure.
 */
export const NVIDIA_MODELS: ModelOption[] = [
  // ── 1. Kimi K3 (Moonshot AI) ───────────────────────────────────────────────
  {
    id: 'moonshotai/kimi-k3',
    name: 'Kimi K3',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      '~2.8T hybrid KDA+MLA multimodal MoE for long-horizon coding, agentic tool use, and image understanding.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Multimodal (Text, Image)',
      parameters: '2.8T',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '1,048,576 (1M) Token Context Window with hybrid KDA+MLA architecture',
      '~2.8T multimodal MoE for long-horizon coding and agentic workflows',
      'Native function calling and structured schema output support',
      'Deep image understanding and document OCR analysis',
      'Separate reasoning and chain-of-thought token streams',
    ],
    pros: [
      'Massive 1M context window with multimodal vision capabilities',
      'Leading performance on complex software engineering and agentic tasks',
    ],
    cons: ['High resource footprint requiring sufficient quota headroom'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 2. DeepSeek V4 Pro 0813 (DeepSeek AI) ───────────────────────────────────
  {
    id: 'deepseek-ai/deepseek-v4-pro-0813',
    name: 'DeepSeek V4 Pro 0813',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'DeepSeek V4 scales to 1M-token context windows with efficient MoE architecture for coding tasks.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Text',
      parameters: '1.65T',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '1,048,576 (1M) Token Context Window with efficient MoE scaling',
      '1.65T total parameter architecture optimized for coding and reasoning',
      'Native tool calling and JSON schema output enforcement',
      'Step-by-step chain-of-thought mathematical and algorithmic derivation',
    ],
    pros: [
      'Frontier coding and autonomous reasoning performance',
      'Full 1M context window on NVIDIA TensorRT-LLM cluster',
    ],
    cons: ['Text-only input modality'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 3. Nemotron 3.5 Lightning 30B A3B (NVIDIA) ──────────────────────────────
  {
    id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    name: 'Nemotron 3.5 Lightning 30B A3B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Fastest 30B A3B MoE model with leading domain accuracy for specialized agentic tasks.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Text',
      parameters: '30B',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '1,048,576 (1M) Token Context Window with low-latency MoE routing',
      'Fastest 30B A3B architecture for real-time autonomous agent loops',
      'Leading domain accuracy for long-running workflows and tool use',
      'Supported function calling and structured schema formatting',
    ],
    pros: [
      'Ultra-fast generation speeds with full 1M context headroom',
      'NVIDIA-tuned for reliable agentic task completion',
    ],
    cons: ['Text-only input modality'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 4. Muse Glimmer 30B (Meta) ──────────────────────────────────────────────
  {
    id: 'meta/muse-glimmer-30b',
    name: 'Muse Glimmer 30B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Muse Glimmer 30B is a multimodal reasoning model accepting text and images, with native tool-calling and separate reasoning output.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '16,384 (16K)',
      modality: 'Multimodal (Text, Image)',
      parameters: '30B',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '131K Token Context Window with multimodal vision encoder',
      'Accepts high-resolution images and complex text prompts',
      'Native tool calling with distinct reasoning output stream',
      'TensorRT-LLM accelerated multimodal inference',
    ],
    pros: [
      'High-speed visual reasoning and tool orchestration',
      'Clean separation of reasoning traces and user-facing content',
    ],
    cons: ['Structured output not supported', '131K context ceiling'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 5. Laguna XS 2.1 (Poolside) ─────────────────────────────────────────────
  {
    id: 'poolside/laguna-xs-2.1',
    name: 'Laguna XS 2.1',
    provider: 'nvidia-nim',
    status: 'ga',
    description: 'Efficient 33B MoE for local, long-horizon agentic coding and terminal tasks.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
      parameters: '33B',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '262K Token Context Window for repository-scale code analysis',
      'Efficient 33B MoE architecture developed by Poolside',
      'Engineered specifically for bash, CLI, and terminal tool automation',
      'Dedicated chain-of-thought reasoning stream',
    ],
    pros: [
      'Specialized excellence in code synthesis and tool invocation',
      'Generous 262K context window for large codebases',
    ],
    cons: ['Text-only modality', 'Structured output not supported'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 6. Nemotron 3 Ultra 550B A55B (NVIDIA) ──────────────────────────────────
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    name: 'Nemotron 3 Ultra 550B A55B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Open, efficient hybrid Mamba-Transformer MoE with 1M context, excelling in agentic reasoning, coding, planning, tool calling, and more.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Text',
      parameters: '561B',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '1,048,576 (1M) Token Context Window with hybrid Mamba-Transformer MoE',
      '561B total parameters (55B active) for frontier general intelligence',
      'Excels in long-context agentic reasoning, planning, and multi-file coding',
      'Native function calling support on NVIDIA NIM DGX SuperPODs',
    ],
    pros: [
      'World-class 561B reasoning scale with linear-attention sequence efficiency',
      'Deep architectural planning and complex problem decomposition',
    ],
    cons: ['Structured output not supported', 'Higher generation latency'],
    limits: { rpm: 20, tpm: null, rpd: 5000 },
  },

  // ── 7. Nemotron 3 Nano Omni 30B A3B Reasoning (NVIDIA) ──────────────────────
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    name: 'Nemotron 3 Nano Omni 30B A3B Reasoning',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Nemotron 3 Nano Omni is an omni-modal reasoning model that understands images, video, speech, text.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Omni (Video, Audio, Image, Text)',
      parameters: '33B',
    },
    capabilities: {
      vision: true,
      audio: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '262K Token Context Window with unified omni-modal encoder',
      'Direct comprehension across video, audio, image, and text inputs',
      'OCR, visual grounding, diagram analysis, and speech reasoning',
      'Native tool calling and step-by-step thinking traces',
    ],
    pros: [
      'Complete omni-modal versatility for audio, video, and imagery',
      'Fast 30B A3B inference speed with reasoning capabilities',
    ],
    cons: ['Structured output not supported'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 8. Gemma 4 31B IT (Google) ──────────────────────────────────────────────
  {
    id: 'google/gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Dense 31B model delivering frontier reasoning for coding, agentic workflows, and fine-tuning.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Multimodal (Text, Image, Video)',
      parameters: '33B',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '262K Token Context Window with multimodal video/image ingestion',
      'Dense 31B parameter architecture delivering frontier reasoning density',
      'Optimized for agentic code workflows and instruction adherence',
      'Native function calling and reasoning output',
    ],
    pros: [
      'High reasoning capability per parameter with multimodal video/image support',
      'Accurate code synthesis and tool orchestration',
    ],
    cons: ['Structured output not supported'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 9. Nemotron 3 Super 120B A12B (NVIDIA) ──────────────────────────────────
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    name: 'Nemotron 3 Super 120B A12B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Open, efficient hybrid Mamba-Transformer MoE with 1M context, excelling in agentic reasoning, coding, planning, tool calling, and more.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '65,536 (64K)',
      modality: 'Text',
      parameters: '124B',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '1,048,576 (1M) Token Context Window with hybrid Mamba-Transformer MoE',
      '124B parameters (12B active) providing rapid token generation',
      'Full function calling and structured schema output enforcement',
      'Superior instruction following and deep agentic reflection',
    ],
    pros: [
      'Ideal balance of reasoning depth, 1M context, and low latency',
      'Full structured JSON schema and tool calling support',
    ],
    cons: ['Text-only input modality'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 10. GPT OSS 20B (OpenAI) ────────────────────────────────────────────────
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT OSS 20B',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Smaller Mixture of Experts (MoE) text-only LLM for efficient AI reasoning and math.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
      parameters: '21B',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '131K Token Context Window with lightweight MoE architecture',
      '21B parameter count tuned for fast mathematical and logical deduction',
      'Native function calling and structured output formatting',
      'Dedicated chain-of-thought thinking tokens',
    ],
    pros: [
      'High throughput inference with full structured output support',
      'Strong mathematical and algorithmic reasoning for its size',
    ],
    cons: ['Text-only input modality'],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 11. Llama 3.2 90B Vision Instruct (Meta) ────────────────────────────────
  {
    id: 'meta/llama-3.2-90b-vision-instruct',
    name: 'Llama 3.2 90B Vision Instruct',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Cutting-edge vision-Language model exceling in high-quality reasoning from images.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '8,192 (8K)',
      modality: 'Multimodal (Text, Image)',
      parameters: '89B',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: false,
      structuredOutput: false,
    },
    supportsThinking: false,
    features: [
      '131K Token Context Window with flagship vision encoder',
      '89B parameter cutting-edge vision-language model by Meta',
      'High-resolution visual QA, image captioning, and diagram extraction',
      'TensorRT-LLM optimized vision pipeline on NVIDIA NIM',
    ],
    pros: [
      'Premier visual comprehension and document OCR accuracy',
      'Deep image-text grounding across charts, schematics, and photos',
    ],
    cons: [
      'Tool calling not supported',
      'Structured outputs not supported',
      'No reasoning token stream',
    ],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },

  // ── 12. Llama 3.2 11B Vision Instruct (Meta) ────────────────────────────────
  {
    id: 'meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision Instruct',
    provider: 'nvidia-nim',
    status: 'ga',
    description:
      'Cutting-edge vision-language model exceling in high-quality reasoning from images.',
    specs: {
      contextWindow: '131,072 (131K)',
      maxOutput: '8,192 (8K)',
      modality: 'Multimodal (Text, Image)',
      parameters: '11B',
    },
    capabilities: {
      vision: true,
      reasoning: false,
      toolCalling: false,
      structuredOutput: false,
    },
    supportsThinking: false,
    features: [
      '131K Token Context Window with compact vision encoder',
      '11B parameter lightweight multimodal vision-language model',
      'Fast visual document processing, captioning, and visual QA',
      'High-throughput edge-friendly vision inference',
    ],
    pros: [
      'Sub-millisecond visual processing with low latency',
      'High accuracy for image captioning and text extraction',
    ],
    cons: [
      'Tool calling not supported',
      'Structured outputs not supported',
      'No reasoning token stream',
    ],
    limits: { rpm: 40, tpm: null, rpd: 10000 },
  },
];
