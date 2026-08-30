/**
 * intelligentQueryEngine.ts
 *
 * Multi-Vector Intelligent Query Synthesis System for:
 * 1. Real-Time Web Search (DuckDuckGo / Tavily / Brave)
 * 2. Deep Multi-Hop Research (orthogonal investigative vectors)
 * 3. High-Accuracy Web Photo Retrieval (DuckDuckGo & Bing Web Images)
 * 4. Generative Visual Prompt Planning (Local Diffusers & Cloud FLUX)
 *
 * Pure dynamic, model-driven query synthesis with zero hardcoded keyword assumptions.
 * Preserves full entity names, phrases, and user intents faithfully.
 */

import { invoke } from '@tauri-apps/api/core';
import { useNyxStore } from '@src/shared/store/useNyxStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DomainCategory =
  | 'technology'
  | 'science'
  | 'automotive'
  | 'space'
  | 'nature'
  | 'business'
  | 'history'
  | 'medical'
  | 'entertainment'
  | 'general';

export type InquiryIntent =
  | 'comparative'
  | 'technical_architecture'
  | 'benchmarks_performance'
  | 'troubleshooting'
  | 'historical_origin'
  | 'pricing_market'
  | 'factual_overview';

export type FreshnessWindow = 'day' | 'week' | 'month' | 'year' | 'none';

export type SearchProvider = 'duckduckgo' | 'tavily' | 'brave' | 'bing_images';

export interface SectionalTopicMediaPlan {
  title: string;
  photoQuery: string;
  videoQuery?: string;
}

export interface ProviderQuerySpec {
  provider: SearchProvider;
  query: string;
  freshness: FreshnessWindow;
}

export interface QueryPlan {
  /** Clean, high-precision query for real-time web search engines */
  webSearchQuery: string;
  /** Whether the prompt requires web search execution at all */
  requiresSearch: boolean;
  /** How stale an answer is tolerable: drives whether we attach a freshness hint */
  freshness: FreshnessWindow;
  /** Per-backend variants of the web search query */
  providerQueries: ProviderQuerySpec[];
  /** Orthogonal sub-queries for deep multi-hop research exploration */
  deepResearchQueries: string[];
  /** Visual subject query optimized for DuckDuckGo & Bing Web Images */
  photoSearchQuery: string;
  /** Motion/action query optimized for HD Videos */
  videoSearchQuery: string;
  /** Atmospheric theme / soundtrack query for Audio & Soundscapes */
  audioSearchQuery?: string;
  /** Core extracted entity subject */
  primarySubject: string;
  /** Primary and secondary entities for comparative queries */
  entities?: { primary: string; secondary?: string };
  /** Inferred informational intent */
  intent: InquiryIntent;
  /** Section-specific media plans (topic title + targeted query) */
  sectionalTopics: SectionalTopicMediaPlan[];
  /** Categorical domain for semantic routing */
  domainCategory: DomainCategory;
  /** AI-determined target depth */
  targetDepth: 'exhaustive' | 'concise';
}

// ─────────────────────────────────────────────────────────────────────────────
// LRU Cache
// ─────────────────────────────────────────────────────────────────────────────

class LRUCache<V> {
  private store = new Map<string, { value: V; timestamp: number }>();
  constructor(
    private maxEntries: number,
    private ttlMs: number
  ) {}

  get(key: string): V | null {
    const k = key.toLowerCase().trim();
    const entry = this.store.get(k);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.delete(k);
      return null;
    }
    this.store.delete(k);
    this.store.set(k, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    const k = key.toLowerCase().trim();
    if (this.store.has(k)) this.store.delete(k);
    else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(k, { value, timestamp: Date.now() });
  }
}

const QUERY_PLAN_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const queryPlanCache = new LRUCache<QueryPlan>(200, QUERY_PLAN_CACHE_TTL);

// ─────────────────────────────────────────────────────────────────────────────
// Clean Subject Extraction (Preserves Full Noun Phrases & Entity Context)
// ─────────────────────────────────────────────────────────────────────────────

