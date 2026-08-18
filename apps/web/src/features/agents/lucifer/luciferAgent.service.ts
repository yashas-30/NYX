import { invoke } from '@tauri-apps/api/core';
import { useLuciferStore, LuciferTurnAnalysis, ModelCapabilityCard } from './useLuciferStore';
import { getLuciferPersona, LUCIFER_PERSONA } from '@src/core/agents/luciferPersona';

import { AVAILABLE_MODELS } from '@shared/config/models';

// ── Fallback Regex Definitions (client-side only) ────────────────────────────
// These are evaluated ONLY when the Tauri backend is unavailable (e.g. browser
// testing or Storybook). In production, intent analysis is performed by
// `analyze_lucifer_turn` in the Rust orchestrator, which is the canonical source.
// Each regex is evaluated ONLY against the CURRENT user message, never history.

/**
 * Anchored greeting — mirrors GREETING_REGEX in lucifer.rs.
 * Must consume the ENTIRE message ($ anchor) so "hi search for X" is NOT a greeting.
 */
const GREETING_RE =
  /^(hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day)|yo|sup|ping|test|howdy|what's\s+up|whats\s+up|hiya)(?:[\s!.,?]+(?:lucifer|nyx|there|bot|assistant))?[\s!.,?]*$/i;

/**
 * Explicit voice synthesis — only fires on direct TTS command prefixes.
 */
const VOICE_PREFIX_RE =
  /^(?:say\s+this:|say:|speak:|read\s+aloud:|synthesize\s+(?:voice|audio|speech):|generate\s+audio\s+for:|text-to-speech:|tts:)\s*|\b(?:say\s+out\s+loud|read\s+(?:this|that|it)\s+(?:aloud|out\s+loud)|synthesize\s+(?:voice|audio|speech)\s+for|convert\s+to\s+speech|speak\s+this\s+text)\b/i;

/**
 * Explicit image generation intent — strictly triggers only on explicit commands.
 */
const IMAGE_PREFIX_RE =
  /^(?:\/image|\/img|image:|draw:|paint:|generate\s+image:|picture:)\s*|\b(?:generate|create|draw|paint|render)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|wallpaper|avatar|portrait)\s+(?:of|showing|about|depicting)/i;


/**
 * Memory SAVE intent — explicit commands only.
 */
const MEMORY_SAVE_RE =
  /^(?:\/memory|\/?remember:|\/remember\s+that|memory:)\s*|\b(?:remember\s+that|remember\s+this|save\s+(?:this\s+)?to\s+(?:your\s+)?memory|store\s+this\s+(?:fact|note|info))\b/i;

/**
 * Memory RECALL intent — explicit retrieval commands only.
 */
const MEMORY_RECALL_RE =
  /\b(?:what\s+do\s+you\s+remember\s+about|what\s+did\s+I\s+(?:tell|say)\s+(?:you\s+)?about|do\s+you\s+(?:recall|know)\s+(?:my|what\s+my)|search\s+(?:your\s+)?memory\s+for|recall\s+(?:what\s+I\s+said|my\s+preference))\b/i;

/**
 * Focused web search intent.
 */
const SEARCH_PREFIX_RE =
  /^(?:\/search|\/web|search:|google:|lookup:|web:)\s*|\b(?:search\s+(?:the\s+)?web|search\s+online|google\s+for|look\s*up\s+online|browse\s+the\s+web)\b|\b(?:latest|current|today's|breaking|live|real-time|price|prices|cost|stock|stocks|crypto|weather|score|scores|winner|results|version|release|fixtures|standings|update|updates|news|today)\b|\b(?:what\s+is\s+the\s+latest|what\s+happened\s+today|who\s+won|breaking\s+news|trending\s+now|who\s+is\s+(?:the\s+)?(?:current|sitting|present)?\s*(?:president|prime\s+minister|chancellor|ceo|governor|leader|king|queen|head\s+of\s+state))\b|\b(?:what'?s\s+(?:the\s+)?(?:price|cost|rate|score|weather|stock|value|exchange\s+rate|status)\s+of|how\s+much\s+(?:is|does|did|do|cost|are)|how\s+many\s+(?:are|is|were|have)|when\s+(?:did|does|will|is|are|was|were)\s+(?:the\s+)?|where\s+(?:is|are|was|were|can\s+I)\s+(?:the\s+)?|who\s+(?:is|are|was|were|won|leads?|runs?|owns?|made|created|invented|discovered|founded))\b|\b(?:show\s+me\s+(?:the\s+)?(?:latest|current|live|real-time|today)|find\s+(?:me\s+)?(?:the\s+)?(?:latest|current|recent|today|live)|get\s+(?:me\s+)?(?:the\s+)?(?:latest|current|live|today|recent|real-time))\b/i;




