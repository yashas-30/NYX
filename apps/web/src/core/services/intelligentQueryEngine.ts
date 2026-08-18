/**
 * intelligentQueryEngine.ts
 *
 * Multi-Vector Intelligent Query Synthesis System for:
 * 1. Real-Time Web Search (DuckDuckGo / Tavily)
 * 2. Deep Multi-Hop Research (Orthogonal investigative vectors)
 * 3. High-Accuracy Web Photo Retrieval (DuckDuckGo & Bing Web Images)
 * 4. Generative Visual Prompt Planning (Local Diffusers & Cloud FLUX)
 *
 * 2026 Production Query Engineering Principles:
 * - Entity-First Visual Queries: Extract specific subject keywords (e.g. "James Webb Space Telescope", "Porsche 911 GT3 RS").
 * - Rigorous Intent Gates: Prevent unnecessary media fetches on pure code, syntax errors, or
 *   abstract math while activating on substantive real-world factual and visual inquiries.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueryPlan {
  /** Clean, high-precision query for real-time web search engines */
  webSearchQuery: string;
  /** Whether the prompt requires web search execution */
  requiresSearch?: boolean;
  /** Orthogonal sub-queries for deep multi-hop research exploration */
  deepResearchQueries: string[];
  /** Visual subject query optimized for DuckDuckGo & Bing Web Images */
  photoSearchQuery: string;
  /** Motion/action query optimized for HD Videos */
  videoSearchQuery: string;
  /** Atmospheric theme / soundtrack query for Audio & Soundscapes */
  audioSearchQuery: string;
  /** Core extracted entity subject */
  primarySubject: string;
  /** Primary and secondary entities for comparative queries */
  entities?: { primary: string; secondary?: string };
  /** Inferred informational intent */
  intent: 'comparative' | 'technical_architecture' | 'benchmarks_performance' | 'troubleshooting' | 'historical_origin' | 'pricing_market' | 'factual_overview';
  /** Section-specific media plans (topic title + targeted query) for section-aligned media retrieval */
  sectionalTopics: SectionalTopicMediaPlan[];
  /** Categorical domain for semantic routing */
  domainCategory: 'technology' | 'science' | 'automotive' | 'space' | 'nature' | 'business' | 'history' | 'medical' | 'general';
  /** AI-determined target depth */
  targetDepth?: 'exhaustive' | 'concise';
}

export interface SectionalTopicMediaPlan {
  title: string;
  photoQuery: string;
  videoQuery?: string;
}

// ── Plan Cache ─────────────────────────────────────────────────────────────────

const QUERY_PLAN_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _queryPlanCache = new Map<string, { plan: QueryPlan; timestamp: number }>();

function getCachedPlan(key: string): QueryPlan | null {
  const k = key.toLowerCase().trim();
  const entry = _queryPlanCache.get(k);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > QUERY_PLAN_CACHE_TTL) {
    _queryPlanCache.delete(k);
    return null;
  }
  return entry.plan;
}