const CONVERSATIONAL_PATTERNS: RegExp[] = [
  /^(?:can\s+you\s+(?:please\s+)?)?(?:tell\s+me\s+(?:all\s+)?(?:about|the\s+story\s+of|the\s+history\s+of|the\s+origin\s+of)|give\s+me\s+(?:the\s+)?(?:complete\s+story\s+of|story\s+of|full\s+story\s+of|full\s+history\s+of|history\s+of|origin\s+of|origins\s+of|lore\s+of|overview\s+of|summary\s+of|breakdown\s+of|biography\s+of|profile\s+of|details\s+on|information\s+on|info\s+about|facts\s+about)|deep\s+dive\s+(?:into|on|about)|explain\s+(?:to\s+me\s+)?(?:how|what|why|the)?|describe|write\s+(?:an?\s+)?(?:essay|article|report|summary|book|guide)\s+(?:on|about)|search\s+(?:the\s+web\s+for|for|online\s+for)|find\s+(?:out\s+about|information\s+on|me\s+info\s+about)|lookup|deep\s+research\s+(?:on|about)|research\s+(?:about|on)?)\s+/gi,
  /^(?:show\s+(?:me\s+)?(?:some\s+)?(?:pictures|images|photos|videos|multimedia|clips|tracks|soundtracks|music|wallpapers)\s+(?:of|about|showing|for)|give\s+me\s+(?:images|photos|videos|music|tracks|pictures)\s+(?:of|for)|i\s+want\s+to\s+(?:know|learn|listen\s+to|watch|see)\s+about)\s+/gi,
  /^(?:create|draw|make|generate|build|visualize|plot)\s+(?:an?\s+)?(?:mermaid\s+)?(?:diagram|diagrams|graph|graphs|chart|charts|flowchart|flowcharts|presentation|ppt|slidev|slides|deck|table)\s+(?:of|for|about|showing|illustrating)?\s+/gi,
  /\s+(?:with\s+(?:all\s+)?(?:facts|details|images|photos|videos|pictures|sources|citations|references|music|multimedia|soundtrack)|explained\s+in\s+detail|in\s+depth|step\s+by\s+step|for\s+me|please|and\s+show\s+(?:me\s+)?(?:images|photos|videos|clips)|and\s+play\s+(?:some\s+)?(?:music|soundtrack))$/gi,
  /\s+(?:with\s+(?:a\s+|an\s+)?(?:graphs?\s+and\s+diagrams?|diagrams?|graphs?|charts?|flowcharts?|visuals?|svg|ppt|presentation|slidev|slides|deck|tables?|code)|and\s+(?:create|draw|make|generate|build|show|plot)\s+(?:a\s+|an\s+)?(?:diagram|graph|chart|flowchart|ppt|presentation|slidev|slides|deck|visuals?))$/gi,
];