/**
 * Code & engineering intent.
 */
const CODE_INTENT_RE =
  /\b(?:write|create|build|implement|generate|scaffold|refactor|fix|debug|optimize|review)\s+(?:a\s+|an?\s+|the\s+)?(?:function|class|component|module|script|api|endpoint|hook|service|test|algorithm|program|app|application|code|snippet|solution|feature|bug|error|issue)\b|\b(?:how\s+do\s+I\s+(?:code|implement|build|write)|give\s+me\s+(?:code|a\s+function|an?\s+algorithm)|explain\s+(?:this\s+)?code|code\s+review|fix\s+(?:the\s+)?(?:bug|error|issue|crash))\b|\b(?:in\s+(?:typescript|javascript|python|rust|go|java|c\+\+|c#|swift|kotlin|ruby|php|sql|bash))\b/i;

/**
 * Model capabilities query — requires explicit model/hardware technical anchors.
 */
const CAPABILITIES_RE =
  /\b(?:model\s+capabilities|what\s+are\s+(?:this\s+)?model(?:'s)?\s+capabilities|what\s+can\s+this\s+model\s+do|model\s+specs|model\s+specifications|context\s+window|context\s+length|max\s+(?:output|tokens|context)|model\s+info|capabilities\s+of\s+this\s+model|modality|reasoning\s+capabilities|do\s+you\s+support\s+(?:vision|images?|audio|tools?|function\s+calling)|what(?:'s|\s+is)\s+your\s+(?:context|token\s+limit|training\s+cutoff|knowledge\s+cutoff|pricing))\b/i;

/**
 * Casual identity & greeting queries — short-circuits intent analysis (<0.01ms).
 * Prevents "who are you and what can you do" from misclassifying as technical model capabilities.
 */
const CASUAL_IDENTITY_RE =
  /^(who\s+are\s+you|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|introduce\s+yourself|what\s+is\s+your\s+name|who\s+made\s+you|who\s+created\s+you|who\s+are\s+you\s+and\s+what\s+can\s+you\s+do)(?:[\s!.,?]+(?:lucifer|nyx))?[\s!.,?]*$/i;

/**
 * Previous-response reference patterns.
 */
const PREV_RESPONSE_RE =
  /\b(?:why\s+did\s+you\s+say\s+that|explain\s+the\s+previous|expand\s+on\s+that|what\s+was\s+the\s+(?:second|first|last)|can\s+you\s+explain\s+why|are\s+you\s+sure|that(?:'s|\s+is)\s+wrong|what\s+did\s+you\s+mean|tell\s+me\s+about\s+that|expand\s+on\s+the\s+last|explain\s+the\s+last|can\s+you\s+elaborate|elaborate\s+(?:on\s+that|more)|why\s+exactly|what\s+do\s+you\s+mean\s+by|clarify\s+(?:that|this)|how\s+so)\b/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGreetingText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length <= 40 && GREETING_RE.test(trimmed)) return true;
  if (trimmed.length <= 80 && CASUAL_IDENTITY_RE.test(trimmed)) return true;
  return false;
}

/**
 * Scored intent signal for multi-intent classification.
 */
interface IntentSignal {
  intent: LuciferTurnAnalysis['intent'];
  score: number;
  requires_tool: string;
}

const INTENT_THRESHOLD = 0.7;

/**
 * Scores a message against all intent patterns and returns ranked signals.
 * Supports multi-intent: a message can activate multiple tools.
 */
function scoreIntents(text: string): IntentSignal[] {
  const signals: IntentSignal[] = [];

  if (IMAGE_PREFIX_RE.test(text)) {
    signals.push({ intent: 'image_generation', score: 0.95, requires_tool: 'generate_image' });
  }
  if (VOICE_PREFIX_RE.test(text)) {
    signals.push({ intent: 'voice_synthesis', score: 0.95, requires_tool: 'synthesize_voice' });
  }
  if (SEARCH_PREFIX_RE.test(text)) {
    signals.push({ intent: 'web_search', score: 0.92, requires_tool: 'search_web' });
  }
  // Memory: weight save slightly higher than recall so save takes priority if both match
  if (MEMORY_SAVE_RE.test(text)) {
    signals.push({ intent: 'memory_rag', score: 0.90, requires_tool: 'memory_save' });
  } else if (MEMORY_RECALL_RE.test(text)) {
    signals.push({ intent: 'memory_rag', score: 0.85, requires_tool: 'memory_recall' });
  }
  if (CODE_INTENT_RE.test(text)) {
    signals.push({ intent: 'code_engineering', score: 0.88, requires_tool: 'code_exec' });
  }

  return signals
    .filter((s) => s.score >= INTENT_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

/**
 * Parse context window string (e.g. "1M", "128K", "32768") into a number of tokens.
 */
function parseContextWindowStr(val: string | number | undefined): number {
  if (!val) return 32768;
  if (typeof val === 'number') return val;
  const lower = val.toLowerCase().trim();
  const num = parseFloat(lower);
  if (lower.includes('m')) return Math.round(num * 1_000_000);
  if (lower.includes('k')) return Math.round(num * 1_000);
  const parsed = parseInt(lower, 10);
  return isNaN(parsed) ? 32768 : parsed;
}

/**
 * Parse max output string (e.g. "32K", "8K") into token count.
 */
function parseMaxOutputStr(val: string | number | undefined): number {
  if (!val) return 16384;
  if (typeof val === 'number') return val;
  const lower = val.toLowerCase().trim();
  const num = parseFloat(lower);
  if (lower.includes('m')) return Math.round(num * 1_000_000);
  if (lower.includes('k')) return Math.round(num * 1_000);
  const parsed = parseInt(lower, 10);
  return isNaN(parsed) ? 16384 : parsed;
}

/**
 * Build a cache key from the last user message, provider, AND conversation length.
 * Including messageCount prevents cross-turn cache collisions where two different
 * turns share the same first-120-char prefix (e.g. follow-up questions on the same topic).
 */
function buildCacheKey(lastUserText: string, provider: string, messageCount: number): string {
  return `${provider}:${messageCount}:${lastUserText.slice(0, 120)}`;
}

// ── ConversationContextAnalyzer ───────────────────────────────────────────────

/**
 * Analyzes the full conversation history to extract:
 * - Topic thread (key nouns from last 5 user turns)
 * - Resolved entity map (pronoun → entity)
 * - Whether current turn references a previous response
 * - Snippet of the previous assistant response
 * - Decontextualized query (pronoun-expanded for search/recall)
 * - How many consecutive search-topic turns have occurred
 */
class ConversationContextAnalyzer {
  private readonly STOP_WORDS = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
    'yourself', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it',
    'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
    'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
    'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of',
    'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on',
    'off', 'over', 'under', 'again', 'further', 'then', 'once', 'can', 'will', 'just',
    'should', 'now', 'how', 'more', 'also', 'tell', 'give', 'show', 'find', 'get', 'use',
    'please', 'yes', 'no', 'ok', 'okay', 'sure',
  ]);

  analyze(messages: Array<{ role: string; content: any }>, lastUserText: string): {
    refers_to_previous_response: boolean;
    previous_response_snippet?: string;
    decontextualized_query: string;
    topic_thread: string[];
    resolved_entities: Record<string, string>;
    search_follow_up_depth: number;
  } {
    const result = {
      refers_to_previous_response: false,
      previous_response_snippet: undefined as string | undefined,
      decontextualized_query: lastUserText,
      topic_thread: [] as string[],
      resolved_entities: {} as Record<string, string>,
      search_follow_up_depth: 0,
    };

    if (messages.length < 2) return result;

    const lastUserLower = lastUserText.toLowerCase().trim();

    // ── 1. Previous response reference detection ──────────────────────────────
    const isPrevRef =
      PREV_RESPONSE_RE.test(lastUserText) ||
      lastUserLower === 'why' ||
      lastUserLower === 'why?' ||
      lastUserLower === 'how?' ||
      lastUserLower === 'hm?' ||
      (lastUserLower.length <= 8 && /^(why|how|what|really|hmm?\??)/.test(lastUserLower));

    if (isPrevRef) {
      result.refers_to_previous_response = true;
      // Find the most recent assistant message
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          const content = typeof messages[i].content === 'string'
            ? messages[i].content as string
            : JSON.stringify(messages[i].content);
          result.previous_response_snippet = content.slice(0, 400).trim();
          break;
        }
      }
    }

    // ── 2. Topic thread extraction (last 5 user turns) ────────────────────────
    const userMessages = messages
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));

    const topicWords = new Map<string, number>();
    for (const text of userMessages) {
      const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4 && !this.STOP_WORDS.has(w));
      for (const word of words) {
        topicWords.set(word, (topicWords.get(word) || 0) + 1);
      }
    }
    result.topic_thread = Array.from(topicWords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);

    // ── 3. Entity resolution (pronoun → subject) ──────────────────────────────
    // Walk backwards through history to find proper nouns following pronouns
    const PRONOUNS = ['it', 'he', 'she', 'they', 'him', 'her', 'them', 'this', 'that'];
    const entityMap: Record<string, string> = {};

    for (let i = messages.length - 2; i >= Math.max(0, messages.length - 6); i--) {
      const msgContent = typeof messages[i].content === 'string'
        ? messages[i].content as string
        : JSON.stringify(messages[i].content);

      // Find capitalized nouns (rough proper noun heuristic)
      const properNouns = msgContent.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g) || [];
      if (properNouns.length > 0) {
        const subject = properNouns[0] ?? '';
        if (subject) {
          for (const pronoun of PRONOUNS) {
            if (!entityMap[pronoun]) {
              entityMap[pronoun] = subject;
            }
          }
        }
        break;
      }
    }
    result.resolved_entities = entityMap;

    // ── 4. Decontextualized query construction ────────────────────────────────
    const isExplicitShortContinuation = (result.refers_to_previous_response || /^(?:what\s+about|and\s+|tell\s+me\s+more|why\??|how\s+about|elaborate)\b/i.test(lastUserText)) && lastUserText.trim().length <= 40;
    const containsPronounRef = /\b(?:it|that|this|them|these|those)\b/i.test(lastUserText) && lastUserText.trim().length <= 40;

    if ((isExplicitShortContinuation || containsPronounRef) && messages.length >= 2) {
      // Find the previous user message (N-2 or earlier) to get context
      const prevUserMessages = messages
        .slice(0, -1)
        .filter(m => m.role === 'user')
        .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));

      const prevUserText = prevUserMessages[prevUserMessages.length - 1] || '';

      if (prevUserText.length > 0 && prevUserText.length < 200) {
        const cleanPrevQuery = prevUserText
          .replace(/^(?:\/search|\/web|search:|google:|lookup:|web:)\s*/i, '')
          .replace(/<[^>]+>/g, '') // Strip XML tags if present
          .trim();

        // Resolve pronouns in current message using entity map
        let resolvedText = lastUserText;
        for (const [pronoun, entity] of Object.entries(entityMap)) {
          const re = new RegExp(`\\b${pronoun}\\b`, 'gi');
          resolvedText = resolvedText.replace(re, entity);
        }

        if (cleanPrevQuery.length > 0 && resolvedText !== lastUserText) {
          // Pronoun was resolved — use resolved text
          result.decontextualized_query = resolvedText;
        } else if (cleanPrevQuery.length > 0 && isExplicitShortContinuation) {
          // Append previous topic only for explicit short continuation requests
          result.decontextualized_query = `${cleanPrevQuery} - ${lastUserText}`;
        }
      }
    } else {
      result.decontextualized_query = lastUserText;
    }

    // ── 5. Search follow-up depth ─────────────────────────────────────────────
    let depth = 0;
    for (let i = messages.length - 2; i >= Math.max(0, messages.length - 8); i--) {
      const m = messages[i];
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      if (m.role === 'user' && SEARCH_PREFIX_RE.test(text)) {
        depth++;
      } else if (m.role === 'user') {
        break; // non-search turn breaks the chain
      }
    }
    result.search_follow_up_depth = depth;

    return result;
  }
}

