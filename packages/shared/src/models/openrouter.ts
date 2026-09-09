import { ModelOption } from '../types.js';

/**
 * OpenRouter Unified Model Catalog
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 * Documentation: https://openrouter.ai/models
 */
export const OPENROUTER_MODELS: ModelOption[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // OPENROUTER CURRENT LIVE FREE MODELS CATALOG (17 MODELS)
  // Verified from OpenRouter /api/v1/models free tier registry
  // ═══════════════════════════════════════════════════════════════════════════════

  // 1. InclusionAI: Ling 3.0 Flash Sante (Free)
  {
    id: 'inclusionai/ling-3.0-flash-sante:free',
    name: 'Ling 3.0 Flash Sante (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'InclusionAI Ling 3.0 Flash Sante is a health and medicine-focused mixture-of-experts model on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '262K Context Window',
      'Clinical and healthcare domain specialization',
      'Free tier access with zero token cost',
    ],
    pros: ['Healthcare domain optimization', '262K long context headroom'],
    cons: ['Text-only modality', '20 RPM / 50 RPD free tier limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 2. InclusionAI: Ling 3.0 Flash Fin (Free)
  {
    id: 'inclusionai/ling-3.0-flash-fin:free',
    name: 'Ling 3.0 Flash Fin (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'InclusionAI Ling 3.0 Flash Fin is a finance-focused mixture-of-experts model on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '262K Context Window',
      'Financial statement analysis and numerical reasoning',
      'Free tier access with zero token cost',
    ],
    pros: ['Financial analysis specialization', 'Fast MoE inference'],
    cons: ['Text-only modality', '20 RPM / 50 RPD free tier limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 3. Dots Studio: Dots3-Note Preview (Free)
  {
    id: 'dots-studio/dots-3-note-preview:free',
    name: 'Dots3-Note Preview (Free)',
    provider: 'openrouter',
    status: 'preview',
    description:
      'Dots Studio Dots3-Note Preview 280B MoE (16B active) open multimodal model with massive 512K context and 460K output limit.',
    specs: {
      contextWindow: '512,000 (512K)',
      maxOutput: '460,800 (460K)',
      modality: 'Text, Image',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '512K Massive Context Window',
      'Huge 460K Output Token Generation Headroom',
      'Multimodal image ingestion and visual document parsing',
      'Structured JSON schema outputs and tool calling',
    ],
    pros: ['Extreme 460K output capacity', 'Multimodal visual understanding'],
    cons: ['Preview stage model', '20 RPM free limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 4. LiquidAI: LFM2.5-2.6B (Free)
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'Liquid LFM 2.5 2.6B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Liquid AI LFM2.5-2.6B compact high-efficiency reasoning model suited for agent workflows, data extraction, and structured output.',
    specs: {
      contextWindow: '65,536 (65K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '65K Context Window',
      'Ultra-low token latency on Liquid neural architecture',
      'Reliable structured schema output and tool calling',
    ],
    pros: ['Snappy sub-agent task execution', 'Native JSON schema compliance'],
    cons: ['Compact model parameter size'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 5. NVIDIA: Nemotron 3.5 Lightning (Free)
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'Nemotron 3.5 Lightning (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3.5 Lightning open MoE model (30B total, 3B active) delivering 1M token context window on OpenRouter free tier.',
    specs: {
      contextWindow: '1,000,000 (1M)',
      maxOutput: '65,536 (65K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '1,000,000 Token Massive Context Window',
      '65K Output Token generation headroom',
      'High-throughput 3B active MoE execution',
    ],
    pros: ['Full 1M context on free tier', 'Fast generation speed'],
    cons: ['Text-only modality'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 6. Thinking Machines: Inkling Small (Free)
  {
    id: 'thinkingmachines/inkling-small:free',
    name: 'Inkling Small (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Thinking Machines Lab Inkling Small open-weight multimodal MoE (12B active) featuring 1M context and multimodal audio/visual parsing.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '262,144 (262K)',
      modality: 'Text, Image, Audio',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '1,048,576 Token Massive Context Window',
      '262K Maximum Output Token Headroom',
      'Multimodal Text, Image, and Audio understanding',
    ],
    pros: ['Full 1M context with 262K output capacity', 'Audio and vision input support'],
    cons: ['20 RPM free tier rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 7. Poolside: Laguna S 2.1 (Free)
  {
    id: 'poolside/laguna-s-2.1:free',
    name: 'Laguna S 2.1 (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Poolside Laguna S 2.1 118B parameter software engineering coding agent model trained on real-world Git repositories with 262K context.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text (Code)',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      'Specialized training on real-world Git repositories and software diffs',
      '262K Context Window',
      'Refactoring and multi-file code synthesis',
    ],
    pros: ['Solid refactoring and pull-request synthesis', 'Free coding agent intelligence'],
    cons: ['20 RPM rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 8. Thinking Machines: Inkling (Free)
  {
    id: 'thinkingmachines/inkling:free',
    name: 'Inkling (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Thinking Machines Lab flagship Inkling multimodal MoE model (41B active) with 1M context, 262K max output, and rich audio/visual understanding.',
    specs: {
      contextWindow: '1,048,576 (1M)',
      maxOutput: '262,144 (262K)',
      modality: 'Text, Image, Audio',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '1,048,576 Token Context Window',
      '262K Output Token headroom',
      'Multimodal Audio, Vision, and Text comprehension',
    ],
    pros: ['Frontier 1M context multimodal model', 'Audio + Vision comprehension at zero cost'],
    cons: ['20 RPM rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 9. Poolside: Laguna XS 2.1 (Free)
  {
    id: 'poolside/laguna-xs-2.1:free',
    name: 'Laguna XS 2.1 (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Poolside Laguna XS 2.1 33B-A3B high-speed coding agent model with 262K context for real-time code generation and editing.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text (Code)',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
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

  // 10. Cohere: North Mini Code (Free)
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere North Mini Code (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Cohere debut agentic coding model North Mini Code with 256K context and 64K output token ceiling.',
    specs: {
      contextWindow: '256,000 (256K)',
      maxOutput: '64,000 (64K)',
      modality: 'Text (Code)',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '256K Context Window specialized for codebases',
      '64K Output Token limit for comprehensive script generation',
      'Clean syntax generation and agentic tool use',
    ],
    pros: ['Fast code generation and high output ceiling at zero cost'],
    cons: ['20 RPM free tier rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 11. NVIDIA: Nemotron 3.5 Content Safety (Free)
  {
    id: 'nvidia/nemotron-3.5-content-safety:free',
    name: 'Nemotron 3.5 Content Safety (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3.5 Content Safety compact 4B multimodal guardrail and safety evaluation model with 128K context.',
    specs: {
      contextWindow: '128,000 (128K)',
      maxOutput: '8,192 (8K)',
      modality: 'Text, Image',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: false,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '128K Context Window',
      'Multimodal text and image safety screening',
      'Zero token cost guardrailing',
    ],
    pros: ['Lightweight content validation and moderation'],
    cons: ['Guardrail-focused model, not suited for general code synthesis'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 12. NVIDIA: Nemotron 3 Ultra 550B (Free)
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'Nemotron 3 Ultra 550B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Ultra 550B-A55B open frontier reasoning and orchestration model with 1M context on OpenRouter free tier.',
    specs: {
      contextWindow: '1,000,000 (1M)',
      maxOutput: '65,536 (65K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '1,000,000 Token Context Window',
      '550B Total / 55B Active MoE architecture',
      'Deep mathematical and algorithmic reasoning',
    ],
    pros: ['Frontier-scale 550B reasoning model at zero cost'],
    cons: ['20 RPM free tier rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 13. NVIDIA: Nemotron 3 Nano Omni (Free)
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    name: 'Nemotron 3 Nano Omni (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Nano Omni 30B-A3B open omni-modal perception model with 256K context supporting text, image, audio, and video.',
    specs: {
      contextWindow: '256,000 (256K)',
      maxOutput: '65,536 (65K)',
      modality: 'Video, Audio, Image, Text',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: false,
    },
    supportsThinking: true,
    features: [
      '256K Context Window',
      '65K Output Token limit',
      'Omni-modal text, image, audio, and video comprehension',
    ],
    pros: ['Full 4-modality input comprehension at zero cost'],
    cons: ['20 RPM free tier rate limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 14. Google: Gemma 4 26B A4B (Free)
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Gemma 4 26B A4B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Google DeepMind Gemma 4 26B A4B instruction-tuned MoE model supporting text, image, and video input with 262K context.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text, Image, Video',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '262K Token Long-Context Window',
      'Multimodal image and video comprehension',
      'Structured JSON schema outputs and tool calling',
    ],
    pros: ['Free multimodal vision and video understanding', 'Structured JSON output support'],
    cons: ['20 RPM / 50 RPD limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 15. Google: Gemma 4 31B IT (Free)
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Gemma 4 31B IT (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'Google DeepMind Gemma 4 31B dense multimodal flagship model supporting text, image, and video input with 262K context on OpenRouter free tier.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text, Image, Video',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '262K Context Window',
      'Dense 31B parameter instruction weights',
      'Structured outputs, tools, and visual comprehension',
    ],
    pros: ['High-quality dense model on free tier', 'Multimodal vision + video input'],
    cons: ['20 RPM / 50 RPD limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 16. NVIDIA: Nemotron 3 Super 120B (Free)
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'Nemotron 3 Super 120B (Free)',
    provider: 'openrouter',
    status: 'ga',
    description:
      'NVIDIA Nemotron 3 Super 120B-A12B open hybrid MoE model with 262K context and 235K maximum output token generation.',
    specs: {
      contextWindow: '262,144 (262K)',
      maxOutput: '235,929 (235K)',
      modality: 'Text',
    },
    capabilities: {
      vision: false,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      '262K Context Window',
      'Massive 235K Output Token headroom',
      'Structured output schema enforcement and tool calling',
    ],
    pros: ['Massive 235K output token generation capability', 'Top-tier MoE reasoning'],
    cons: ['Text-only modality', '20 RPM / 50 RPD free tier limit'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },

  // 17. Free Models Router
  {
    id: 'openrouter/free',
    name: 'Free Models Router',
    provider: 'openrouter',
    status: 'ga',
    description:
      'OpenRouter automated free model router that dynamically selects an optimal available free model based on task modality, tool calling, and structured output requirements.',
    specs: {
      contextWindow: '200,000 (200K)',
      maxOutput: '32,768 (32K)',
      modality: 'Text, Image',
    },
    capabilities: {
      vision: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
    },
    supportsThinking: true,
    features: [
      'Dynamic model selection across all live free endpoints',
      'Automated failover and capability routing',
      'Zero cost inference across multimodal and tool workflows',
    ],
    pros: [
      'Maximum uptime with automatic fallback across free models',
      'Supports tools, vision, and schemas',
    ],
    cons: ['Selected model may vary across requests'],
    limits: {
      rpm: 20,
      tpm: null,
      rpd: 50,
    },
  },
];