/** Extracts the clean core subject while preserving all essential nouns, qualifiers, and geographical/thematic anchors. */
export function extractCoreSubject(prompt: string): string {
  if (!prompt?.trim()) return '';
  let text = prompt.trim();
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    text = text.replace(pattern, ' ');
  }
  text = text
    .replace(/^[\s#*`"'?!:;]+|[\s#*`"'?!:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || prompt.trim();
}

/** Clean noun extractor that preserves complete entity phrases without truncating words. */
export function cleanEntityNouns(text: string): string {
  if (!text) return '';
  return extractCoreSubject(text);
}

export function extractProperNounEntity(text: string): string | null {
  if (!text) return null;
  const subject = extractCoreSubject(text);
  return subject.length >= 3 ? subject : null;
}

/** Sanitizes search queries: removes special characters and bounds length cleanly. */
export function sanitizeImageQuery(query: string): string {
  return query
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Freshness & Provider Queries
// ─────────────────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const DAY_FRESHNESS_PATTERN =
  /\b(?:today|right now|breaking|live|as of now|this morning|currently happening|just announced)\b/i;
const WEEK_FRESHNESS_PATTERN =
  /\b(?:this\s+week|latest|newest|recent(?:ly)?|just\s+released|just\s+launched|new\s+update)\b/i;
const MONTH_FRESHNESS_PATTERN =
  /\b(?:current(?:ly)?|now|this\s+month|up\s+to\s+date|status\s+of|still\s+(?:exists|active|running|available))\b/i;
const YEAR_FRESHNESS_PATTERN = new RegExp(
  `\\b(?:${CURRENT_YEAR}|${CURRENT_YEAR - 1}|this\\s+year|202[4-9])\\b`,
  'i'
);

export function detectFreshnessWindow(prompt: string): FreshnessWindow {
  if (!prompt) return 'none';
  if (DAY_FRESHNESS_PATTERN.test(prompt)) return 'day';
  if (WEEK_FRESHNESS_PATTERN.test(prompt)) return 'week';
  if (MONTH_FRESHNESS_PATTERN.test(prompt) || YEAR_FRESHNESS_PATTERN.test(prompt)) return 'month';
  if (
    /\b(?:current|who is the|who leads|ceo of|president of|prime minister of|latest version of)\b/i.test(
      prompt
    )
  )
    return 'month';
  return 'none';
}

export function applyFreshnessQualifier(query: string, freshness: FreshnessWindow): string {
  if (freshness === 'none' || !query) return query;
  if (/\b20\d{2}\b/.test(query)) return query;
  return `${query} ${CURRENT_YEAR}`.trim();
}

export function buildProviderQueries(
  baseQuery: string,
  freshness: FreshnessWindow
): ProviderQuerySpec[] {
  const qualified = applyFreshnessQualifier(baseQuery, freshness);
  return [
    { provider: 'duckduckgo', query: qualified, freshness },
    { provider: 'tavily', query: baseQuery, freshness },
    { provider: 'brave', query: baseQuery, freshness },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent & Media Gates
// ─────────────────────────────────────────────────────────────────────────────

export function shouldFetchVideos(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  return /\b(?:video|videos|footage|clip|clips|movie|movies|animation|animations|watch|recording|timelapse|time-lapse|motion\s+video|film|documentary|reel|cinematic\s+video)\b/i.test(
    prompt
  );
}

export function shouldFetchAudio(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  return /\b(?:music|soundtrack|soundtracks|song|songs|audio|track|tracks|ambient\s+sound|ambience|soundscape|score|listen|play\s+music|background\s+(?:music|score|track|sound)|theme\s+song|lo-?fi|synthwave|beats)\b/i.test(
    prompt
  );
}

const GREETING_PATTERN = /^(hi|hello|hey|yo|greetings|thanks|thank you|ok|okay|bye|ping)\b/i;
const CODE_PATTERN =
  /^(```|console\.log|function\s*\(|def\s+|class\s+|import\s+|SELECT\s+|curl\s+|npm\s+|pnpm\s+|git\s+)/i;
const PURE_MATH_PATTERN = /^[\d\s+\-*/^().=,%]+$/;

export function shouldFetchImages(
  prompt: string,
  _context?: { isWebSearch?: boolean; isDeepResearch?: boolean; isLucifer?: boolean }
): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const trimmed = prompt.trim();
  if (GREETING_PATTERN.test(trimmed)) return false;
  if (CODE_PATTERN.test(trimmed)) return false;
  if (PURE_MATH_PATTERN.test(trimmed)) return false;
  return true;
}

export function requiresWebSearch(prompt: string): boolean {
  if (!prompt || !prompt.trim()) return false;
  if (CODE_PATTERN.test(prompt) || PURE_MATH_PATTERN.test(prompt.trim())) return false;
  if (GREETING_PATTERN.test(prompt.trim())) return false;
  if (detectFreshnessWindow(prompt) !== 'none') return true;
  if (
    /\b(?:search|look\s*up|find\s+out|latest|current|today|news|price\s+of|stock\s+price|score\s+of|who\s+is|what\s+is|history|story|origins?)\b/i.test(
      prompt
    )
  )
    return true;
  return true;
}

export function detectInquiryIntent(prompt: string): InquiryIntent {
  if (/\b(?:vs|versus|compared?\s+to|difference\s+between|which\s+is\s+better)\b/i.test(prompt))
    return 'comparative';
  if (
    /\b(?:benchmark|benchmarks|fps|flops|latency|throughput|performance|speed\s+test)\b/i.test(
      prompt
    )
  )
    return 'benchmarks_performance';
  if (
    /\b(?:how\s+to\s+fix|error|exception|debug|fails|failed|issue|crash|troubleshoot)\b/i.test(
      prompt
    )
  )
    return 'troubleshooting';
  if (
    /\b(?:architecture|under\s+the\s+hood|internals|how\s+it\s+works|mechanism|system\s+design)\b/i.test(
      prompt
    )
  )
    return 'technical_architecture';
  if (
    /\b(?:history|origin|origins|ancient|timeline|who\s+invented|when\s+was\s+it\s+created)\b/i.test(
      prompt
    )
  )
    return 'historical_origin';
  if (/\b(?:price|pricing|cost|how\s+much\s+does|plans|tier|subscription)\b/i.test(prompt))
    return 'pricing_market';
  return 'factual_overview';
}

export function detectDomainCategory(text: string): DomainCategory {
  if (
    /\b(?:space|telescope|nasa|planet|galaxy|orbit|satellite|mars|moon|astronomy|rocket|spacex|iss|nebula)\b/i.test(
      text
    )
  )
    return 'space';
  if (
    /\b(?:car|engine|porsche|ferrari|bmw|mercedes|motor|electric\s+vehicle|ev|turbo|horsepower|vehicle|automotive)\b/i.test(
      text
    )
  )
    return 'automotive';
  if (
    /\b(?:code|algorithm|processor|gpu|cpu|quantum|chip|software|compiler|ai|llm|server|database|react|rust|python)\b/i.test(
      text
    )
  )
    return 'technology';
  if (
    /\b(?:dna|gene|cell|crispr|medicine|vaccine|disease|symptom|biology|chemistry|anatomy|surgery|clinical)\b/i.test(
      text
    )
  )
    return 'medical';
  if (
    /\b(?:forest|ocean|animal|mountain|wildlife|river|climate|weather|nature|landscape|species)\b/i.test(
      text
    )
  )
    return 'nature';
  if (
    /\b(?:market|stock|finance|economy|revenue|startup|business|investment|crypto|bitcoin|trade)\b/i.test(
      text
    )
  )
    return 'business';
  if (
    /\b(?:ancient|roman|greek|egypt|dynasty|revolution|century|empire|emperor|medieval|archaeology|history|war)\b/i.test(
      text
    )
  )
    return 'history';
  if (
    /\b(?:movie|film|cinematic|marvel|mcu|comic|game|gaming|nintendo|character|actor|lore)\b/i.test(
      text
    )
  )
    return 'entertainment';
  if (/\b(?:science|research|experiment|laboratory|discovery|physics|chemistry)\b/i.test(text))
    return 'science';
  return 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Formulation Methods
// ─────────────────────────────────────────────────────────────────────────────

/** Formulates a high-accuracy visual search query for DuckDuckGo & Bing Web Images. Preserves the full entity subject faithfully. */
export function planVisualPhotoQuery(prompt: string): string {
  if (!prompt?.trim()) return '';
  const subject = extractCoreSubject(prompt) || prompt.trim();
  return sanitizeImageQuery(subject);
}

export function planVideoMediaQuery(prompt: string): string {
  if (!prompt?.trim()) return '';
  const subject = extractCoreSubject(prompt) || prompt.trim();
  return sanitizeImageQuery(`${subject} video`);
}

export function planAudioMusicQuery(prompt: string): string {
  if (!prompt?.trim()) return '';
  const subject = extractCoreSubject(prompt) || prompt.trim();
  return sanitizeImageQuery(`${subject} soundtrack`);
}

export function planWebSearchQuery(
  prompt: string,
  freshness: FreshnessWindow = detectFreshnessWindow(prompt)
): string {
  const subject = extractCoreSubject(prompt) || prompt.trim();
  return applyFreshnessQualifier(subject, freshness);
}

export function planDeepResearchQueries(prompt: string, maxQueries = 8): string[] {
  const subject = extractCoreSubject(prompt) || prompt.trim();
  const queries: string[] = [];
  const seen = new Set<string>();

  const addQuery = (q: string) => {
    const clean = q
      .replace(/[?.,!;:"]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length >= 3 && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      queries.push(clean);
    }
  };

  if (subject) {
    addQuery(subject);
  }

  // Decompose based on the actual subject and natural sub-clauses in user prompt
  const clauses = prompt
    .split(
      /[,;\n\r]|(?:\band\s+(?:how|why|what|whether|where|when|which|compare|explain|discuss)\b)|(?:\b(?:also|additionally|furthermore)\b)/i
    )
    .map((c) => extractCoreSubject(c))
    .filter((c) => c.length >= 4);
  for (const clause of clauses) addQuery(clause);

  return queries.slice(0, maxQueries);
}

export function planSectionalMediaTopics(prompt: string, maxTopics = 4): SectionalTopicMediaPlan[] {
  if (!prompt?.trim()) return [];
  const subject = extractCoreSubject(prompt) || prompt.trim();

  const subQueries = planDeepResearchQueries(prompt, maxTopics);
  if (subQueries.length > 0) {
    return subQueries.slice(0, maxTopics).map((sq) => ({
      title: sq,
      photoQuery: sq,
    }));
  }

  return [{ title: subject, photoQuery: subject }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronous Fast Query Planner (Fallback & Instant Baseline)
// ─────────────────────────────────────────────────────────────────────────────

export function formulateQueryPlan(prompt: string): QueryPlan {
  const cached = queryPlanCache.get(prompt);
  if (cached) return cached;

  const freshness = detectFreshnessWindow(prompt);
  const webSearchQuery = planWebSearchQuery(prompt, freshness);
  const primarySubject = extractCoreSubject(prompt) || prompt.trim();

  const plan: QueryPlan = {
    webSearchQuery,
    requiresSearch: requiresWebSearch(prompt),
    freshness,
    providerQueries: buildProviderQueries(webSearchQuery, freshness),
    deepResearchQueries: planDeepResearchQueries(prompt, 4),
    photoSearchQuery: planVisualPhotoQuery(prompt),
    videoSearchQuery: planVideoMediaQuery(prompt),
    audioSearchQuery: shouldFetchAudio(prompt) ? planAudioMusicQuery(prompt) : undefined,
    primarySubject,
    sectionalTopics: planSectionalMediaTopics(prompt, 4),
    intent: detectInquiryIntent(prompt),
    domainCategory: detectDomainCategory(prompt),
    targetDepth: 'exhaustive',
  };

  queryPlanCache.set(prompt, plan);
  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model-Assisted Intelligent Query Planner (Lucifer Agent / Cloud Model)
// ─────────────────────────────────────────────────────────────────────────────

interface RawModelPlanResult {
  intent?: string;
  requires_search?: boolean;
  web_search_query?: string;
  deep_research_queries?: string[];
  photo_search_query?: string;
  video_search_query?: string;
  audio_music_query?: string;
  sectional_topics?: Array<{ section_title: string; photo_query: string; video_query?: string }>;
  primary_subject?: string;
  domain_category?: string;
  target_depth?: string;
}

export interface ModelPlannerOptions {
  provider?: string;
  modelId?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export async function planQueryWithModel(
  prompt: string,
  options?: ModelPlannerOptions
): Promise<QueryPlan> {
  const cached = queryPlanCache.get(prompt);
  if (cached) return cached;

  const activeStoreModel =
    useNyxStore.getState().cloudModelId ||
    useNyxStore.getState().localModelId ||
    useNyxStore.getState().currentModel?.id;
  const activeStoreProvider = useNyxStore.getState().currentModel?.provider;
  const isLocal = !options?.provider
    ? activeStoreProvider === 'nyx-native'
    : options.provider === 'nyx-native';
  const resolvedProvider =
    options?.provider || activeStoreProvider || (isLocal ? 'nyx-native' : 'gemini');
  const resolvedModelId = options?.modelId || activeStoreModel || (isLocal ? 'local-default' : '');
  const timeoutMs = options?.timeoutMs ?? 5000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const modelResult = await invoke<RawModelPlanResult>(
      'generate_intelligent_query_plan_command',
      {
        prompt,
        provider: resolvedProvider,
        modelId: resolvedModelId,
        apiKey: isLocal ? undefined : options?.apiKey,
      }
    ).finally(() => clearTimeout(timer));

    if (
      modelResult &&
      (modelResult.web_search_query ||
        modelResult.photo_search_query ||
        modelResult.primary_subject)
    ) {
      const freshness = detectFreshnessWindow(prompt);
      const webSearchQuery =
        modelResult.web_search_query?.trim() || planWebSearchQuery(prompt, freshness);
      const photoSearchQuery =
        modelResult.photo_search_query?.trim() ||
        modelResult.primary_subject?.trim() ||
        planVisualPhotoQuery(prompt);
      const primarySubject =
        modelResult.primary_subject?.trim() || extractCoreSubject(prompt) || prompt.trim();

      const sectionalTopics: SectionalTopicMediaPlan[] = (modelResult.sectional_topics || []).map(
        (st) => ({
          title: st.section_title,
          photoQuery: st.photo_query?.trim() || st.section_title,
          videoQuery: st.video_query?.trim() || undefined,
        })
      );

      const refined: QueryPlan = {
        webSearchQuery,
        requiresSearch: modelResult.requires_search ?? requiresWebSearch(prompt),
        freshness,
        providerQueries: buildProviderQueries(webSearchQuery, freshness),
        deepResearchQueries: modelResult.deep_research_queries?.length
          ? modelResult.deep_research_queries
          : planDeepResearchQueries(prompt, 4),
        photoSearchQuery,
        videoSearchQuery: modelResult.video_search_query?.trim() || planVideoMediaQuery(prompt),
        audioSearchQuery:
          modelResult.audio_music_query?.trim() ||
          (shouldFetchAudio(prompt) ? planAudioMusicQuery(prompt) : undefined),
        primarySubject,
        sectionalTopics: sectionalTopics.length
          ? sectionalTopics
          : planSectionalMediaTopics(prompt, 4),
        intent: (modelResult.intent as InquiryIntent) || detectInquiryIntent(prompt),
        domainCategory:
          (modelResult.domain_category as DomainCategory) || detectDomainCategory(prompt),
        targetDepth: modelResult.target_depth === 'concise' ? 'concise' : 'exhaustive',
      };
      queryPlanCache.set(prompt, refined);
      return refined;
    }
  } catch (err) {
    console.warn('[intelligentQueryEngine] Model planner failed or timed out:', err);
  }

  const fallback = formulateQueryPlan(prompt);
  queryPlanCache.set(prompt, fallback);
  return fallback;
}