function setCachedPlan(key: string, plan: QueryPlan): void {
  if (_queryPlanCache.size > 200) {
    const oldest = _queryPlanCache.keys().next().value;
    if (oldest) _queryPlanCache.delete(oldest);
  }
  _queryPlanCache.set(key.toLowerCase().trim(), { plan, timestamp: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversational Noise Patterns & Subject Extraction
// ─────────────────────────────────────────────────────────────────────────────

const CONVERSATIONAL_PATTERNS: RegExp[] = [
  /^(?:can\s+you\s+(?:please\s+)?)?(?:tell\s+me\s+(?:all\s+)?(?:about|the\s+story\s+of|the\s+history\s+of|the\s+origin\s+of)|give\s+me\s+(?:the\s+)?(?:complete\s+story\s+of|story\s+of|full\s+story\s+of|full\s+history\s+of|history\s+of|origin\s+of|origins\s+of|lore\s+of|overview\s+of|summary\s+of|breakdown\s+of|biography\s+of|profile\s+of|details\s+on|information\s+on|info\s+about|facts\s+about)|complete\s+story\s+of|full\s+story\s+of|story\s+of|complete\s+history\s+of|full\s+history\s+of|history\s+of|origins?\s+of|lore\s+of|biography\s+of|profile\s+of|timeline\s+of|all\s+about|everything\s+about|deep\s+dive\s+(?:into|on|about)|explain\s+(?:to\s+me\s+)?(?:how|what|why|the)?|describe|write\s+(?:an?\s+)?(?:essay|article|report|summary|book|guide)\s+(?:on|about)|what\s+is\s+(?:the\s+)?|who\s+is\s+(?:the\s+)?|what\s+are\s+(?:the\s+)?|how\s+does\s+(?:the\s+)?|why\s+is\s+(?:the\s+)?|search\s+(?:the\s+web\s+for|for|online\s+for)|find\s+(?:out\s+about|information\s+on|me\s+info\s+about)|lookup|deep\s+research\s+(?:on|about)|research\s+(?:on|about))\s+/gi,
  /^(?:show\s+(?:me\s+)?(?:some\s+)?(?:pictures|images|photos|videos|multimedia|clips|tracks|soundtracks|music|wallpapers)\s+(?:of|about|showing|for)|give\s+me\s+(?:images|photos|videos|music|tracks|pictures)\s+(?:of|for)|i\s+want\s+to\s+(?:know|learn|listen\s+to|watch|see)\s+about)\s+/gi,
  /\s+(?:with\s+(?:all\s+)?(?:facts|details|images|photos|videos|pictures|sources|citations|references|music|multimedia|soundtrack)|explained\s+in\s+detail|in\s+depth|step\s+by\s+step|for\s+me|please|and\s+show\s+(?:me\s+)?(?:images|photos|videos|clips)|and\s+play\s+(?:some\s+)?(?:music|soundtrack))$/gi,
];

/**
 * Strips conversational preamble while preserving compound nouns, versions, and named entities.
 */
export function extractCoreSubject(prompt: string): string {
  if (!prompt?.trim()) return '';
  let text = prompt.trim();
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    text = text.replace(pattern, '');
  }
  // Strip leading/trailing non-alphanumeric punctuation but keep inner hyphens, dots and quotes
  text = text.replace(/^[^\w\d]+|[?!:;"]+$/g, '').replace(/\s+/g, ' ').trim();
  return text || prompt.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop Words & Entity Cleaning
// ─────────────────────────────────────────────────────────────────────────────

const FUNCTION_WORDS = new Set([
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose',
  'explain', 'explained', 'explaining', 'explanation', 'details', 'detailed',
  'tutorial', 'guide', 'overview', 'summary', 'analysis', 'pros', 'cons',
  'benefits', 'drawbacks', 'difference', 'differences', 'versus', 'comparison',
  'mechanism', 'process', 'specifications', 'specs', 'benchmarks', 'pricing',
  'understand', 'understanding', 'looking', 'for', 'with', 'without', 'help',
  'using', 'recent', 'changes', 'tell', 'about', 'show', 'give', 'find', 'make',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do',
  'does', 'did', 'have', 'has', 'had', 'will', 'would', 'could', 'should',
  'can', 'need', 'to', 'of', 'in', 'on', 'at', 'by', 'from', 'up', 'out',
  'off', 'over', 'under', 'then', 'here', 'there', 'all', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same',
  'so', 'than', 'too', 'very', 'just', 'but', 'if', 'or', 'because', 'as',
  'complete', 'completed', 'story', 'stories', 'full', 'entire', 'lore', 'history',
  'historical', 'timeline', 'biography', 'profile', 'origin', 'origins', 'background',
  'everything', 'information', 'facts', 'breakdown', 'landscape', 'portrait', 'wallpaper',
  'wallpapers', 'pictures', 'images', 'photos', 'videos', 'multimedia', 'clips', 'footage',
  'music', 'soundtrack', 'soundtracks', 'song', 'songs', 'audio', 'track', 'tracks',
]);

/**
 * Isolates concrete physical entity nouns and keywords from a conversational subject.
 */
export function cleanEntityNouns(text: string): string {
  if (!text) return '';
  const words = text
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !FUNCTION_WORDS.has(w.toLowerCase()));
  return words.join(' ').trim();
}

/**
 * Sanitizes query for web image searches: max 100 chars, clean punctuation.
 */
export function sanitizeImageQuery(query: string): string {
  return query
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent & Media Detection Gates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects whether the user explicitly or implicitly requests video footage/motion.
 */
export function shouldFetchVideos(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.toLowerCase();
  return /\b(?:video|videos|footage|clip|clips|movie|movies|animation|animations|watch|recording|timelapse|time-lapse|motion\s+video|film|documentary|reel|cinematic\s+video)\b/i.test(lower);
}

/**
 * Detects whether the user explicitly or implicitly requests music/audio.
 */
export function shouldFetchAudio(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.toLowerCase();
  return /\b(?:music|soundtrack|soundtracks|song|songs|audio|track|tracks|ambient\s+sound|ambience|soundscape|score|listen|play\s+music|background\s+(?:music|score|track|sound)|theme\s+song|lo-?fi|synthwave|beats)\b/i.test(lower);
}

/**
 * Decides whether to fetch stock / reference images for this prompt.
 * Always fetches for any substantive non-greeting, non-code prompt.
 */
export function shouldFetchImages(
  prompt: string,
  _context?: { isWebSearch?: boolean; isDeepResearch?: boolean; isLucifer?: boolean }
): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.toLowerCase().trim();

  // Skip greetings, code blocks, and pure math
  if (/^(hi|hello|hey|yo|greetings|thanks|thank you|ok|okay|bye|ping)\b/i.test(lower)) return false;
  if (/^(```|console\.log|function\s*\(|def\s+|class\s+|import\s+|SELECT\s+|curl\s+|npm\s+|pnpm\s+|git\s+)/i.test(lower)) return false;
  if (/^[\d\s\+\-\*\/\^\(\)\=\.\,\%]+$/.test(lower)) return false;

  // Always fetch images for any substantive prompt
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain & Intent Classification
// ─────────────────────────────────────────────────────────────────────────────

export function detectInquiryIntent(prompt: string): QueryPlan['intent'] {
  const lower = prompt.toLowerCase();
  if (/\b(?:vs|versus|compared?\s+to|difference\s+between|which\s+is\s+better|or\s+should\s+i\s+choose|pros\s+and\s+cons)\b/i.test(lower)) return 'comparative';
  if (/\b(?:benchmark|benchmarks|fps|flops|latency|throughput|performance|speed\s+test|geekbench|cinebench|specs|specifications)\b/i.test(lower)) return 'benchmarks_performance';
  if (/\b(?:how\s+to\s+fix|error|exception|debug|fails|failed|issue|crash|troubleshoot|not\s+working|solution)\b/i.test(lower)) return 'troubleshooting';
  if (/\b(?:architecture|under\s+the\s+hood|internals|how\s+it\s+works|mechanism|system\s+design|protocol|pipeline)\b/i.test(lower)) return 'technical_architecture';
  if (/\b(?:history|origin|origins|ancient|timeline|who\s+invented|when\s+was\s+it\s+created|war\s+of|fall\s+of|empire|dynasty|evolution\s+of)\b/i.test(lower)) return 'historical_origin';
  if (/\b(?:price|pricing|cost|how\s+much\s+does|plans|tier|subscription|expensive|cheap|tco|buy|msrp)\b/i.test(lower)) return 'pricing_market';
  return 'factual_overview';
}

export function detectDomainCategory(text: string): QueryPlan['domainCategory'] {
  const lower = text.toLowerCase();
  if (/\b(?:space|telescope|nasa|planet|galaxy|orbit|satellite|mars|moon|astronomy|rocket|spacex|iss|nebula|astrophysics|cosmos|black\s+hole|supernova|james\s+webb|hubble)\b/.test(lower)) return 'space';
  if (/\b(?:car|engine|porsche|ferrari|bmw|mercedes|motor|electric\s+vehicle|ev|turbo|horsepower|vehicle|automotive|supercar|track|formula\s+one|f1|drag\s+race|torque|hypercar)\b/.test(lower)) return 'automotive';
  if (/\b(?:code|algorithm|processor|gpu|cpu|quantum\s+computing|chip|software|compiler|ai|llm|neural\s+network|server|database|react|rust|python|kubernetes|cloud|programming|developer|api|datacenter)\b/.test(lower)) return 'technology';
  if (/\b(?:dna|gene|cell|crispr|medicine|vaccine|disease|symptom|biology|chemistry|physics|molecule|atom|biotech|anatomy|neuroscience|surgery|diagnosis|clinical|neuron)\b/.test(lower)) return 'medical';
  if (/\b(?:forest|ocean|animal|mountain|wildlife|river|climate|weather|nature|landscape|tree|bird|whale|coral|earth|ecosystem|species|wilderness|reef|rainforest|glacier)\b/.test(lower)) return 'nature';
  if (/\b(?:market|stock|finance|economy|revenue|startup|business|investment|crypto|bitcoin|inflation|valuation|trade|commerce|supply\s+chain|manufacturing)\b/.test(lower)) return 'business';
  if (/\b(?:ancient|roman|greek|egypt|dynasty|revolution|century|empire|emperor|medieval|archaeology|history|war|battle|civilization|colonial|renaissance|colosseum|pyramid)\b/.test(lower)) return 'history';
  if (/\b(?:science|research|experiment|laboratory|discovery|invention|physics|chemistry|biology|scientific)\b/.test(lower)) return 'science';
  return 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity-First Visual Query Planners
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formulates a high-accuracy visual search query for DuckDuckGo & Bing Web Images.
 *
 * Rule: Extract the exact concrete entity (1-3 keywords) without noise or bloated adjectives.
 */
export function planVisualPhotoQuery(prompt: string): string {
  if (!prompt?.trim()) return 'nature landscape';

  const subject = extractCoreSubject(prompt);
  if (!subject) return 'cinematic landscape';

  // For comparative queries, focus on the primary entity
  const parts = subject.split(/\s+(?:vs|versus|and|with|compared\s+to|or)\s+/i);
  const primaryPart = parts[0]?.trim() || subject;

  // Extract clean entity keywords
  const cleaned = cleanEntityNouns(primaryPart);
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);

  if (words.length > 0) {
    // Return top 2-3 entity words max (e.g. "James Webb Telescope", "Ferrari F40", "Roman Colosseum")
    return sanitizeImageQuery(words.slice(0, 3).join(' '));
  }

  return sanitizeImageQuery(primaryPart.slice(0, 40));
}

/**
 * Formulates an action/motion search query for video references if requested.
 */
export function planVideoMediaQuery(prompt: string): string {
  if (!prompt?.trim()) return 'timelapse nature';

  const subject = extractCoreSubject(prompt);
  const domain = detectDomainCategory(prompt);

  const primaryPart = subject.split(/\s+(?:vs|versus|and|with|compared\s+to|or)\s+/i)[0]?.trim() || subject;
  const cleaned = cleanEntityNouns(primaryPart);
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);

  const entity = words.slice(0, 2).join(' ') || primaryPart.slice(0, 25);

  // Check if prompt already contains motion terms
  const hasMotion = /\b(?:timelapse|time-lapse|launch|drift|driving|flight|flying|aerial|drone|running|walking|waves|traffic|speed|explosion|slow\s+motion)\b/i.test(prompt);

  if (hasMotion) {
    const motionMatch = prompt.match(/\b(timelapse|time-lapse|launch|drift|driving|flight|aerial|drone|waves|traffic|slow\s+motion)\b/i);
    const motion = motionMatch ? motionMatch[1] : '';
    return sanitizeImageQuery(`${entity} ${motion}`.trim());
  }

  // Domain-specific motion keyword
  const domainMotion: Record<QueryPlan['domainCategory'], string> = {
    space: 'launch',
    automotive: 'driving',
    technology: 'datacenter',
    nature: 'timelapse',
    history: 'ruins',
    medical: 'microscope',
    business: 'office',
    science: 'laboratory',
    general: 'timelapse',
  };

  const motion = domainMotion[domain] || 'footage';
  return sanitizeImageQuery(`${entity} ${motion}`.trim());
}

/**
 * Formulates an atmospheric soundtrack / music query for background audio.
 */
export function planAudioMusicQuery(prompt: string): string {
  if (!prompt?.trim()) return 'ambient chill beats';

  const lower = prompt.toLowerCase();

  // 1. Explicit user musical genre/mood extraction
  const genres = [
    { pattern: /\b(?:lo-?fi|chill\s*hop|study\s*beats)\b/i, query: 'lofi chill beats' },
    { pattern: /\b(?:synthwave|retrowave|cyberpunk|synth)\b/i, query: 'synthwave electronic cyberpunk' },
    { pattern: /\b(?:orchestral|symphony|epic\s*score|dramatic|battle\s*music)\b/i, query: 'orchestral cinematic epic' },
    { pattern: /\b(?:piano|classical\s*piano|calm\s*piano)\b/i, query: 'peaceful piano classical' },
    { pattern: /\b(?:jazz|smooth\s*jazz|coffee\s*shop)\b/i, query: 'smooth jazz coffee' },
    { pattern: /\b(?:ambient|soundscape|atmospheric|space\s*music)\b/i, query: 'ambient atmospheric space' },
    { pattern: /\b(?:meditation|yoga|zen|relaxing|sleep)\b/i, query: 'peaceful meditation relaxing' },
    { pattern: /\b(?:electronic|edm|techno|house|pulse)\b/i, query: 'electronic energetic beat' },
    { pattern: /\b(?:acoustic|guitar|folk|indie)\b/i, query: 'acoustic guitar warm' },
    { pattern: /\b(?:nature\s*sound|rain|ocean\s*waves|birds|forest)\b/i, query: 'nature soundscape rain ocean' },
    { pattern: /\b(?:rock|metal|guitar\s*riff)\b/i, query: 'energetic rock guitar' },
  ];

  for (const g of genres) {
    if (g.pattern.test(lower)) {
      return sanitizeImageQuery(g.query);
    }
  }

  // 2. Domain-based fallback atmosphere
  const domain = detectDomainCategory(prompt);
  const domainAtmospheres: Record<QueryPlan['domainCategory'], string> = {
    space: 'cinematic space ambient synth',
    automotive: 'electronic pulse driving energy',
    technology: 'chill lofi electronic focus',
    medical: 'gentle peaceful acoustic calm',
    nature: 'nature soundscape acoustic calm',
    business: 'calm study piano focus',
    history: 'orchestral cinematic dramatic score',
    science: 'atmospheric minimal ambient',
    general: 'inspiring cinematic acoustic piano',
  };

  return sanitizeImageQuery(domainAtmospheres[domain] || 'ambient chill instrumental');
}

/**
 * Formulates a clean, high-precision query for standard web search.
 */
export function planWebSearchQuery(prompt: string): string {
  const subject = extractCoreSubject(prompt);
  return subject || prompt.trim();
}

/**
 * Decomposes a prompt into 2–4 orthogonal research sub-queries for deep search.
 */
export function planDeepResearchQueries(prompt: string, maxQueries = 4): string[] {
  const subject = extractCoreSubject(prompt);
  if (!subject) return [prompt.trim()];

  const queries: string[] = [];
  const seen = new Set<string>();

  const addQuery = (q: string) => {
    const clean = q.replace(/[?.,!;:"]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length >= 4 && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      queries.push(clean);
    }
  };

  // 1. Core subject
  addQuery(subject);

  // 2. Multi-clause decomposition
  const clauses = prompt
    .split(/[,;\n\r]|(?:\band\s+(?:how|why|what|whether|where|when|which|compare|explain|discuss)\b)|(?:\b(?:also|additionally|furthermore)\b)/i)
    .map((c) => extractCoreSubject(c))
    .filter((c) => c.length >= 4);
  for (const clause of clauses) addQuery(clause);

  // 3. Comparative entity decomposition
  const compMatch = subject.match(/(.+?)\s+(?:vs|versus|compared\s+to|or\s+should\s+i\s+choose)\s+(.+)/i);
  if (compMatch) {
    const entA = extractCoreSubject(compMatch[1]);
    const entB = extractCoreSubject(compMatch[2]);
    if (entA) addQuery(entA);
    if (entB) addQuery(entB);
    if (entA && entB) addQuery(`${entA} vs ${entB} comparison specs`);
  }

  return queries.slice(0, maxQueries);
}

/**
 * Decomposes a prompt into section-specific topic titles and targeted visual search queries.
 * Enables searching DuckDuckGo and Bing Web Images for each exact sub-topic / title.
 */
export function planSectionalMediaTopics(prompt: string, maxTopics = 4): SectionalTopicMediaPlan[] {
  if (!prompt?.trim()) return [];
  const lower = prompt.toLowerCase();
  const domain = detectDomainCategory(prompt);
  const subject = extractCoreSubject(prompt);

  // 1. Healthcare / Medical AI domain
  if (domain === 'medical' || /\b(?:health|healthcare|medical|medicine|hospital|clinical|doctor|patient|disease|drug|radiology|surgery)\b/i.test(lower)) {
    if (/\b(?:ai|artificial intelligence|machine learning|llm|deep learning|nlp)\b/i.test(lower)) {
      return [
        { title: 'Medical Imaging & Diagnostic Radiology', photoQuery: 'radiology MRI scan hospital' },
        { title: 'AI-Assisted Robotic Surgery & Precision Procedures', photoQuery: 'robotic surgery operating room' },
        { title: 'Genomic Sequencing & AI Drug Discovery', photoQuery: 'DNA genetics laboratory research' },
        { title: 'Clinical NLP & Smart Electronic Health Records', photoQuery: 'doctor tablet hospital medical' },
      ].slice(0, maxTopics);
    }
    return [
      { title: 'Clinical Diagnostics & Patient Care', photoQuery: 'doctor patient examination hospital' },
      { title: 'Biomedical Research & Laboratory Analysis', photoQuery: 'medical laboratory microscope' },
      { title: 'Therapeutic Treatment & Pharmacology', photoQuery: 'medicine pharmaceuticals research' },
      { title: 'Digital Health & Preventive Medicine', photoQuery: 'healthcare technology stethoscope' },
    ].slice(0, maxTopics);
  }

  // 2. Space & Astronomy domain
  if (domain === 'space' || /\b(?:space|astronomy|galaxy|planet|nebula|rocket|nasa|spacex|telescope|cosmos|black hole)\b/i.test(lower)) {
    return [
      { title: 'Space Exploration & Launch Vehicles', photoQuery: 'rocket launch spacecraft' },
      { title: 'Deep Space Observatories & Telescopes', photoQuery: 'space telescope observatory' },
      { title: 'Galaxies, Stars & Nebulae', photoQuery: 'galaxy nebula cosmos stars' },
      { title: 'Planetary Science & Surface Features', photoQuery: 'planet mars surface cosmos' },
    ].slice(0, maxTopics);
  }

  // 3. Automotive / Vehicles domain
  if (domain === 'automotive' || /\b(?:car|supercar|porsche|ferrari|engine|vehicle|racing|f1|ev|hypercar)\b/i.test(lower)) {
    const cleanCar = cleanEntityNouns(subject) || 'supercar';
    return [
      { title: `${cleanCar} Exterior Styling & Aerodynamics`, photoQuery: `${cleanCar} sports car` },
      { title: `${cleanCar} Powertrain & Engine Bay`, photoQuery: `${cleanCar} engine` },
      { title: `${cleanCar} Cockpit, Interior & Dynamics`, photoQuery: `${cleanCar} interior cockpit` },
      { title: `${cleanCar} Track Performance & Handling`, photoQuery: `${cleanCar} race track` },
    ].slice(0, maxTopics);
  }

  // 4. Technology / Computing domain
  if (domain === 'technology' || /\b(?:code|programming|computer|hardware|processor|gpu|cpu|server|cloud|ai|robotics|quantum)\b/i.test(lower)) {
    return [
      { title: 'System Architecture & Core Framework', photoQuery: 'technology circuit board server' },
      { title: 'Hardware Infrastructure & Processing Units', photoQuery: 'processor chip hardware datacenter' },
      { title: 'Data Pipeline & Distributed Processing', photoQuery: 'datacenter server room technology' },
      { title: 'User Interface & Real-World Integration', photoQuery: 'computer software screen interface' },
    ].slice(0, maxTopics);
  }

  // 5. History / Civilization domain
  if (domain === 'history' || /\b(?:history|ancient|roman|greek|egypt|empire|war|dynasty|monument|ruins|civilization)\b/i.test(lower)) {
    const cleanHist = cleanEntityNouns(subject) || 'ancient civilization';
    return [
      { title: `${cleanHist} Historical Origins & Architecture`, photoQuery: `${cleanHist} ancient architecture` },
      { title: `${cleanHist} Culture, Artifacts & Society`, photoQuery: `${cleanHist} museum artifact` },
      { title: `${cleanHist} Key Milestones & Monuments`, photoQuery: `${cleanHist} monument ruins` },
    ].slice(0, maxTopics);
  }

  // 6. Comparative / Multi-Entity
  const compMatch = subject.match(/(.+?)\s+(?:vs|versus|compared\s+to|or\s+should\s+i\s+choose)\s+(.+)/i);
  if (compMatch) {
    const entA = cleanEntityNouns(compMatch[1]) || 'Primary Model';
    const entB = cleanEntityNouns(compMatch[2]) || 'Secondary Model';
    return [
      { title: `${entA} Overview & Features`, photoQuery: entA },
      { title: `${entB} Overview & Features`, photoQuery: entB },
      { title: 'Comparative Performance & Analysis', photoQuery: `${entA} ${entB}` },
    ].slice(0, maxTopics);
  }

  // 7. General multi-clause decomposition
  const subQueries = planDeepResearchQueries(prompt, maxTopics);
  if (subQueries.length > 1) {
    return subQueries.map((sq, i) => ({
      title: `Key Aspect ${i + 1}: ${sq}`,
      photoQuery: planVisualPhotoQuery(sq),
    }));
  }

  // Single entity fallback
  const cleanSub = cleanEntityNouns(subject) || subject;
  return [
    { title: `${cleanSub} Core Overview & Visual Identity`, photoQuery: cleanSub },
    { title: `${cleanSub} Detailed Context & Background`, photoQuery: cleanSub },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronous Fast Query Planner
// ─────────────────────────────────────────────────────────────────────────────

export function formulateQueryPlan(prompt: string): QueryPlan {
  const cached = getCachedPlan(prompt);
  if (cached) return cached;

  const plan: QueryPlan = {
    webSearchQuery: planWebSearchQuery(prompt),
    deepResearchQueries: planDeepResearchQueries(prompt, 4),
    photoSearchQuery: planVisualPhotoQuery(prompt),
    videoSearchQuery: planVideoMediaQuery(prompt),
    audioSearchQuery: planAudioMusicQuery(prompt),
    primarySubject: extractCoreSubject(prompt),
    sectionalTopics: planSectionalMediaTopics(prompt, 4),
    intent: detectInquiryIntent(prompt),
    domainCategory: detectDomainCategory(prompt),
  };

  setCachedPlan(prompt, plan);
  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model-Assisted Intelligent Query Planner
// ─────────────────────────────────────────────────────────────────────────────

export async function planQueryWithModel(
  prompt: string,
  options?: {
    provider?: string;
    modelId?: string;
    apiKey?: string;
    timeoutMs?: number;
  }
): Promise<QueryPlan> {
  const cached = getCachedPlan(prompt);
  if (cached) return cached;

  const isLocal = !options?.provider || options.provider === 'nyx-native' || options.provider === 'lucifer-native' || options.provider.includes('local');
  const resolvedProvider = options?.provider || (isLocal ? 'nyx-native' : 'gemini');
  const resolvedModelId = options?.modelId || (isLocal ? 'qwen2.5-1.5b-instruct' : 'gemini-2.5-flash');

  try {
    const modelResult = await Promise.race([
      invoke<{
        intent?: string;
        requires_search?: boolean;
        web_search_query: string;
        deep_research_queries: string[];
        photo_search_query: string;
        source_preference?: string;
        video_search_query: string;
        audio_music_query?: string;
        sectional_topics?: Array<{ section_title: string; photo_query: string; video_query?: string; source_preference?: string }>;
        primary_subject: string;
        domain_category: string;
        response_style?: string;
        target_depth?: string;
      }>('generate_intelligent_query_plan_command', {
        prompt,
        provider: resolvedProvider,
        modelId: resolvedModelId,
        apiKey: isLocal ? undefined : options?.apiKey || undefined,
      }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), options?.timeoutMs || 8000)),
    ]);

    if (modelResult?.web_search_query || modelResult?.photo_search_query) {
      const dynamicSectionalTopics = (modelResult.sectional_topics || []).map((st) => ({
        title: st.section_title,
        photoQuery: st.photo_query?.trim() || st.section_title,
        videoQuery: st.video_query?.trim() || undefined,
      }));

      const refined: QueryPlan = {
        webSearchQuery: modelResult.web_search_query?.trim() || prompt.trim(),
        requiresSearch: modelResult.requires_search !== undefined ? modelResult.requires_search : true,
        deepResearchQueries: modelResult.deep_research_queries?.length > 0
          ? modelResult.deep_research_queries
          : [prompt.trim()],
        photoSearchQuery: modelResult.photo_search_query?.trim() || modelResult.primary_subject?.trim() || prompt.trim(),
        videoSearchQuery: modelResult.video_search_query?.trim() || prompt.trim(),
        audioSearchQuery: modelResult.audio_music_query?.trim() || undefined,
        primarySubject: modelResult.primary_subject?.trim() || prompt.trim(),
        sectionalTopics: dynamicSectionalTopics,
        intent: (modelResult.intent as any) || 'factual_overview',
        domainCategory: (modelResult.domain_category as QueryPlan['domainCategory']) || 'general',
        targetDepth: (modelResult.target_depth as any) || 'exhaustive',
      };
      setCachedPlan(prompt, refined);
      return refined;
    }
  } catch (err) {
    console.warn('[intelligentQueryEngine] Model query planner fallback:', err);
  }

  const fastFallback = formulateQueryPlan(prompt);
  setCachedPlan(prompt, fastFallback);
  return fastFallback;
}