const conversationContextAnalyzer = new ConversationContextAnalyzer();

// ── Model Capability Fetching ─────────────────────────────────────────────────

const CAPABILITY_CACHE = new Map<string, ModelCapabilityCard>();
const CAPABILITY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Derives capability card from the local AVAILABLE_MODELS catalog.
 * This is the instant, zero-latency path.
 */
function buildCapabilityCardFromCatalog(
  modelId: string,
  provider: string
): ModelCapabilityCard | null {
  const catalogEntry = AVAILABLE_MODELS.find((m: any) => m.id === modelId);
  if (!catalogEntry) return null;

  const specs = (catalogEntry as any).specs || {};
  const lowerId = modelId.toLowerCase();

  const supportsVision =
    lowerId.includes('vl') || lowerId.includes('vision') || lowerId.includes('multimodal') ||
    lowerId.includes('pixtral') || lowerId.includes('llava') || lowerId.includes('minicpm-v') ||
    lowerId.includes('gemini') || (specs.modality || '').toLowerCase().includes('multimodal');

  const supportsReasoning =
    /\b(?:deepseek-r1|deepseek-reasoner|qwq|sky-t1|o1|o3|o1-mini|o1-preview|o3-mini)\b/i.test(lowerId) ||
    /[-_/](?:r1|qwq|reasoner|thinking|reasoning)(?:[-_/\.]|$)/i.test(lowerId);

  const supportsTools = provider === 'gemini' || provider === 'openrouter';

  return {
    modelId,
    provider,
    contextWindow: parseContextWindowStr(specs.contextWindow),
    maxOutputTokens: parseMaxOutputStr(specs.maxOutput),
    supportsVision,
    supportsTools,
    supportsReasoning,
    supportsAudio: provider === 'gemini',
    supportsStreaming: true,
    description: (catalogEntry as any).description,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetches live model capabilities from OpenRouter API for cloud models,
 * or derives from local catalog. Falls back gracefully.
 *
 * Results are cached per model for 10 minutes.
 */
async function fetchModelCapabilities(
  modelId: string,
  provider: string,
  openrouterApiKey?: string
): Promise<ModelCapabilityCard> {
  const cacheKey = `${provider}:${modelId}`;
  const cached = CAPABILITY_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CAPABILITY_CACHE_TTL) {
    return cached;
  }

  // 1. Try live OpenRouter fetch for OpenRouter-backed models
  if (provider === 'openrouter') {
    try {
      const encodedId = encodeURIComponent(modelId);
      const reqHeaders: Record<string, string> = {
        'HTTP-Referer': 'https://nyx.ai',
        'X-Title': 'NYX Desktop',
      };
      if (openrouterApiKey && openrouterApiKey.trim() !== '' && openrouterApiKey !== 'free') {
        reqHeaders['Authorization'] = `Bearer ${openrouterApiKey}`;
      }
      const resp = await fetch(`https://openrouter.ai/api/v1/models/${encodedId}`, {
        headers: reqHeaders,
      });
      if (resp.ok) {
        const data = await resp.json();
        const ctx = data.context_length ?? data.top_provider?.context_length ?? 8192;
        const maxOut = data.top_provider?.max_completion_tokens ?? Math.min(ctx, 32768);

        const card: ModelCapabilityCard = {
          modelId,
          provider,
          contextWindow: ctx,
          maxOutputTokens: maxOut,
          supportsVision: !!(data.architecture?.modality?.includes('image')),
          supportsTools: !!(data.supported_parameters?.includes('tools')),
          supportsReasoning: /r1|reasoner|qwq|thinking/i.test(modelId),
          supportsAudio: !!(data.architecture?.modality?.includes('audio')),
          supportsStreaming: true,
          trainingCutoff: data.training_data_cutoff ?? undefined,
          pricing: data.pricing
            ? {
                inputPer1MTokens: data.pricing.prompt != null
                  ? parseFloat(data.pricing.prompt) * 1_000_000
                  : undefined,
                outputPer1MTokens: data.pricing.completion != null
                  ? parseFloat(data.pricing.completion) * 1_000_000
                  : undefined,
                currency: 'USD',
              }
            : undefined,
          latencyClass: ctx > 500_000 ? 'slow' : ctx > 100_000 ? 'medium' : 'fast',
          description: data.description ?? undefined,
          fetchedAt: Date.now(),
        };
        CAPABILITY_CACHE.set(cacheKey, card);
        return card;
      }
    } catch {
      // Fall through to catalog / keyword derivation
    }
  }

  // 2. Try Gemini model info (keyword + catalog)
  if (provider === 'gemini') {
    const lowerModel = modelId.toLowerCase();
    const ctxWindow =
      lowerModel.includes('3.5-pro') || lowerModel.includes('3.6-pro') ? 2_097_152 : 1_048_576;
    const card: ModelCapabilityCard = {
      modelId,
      provider,
      contextWindow: ctxWindow,
      maxOutputTokens: lowerModel.includes('pro') ? 65536 : 32768,
      supportsVision: true,
      supportsTools: true,
      supportsReasoning: lowerModel.includes('thinking') || lowerModel.includes('flash-thinking'),
      supportsAudio: true,
      supportsStreaming: true,
      latencyClass: lowerModel.includes('flash') ? 'fast' : 'medium',
      fetchedAt: Date.now(),
    };
    CAPABILITY_CACHE.set(cacheKey, card);
    return card;
  }

  // 3. Local GGUF model
  if (provider === 'nyx-native') {
    const lowerModel = modelId.toLowerCase();
    // Parse context window from model filename heuristic (e.g. "8k" in name)
    const ctxMatch = lowerModel.match(/(\d+)k(?:ctx|context|-ctx)?/);
    const ctx = ctxMatch ? parseInt(ctxMatch[1]) * 1000 : 8192;
    const card: ModelCapabilityCard = {
      modelId,
      provider: 'nyx-native',
      contextWindow: ctx,
      maxOutputTokens: Math.min(ctx, 16384),
      supportsVision:
        lowerModel.includes('vl') || lowerModel.includes('vision') || lowerModel.includes('llava'),
      supportsTools: false,
      supportsReasoning:
        lowerModel.includes('r1') || lowerModel.includes('qwq') || lowerModel.includes('thinking'),
      supportsAudio: false,
      supportsStreaming: true,
      fetchedAt: Date.now(),
    };
    CAPABILITY_CACHE.set(cacheKey, card);
    return card;
  }

  // 4. Fallback: derive from catalog
  const catalogCard = buildCapabilityCardFromCatalog(modelId, provider);
  if (catalogCard) {
    CAPABILITY_CACHE.set(cacheKey, catalogCard);
    return catalogCard;
  }

  // 5. Last resort defaults
  const fallback: ModelCapabilityCard = {
    modelId,
    provider,
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: false,
    supportsReasoning: false,
    supportsAudio: false,
    supportsStreaming: true,
    fetchedAt: Date.now(),
  };
  CAPABILITY_CACHE.set(cacheKey, fallback);
  return fallback;
}

/**
 * Formats a ModelCapabilityCard as a human-readable markdown table.
 */
function formatCapabilityMarkdown(card: ModelCapabilityCard): string {
  const ctxDisplay = card.contextWindow >= 1_000_000
    ? `${(card.contextWindow / 1_000_000).toFixed(1)}M tokens`
    : card.contextWindow >= 1_000
    ? `${Math.round(card.contextWindow / 1_000)}K tokens`
    : `${card.contextWindow} tokens`;

  const outputDisplay = card.maxOutputTokens >= 1_000
    ? `${Math.round(card.maxOutputTokens / 1_000)}K tokens`
    : `${card.maxOutputTokens} tokens`;

  const pricingStr = card.pricing?.inputPer1MTokens != null
    ? `$${card.pricing.inputPer1MTokens.toFixed(2)}/1M in · $${(card.pricing.outputPer1MTokens ?? 0).toFixed(2)}/1M out USD`
    : 'Not available';

  const providerLabel =
    card.provider === 'nyx-native' ? 'Local GGUF (on-device)'
    : card.provider === 'gemini' ? 'Google Gemini'
    : card.provider === 'openrouter' ? 'OpenRouter'
    : card.provider;

  const rows = [
    ['Model ID', `\`${card.modelId}\``],
    ['Provider', providerLabel],
    ['Context Window', ctxDisplay],
    ['Max Output', outputDisplay],
    ['Vision / Image Input', card.supportsVision ? '✅ Yes' : '❌ No'],
    ['Tool / Function Calling', card.supportsTools ? '✅ Yes' : '❌ No'],
    ['Extended Reasoning', card.supportsReasoning ? '✅ Yes' : '❌ No'],
    ['Audio Generation', card.supportsAudio ? '✅ Yes' : '❌ No'],
    ['Streaming', '✅ Yes'],
    ['Training Cutoff', card.trainingCutoff ?? 'Unknown'],
    ['Pricing', pricingStr],
    ['Latency', card.latencyClass ?? 'Unknown'],
  ];

  const table = [
    '| Capability | Value |',
    '|------------|-------|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');

  return `### 🧠 Active Model Capabilities\n\n${card.description ? `> ${card.description}\n\n` : ''}${table}`;
}

// ── LuciferAgentService ───────────────────────────────────────────────────────

export class LuciferAgentService {
  /**
   * Analyze FULL conversation history and model configuration.
   *
   * ALGORITHM (2026 v2):
   * 1. Greeting short-circuit — never triggers tools on pure greetings.
   * 2. Cache check — if last message + provider unchanged, return cached result.
   * 3. Scored multi-intent classification on CURRENT user message only.
   * 4. Full ConversationContextAnalyzer pass over entire history:
   *    - Topic thread extraction (last 5 user turns)
   *    - Pronoun → entity resolution
   *    - Previous-response reference detection
   *    - Search follow-up depth counter
   *    - Decontextualized query construction
   * 5. Model capabilities detection — sets intent to 'model_capabilities'.
   * 6. Search follow-up propagation: if prior turns were web searches and
   *    current is a short follow-up, inherit search intent.
   *
   * IMPORTANT: `messages` MUST be the full conversation history array.
   * Never pass only the last message — context analysis will degrade.
   */
  async analyzeTurn(
    messages: any[] | string,
    provider: string,
    openrouterApiKey?: string,
    forceWebSearch: boolean = false
  ): Promise<LuciferTurnAnalysis> {
    const formattedMessages: Array<{ role: string; content: any }> =
      typeof messages === 'string'
        ? [{ role: 'user', content: messages }]
        : messages;

    const lastMsg = formattedMessages[formattedMessages.length - 1];
    const lastUserText: string = lastMsg
      ? typeof lastMsg.content === 'string'
        ? lastMsg.content
        : JSON.stringify(lastMsg.content)
      : '';

    // STEP 1 — Ultra-fast Cache Check (<0.01ms)
    // Key includes message count and forceWebSearch flag to avoid reusing a prior turn's analysis when the
    // new message happens to share the same first-120-char prefix, or when the search toggle changes.
    const cacheKey = buildCacheKey(lastUserText, provider, formattedMessages.length) + (forceWebSearch ? '_search' : '');
    const { analysisCache } = (await import('./useLuciferStore')).useLuciferStore.getState();
    if (analysisCache?.hash === cacheKey) {
      return analysisCache.result;
    }

    // STEP 2 — Greeting Short-Circuit (<0.05ms)
    const is_local =
      provider === 'nyx-native' ||
      provider === 'ollama' ||
      provider === 'vllm' ||
      provider === 'lmstudio' ||
      provider.includes('local');

    if (isGreetingText(lastUserText)) {
      return {
        intent: 'conversational',
        requires_search: false,
        requires_memory: false,
        requires_image_gen: false,
        requires_voice: false,
        requires_code: false,
        requires_tools: [],
        is_local_model: is_local,
        confidence: 1.0,
        topic_thread: [],
        resolved_entities: {},
        search_follow_up_depth: 0,
      };
    }

    // STEP 3 — Try Tauri Backend (Rust GGUF/cloud analysis)
    try {
      const isTauri =
        typeof window !== 'undefined' &&
        ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      if (isTauri) {
        const res = await invoke<LuciferTurnAnalysis>('analyze_lucifer_turn', {
          messages: formattedMessages,
          provider,
        });
        if (forceWebSearch) {
          res.requires_search = true;
          if (res.intent === 'conversational') {
            res.intent = 'web_search';
          }
          if (!res.requires_tools.includes('search_web')) {
            res.requires_tools.push('search_web');
          }
        }
        (await import('./useLuciferStore')).useLuciferStore.getState().setAnalysisCache({
          hash: cacheKey,
          result: res,
        });
        return res;
      }
    } catch (e) {
      console.warn('[LuciferAgentService] Fallback to client-side intent analysis:', e);
    }

    // STEP 4 (FALLBACK) — Scored multi-intent classification runs only when the
    // Tauri IPC is unavailable (browser env, unit tests). In production this is
    // unreachable because the invoke() above already returned.
    const signals = scoreIntents(lastUserText);
    const primarySignal = signals[0];

    // STEP 4 — Model capabilities detection
    const isCapabilitiesQuery = CAPABILITIES_RE.test(lastUserText);

    let primaryIntent: LuciferTurnAnalysis['intent'] = isCapabilitiesQuery
      ? 'model_capabilities'
      : (primarySignal?.intent ?? 'conversational');

    const requires_image_gen = signals.some((s) => s.intent === 'image_generation');
    const requires_voice = signals.some((s) => s.intent === 'voice_synthesis');
    let requires_search = signals.some((s) => s.intent === 'web_search');
    const requires_memory = signals.some((s) => s.intent === 'memory_rag');
    const requires_code = signals.some((s) => s.intent === 'code_engineering');
    const requires_tools = signals.map((s) => s.requires_tool);

    // STEP 5 — Full conversation context analysis
    const ctx = conversationContextAnalyzer.analyze(formattedMessages, lastUserText);

    // STEP 6 — Propagate search intent ONLY for explicit follow-ups or pronoun references to a previous search turn
    const isExplicitFollowUp = ctx.refers_to_previous_response || /\b(?:it|he|she|they|that|this|him|her|them|his|its|their|there)\b/i.test(lastUserText);
    if (ctx.search_follow_up_depth > 0 && isExplicitFollowUp && ctx.decontextualized_query) {
      requires_search = true;
      if (!requires_tools.includes('search_web')) {
        requires_tools.push('search_web');
      }
      if (primaryIntent === 'conversational') {
        primaryIntent = 'web_search';
      }
    }

    if (forceWebSearch) {
      requires_search = true;
      if (!requires_tools.includes('search_web')) {
        requires_tools.push('search_web');
      }
      if (primaryIntent === 'conversational') {
        primaryIntent = 'web_search';
      }
    }

    const result: LuciferTurnAnalysis = {
      intent: primaryIntent,
      requires_search,
      requires_memory,
      requires_image_gen,
      requires_voice,
      requires_code,
      requires_tools,
      is_local_model: is_local,
      confidence: isCapabilitiesQuery ? 0.98 : (primarySignal?.score ?? 0.6),
      refers_to_previous_response: ctx.refers_to_previous_response,
      previous_response_snippet: ctx.previous_response_snippet,
      decontextualized_query: ctx.decontextualized_query,
      topic_thread: ctx.topic_thread,
      resolved_entities: ctx.resolved_entities,
      search_follow_up_depth: ctx.search_follow_up_depth,
    };

    // Store in cache
    (await import('./useLuciferStore')).useLuciferStore.getState().setAnalysisCache({
      hash: cacheKey,
      result,
    });

    return result;
  }

  /**
   * Fetch model capabilities and return the structured card.
   * Used when the user asks about capabilities in the chat.
   */
  async getModelCapabilityCard(
    modelId: string,
    provider: string,
    openrouterApiKey?: string
  ): Promise<ModelCapabilityCard> {
    const card = await fetchModelCapabilities(modelId, provider, openrouterApiKey);
    // Cache in Zustand store for persona injection
    const { setModelCapabilityCard, addLog } = (await import('./useLuciferStore')).useLuciferStore.getState();
    setModelCapabilityCard(card);
    addLog({
      type: 'capability_fetch',
      title: `Capability Card Fetched: ${modelId}`,
      details: `ctx=${card.contextWindow} vision=${card.supportsVision} tools=${card.supportsTools}`,
    });
    return card;
  }

  /**
   * Builds the chat-ready capability response string (markdown table).
   */
  async buildCapabilityResponse(
    modelId: string,
    provider: string,
    openrouterApiKey?: string
  ): Promise<string> {
    const card = await this.getModelCapabilityCard(modelId, provider, openrouterApiKey);
    return formatCapabilityMarkdown(card);
  }

  /**
   * Enrich system instructions with a model-aware Lucifer persona.
   *
   * When `analysis.refers_to_previous_response` is true, injects the
   * previous response snippet so the model can answer about it directly.
   *
   * When `capabilityCard` is provided (from model_capabilities intent),
   * injects the full capability profile into the persona.
   */
  enrichSystemPrompt(
    existingPrompt?: string,
    analysis?: LuciferTurnAnalysis,
    modelId?: string,
    provider?: string,
    capabilityCard?: ModelCapabilityCard | null
  ): string {
    const storeCard = capabilityCard ??
      (typeof window !== 'undefined'
        ? (() => {
            try {
              return useLuciferStore.getState().modelCapabilityCard;
            } catch {
              return null;
            }
          })()
        : null);

    const persona = getLuciferPersona({
      modelId,
      provider,
      isLocalModel: analysis?.is_local_model,
      capabilityCard: storeCard ?? undefined,
      previousResponseSnippet:
        analysis?.refers_to_previous_response ? analysis.previous_response_snippet : undefined,
    });


    // Build active tool context block so the model knows which tools are
    // active this turn and should be used — fixes the "tools not firing" issue.
    let toolContextBlock = '';
    if (analysis?.requires_tools && analysis.requires_tools.length > 0) {
      const toolDescriptions: Record<string, string> = {
        search_web: 'search_web — real-time web search for current facts, news, prices, and live data',
        memory_save: 'memory_save — persist information the user asks you to remember',
        memory_recall: 'memory_recall — retrieve previously stored facts about the user',
        generate_image: 'generate_image — generate an image from a text prompt',
        synthesize_voice: 'synthesize_voice — convert text to spoken audio',
        code_exec: 'code_exec — write, review, or debug code with precision',
      };
      const toolLines = analysis.requires_tools
        .map(t => `- ${toolDescriptions[t] ?? t}`)
        .join('\n');
      toolContextBlock = `\n\nACTIVE TOOLS FOR THIS TURN:\n${toolLines}\nUse these tools to fulfil the user's request. Execute silently and integrate results naturally.`;
    }

    // Inject code engineering directive when in code mode
    let codeModeBlock = '';
    if (analysis?.requires_code) {
      codeModeBlock = '\n\nCODE ENGINEERING MODE: Respond with precise, runnable code. Use fenced code blocks with correct language tags. Briefly explain your approach before the code block.';
    }

    const fullPersona = persona + toolContextBlock + codeModeBlock;

    if (!existingPrompt) {
      return fullPersona;
    }

    let cleanedPrompt = existingPrompt;
    if (cleanedPrompt.includes('You are Lucifer')) {
      // Cleanly replace existing Lucifer persona header block without duplicating
      cleanedPrompt = cleanedPrompt.replace(/You are Lucifer[\s\S]*?(?=\n\n\n|\n\n[A-Z_]+:|\n\n###|$)/i, fullPersona);
    } else {
      cleanedPrompt = `${fullPersona}\n\n${cleanedPrompt}`;
    }

    return cleanedPrompt;
  }
}

export const luciferAgentService = new LuciferAgentService();
export { formatCapabilityMarkdown };
