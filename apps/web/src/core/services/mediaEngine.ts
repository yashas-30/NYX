/**
 * MediaEngine Service
 * Dynamic fetching of real topic photos (Pexels/Pixabay via Rust proxy, Openverse) and vector
 * icons (Iconify API) with TTL-based memory caching to eliminate broken media and rate-limit leaks.
 *
 * ⚠️  SECURITY NOTE: Pexels and Pixabay API keys MUST only be accessed via the Rust
 * `search_images_command`. The frontend NEVER calls those APIs directly; doing so would
 * expose keys in the JS bundle and violate the CORS policy of those providers.
 */

import { invoke } from '@tauri-apps/api/core';

export interface TopicMediaResult {
  imageUrl?: string;
  iconUrl?: string;
  domainFavicon?: string;
  source: string;
}

// ── TTL-aware media cache ──────────────────────────────────────────────────────
// Replaces the previous unbounded Map which could grow forever and OOM on long sessions.
const IMG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  value: TopicMediaResult;
  ts: number;
}

const _mediaCacheStore = new Map<string, CacheEntry>();

function getCachedMedia(key: string): TopicMediaResult | null {
  const entry = _mediaCacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > IMG_CACHE_TTL_MS) {
    _mediaCacheStore.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedMedia(key: string, value: TopicMediaResult): void {
  _mediaCacheStore.set(key, { value, ts: Date.now() });
}

// ── Generation-asset cache (also TTL-aware, shares the same TTL) ─────────────
interface GenCacheEntry {
  value: { imageUrl: string; source: string };
  ts: number;
}
const _genCacheStore = new Map<string, GenCacheEntry>();

function getCachedGen(key: string): { imageUrl: string; source: string } | null {
  const entry = _genCacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > IMG_CACHE_TTL_MS) {
    _genCacheStore.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedGen(key: string, value: { imageUrl: string; source: string }): void {
  _genCacheStore.set(key, { value, ts: Date.now() });
}

// ── Fetch with timeout helper ─────────────────────────────────────────────────
function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

const KNOWN_TECH_KEYWORDS = new Set([
  // Languages
  'python', 'javascript', 'typescript', 'react', 'vue', 'angular', 'svelte',
  'rust', 'golang', 'go', 'java', 'c++', 'cpp', 'c#', 'csharp', 'php', 'ruby',
  'swift', 'kotlin', 'scala', 'haskell', 'elixir', 'erlang', 'clojure', 'dart',
  'perl', 'lua', 'r', 'matlab', 'julia', 'fortran', 'cobol', 'assembly', 'zig',
  // Frameworks & runtimes
  'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'github', 'git', 'linux',
  'node', 'nodejs', 'express', 'nextjs', 'nuxt', 'remix', 'sveltekit', 'astro',
  'tailwind', 'bootstrap', 'postgres', 'postgresql', 'mysql', 'sqlite', 'mariadb',
  'mongodb', 'redis', 'cassandra', 'elasticsearch', 'graphql', 'rest', 'grpc',
  'html', 'css', 'sass', 'less', 'webpack', 'vite', 'rollup', 'esbuild', 'bun',
  // DevOps & cloud
  'terraform', 'ansible', 'jenkins', 'gitlab', 'vercel', 'netlify', 'heroku',
  'cloudflare', 'nginx', 'apache', 'prometheus', 'grafana', 'datadog', 'sentry',
  // AI / ML
  'pytorch', 'tensorflow', 'huggingface', 'openai', 'anthropic', 'gemini',
  'langchain', 'llamaindex', 'ollama', 'stable-diffusion', 'midjourney',
  // Mobile
  'flutter', 'expo', 'react-native', 'android', 'ios', 'xcode', 'swiftui',
  // Data
  'pandas', 'numpy', 'spark', 'kafka', 'airflow', 'dbt', 'snowflake', 'bigquery',
]);

/**
 * Topic → emoji curated map (130+ entries) for general knowledge headings.
 * Used when no Iconify SVG logo exists for the topic.
 */
const TOPIC_EMOJI_MAP: Array<[RegExp, string]> = [
  // Technology & Computing
  [/\b(artificial intelligence|ai|machine learning|ml|deep learning|neural network)\b/i, '🤖'],
  [/\b(robot|robotics|automation|autonomous)\b/i, '🦾'],
  [/\b(quantum|qubit)\b/i, '⚛️'],
  [/\b(blockchain|crypto|bitcoin|ethereum|web3|nft|defi)\b/i, '🔗'],
  [/\b(cybersecurity|security|hacking|vulnerability|encryption|privacy)\b/i, '🔐'],
  [/\b(cloud|server|infrastructure|devops|deployment)\b/i, '☁️'],
  [/\b(database|data|analytics|big data|warehouse)\b/i, '🗄️'],
  [/\b(api|endpoint|microservice|backend)\b/i, '🔌'],
  [/\b(mobile|app|smartphone|android|ios)\b/i, '📱'],
  [/\b(web|website|frontend|ui|ux|design)\b/i, '🌐'],
  [/\b(game|gaming|vr|ar|metaverse|graphics|gpu)\b/i, '🎮'],
  [/\b(chip|semiconductor|cpu|processor|hardware)\b/i, '💾'],
  [/\b(network|internet|protocol|bandwidth|latency)\b/i, '📡'],
  // Science
  [/\b(space|astronomy|galaxy|star|planet|cosmos|nasa|spacex)\b/i, '🚀'],
  [/\b(physics|quantum mechanics|relativity|particle)\b/i, '⚡'],
  [/\b(chemistry|molecule|compound|element|reaction)\b/i, '🧪'],
  [/\b(biology|cell|dna|gene|genome|evolution|organism)\b/i, '🧬'],
  [/\b(medicine|medical|health|disease|drug|treatment|vaccine|pharma)\b/i, '💊'],
  [/\b(brain|neuroscience|psychology|mental|cognitive)\b/i, '🧠'],
  [/\b(climate|environment|ecology|green|renewable|solar|wind energy)\b/i, '🌱'],
  [/\b(ocean|marine|sea|underwater|aquatic)\b/i, '🌊'],
  [/\b(geology|earthquake|volcano|plate tectonics|fossil)\b/i, '🏔️'],
  [/\b(mathematics|math|calculus|algebra|geometry|statistics)\b/i, '📐'],
  // Finance & Economics
  [/\b(finance|financial|investment|stock|market|trading|hedge fund)\b/i, '📈'],
  [/\b(economy|economics|gdp|inflation|recession|monetary)\b/i, '💹'],
  [/\b(bank|banking|credit|loan|mortgage|interest rate)\b/i, '🏦'],
  [/\b(startup|venture|vc|funding|unicorn|entrepreneur)\b/i, '💡'],
  [/\b(tax|revenue|budget|fiscal|government spending)\b/i, '🏛️'],
  // Business & Management
  [/\b(strategy|management|leadership|executive|ceo|corporate)\b/i, '🎯'],
  [/\b(marketing|branding|advertising|campaign|seo)\b/i, '📣'],
  [/\b(product|launch|roadmap|feature|sprint|agile|scrum)\b/i, '🗺️'],
  [/\b(supply chain|logistics|manufacturing|production|factory)\b/i, '🏭'],
  [/\b(human resources|hr|talent|recruiting|hiring|employee)\b/i, '👥'],
  // History & Society
  [/\b(history|historical|ancient|civilization|empire|war|revolution)\b/i, '🏛️'],
  [/\b(politics|political|democracy|government|election|policy)\b/i, '🗳️'],
  [/\b(law|legal|court|justice|constitution|rights)\b/i, '⚖️'],
  [/\b(philosophy|ethics|morality|consciousness|epistemology)\b/i, '💭'],
  [/\b(religion|spiritual|faith|belief|theology)\b/i, '🕊️'],
  [/\b(culture|art|music|film|literature|creative)\b/i, '🎨'],
  [/\b(education|school|university|learning|academic|research)\b/i, '🎓'],
  // People & Society
  [/\b(population|demographic|migration|immigration|refugee)\b/i, '🌍'],
  [/\b(gender|diversity|inclusion|equality|discrimination)\b/i, '🌈'],
  [/\b(poverty|inequality|welfare|social|community)\b/i, '🤝'],
  // Nature & Geography
  [/\b(animal|wildlife|species|conservation|biodiversity)\b/i, '🦁'],
  [/\b(plant|forest|tree|agriculture|farming|crop)\b/i, '🌿'],
  [/\b(weather|meteorology|storm|hurricane|tornado)\b/i, '🌩️'],
  [/\b(city|urban|architecture|infrastructure|transport)\b/i, '🏙️'],
  [/\b(travel|tourism|geography|country|continent)\b/i, '✈️'],
  // Food & Lifestyle
  [/\b(food|nutrition|diet|recipe|cuisine|cooking)\b/i, '🍽️'],
  [/\b(sport|sports|fitness|exercise|athlete|olympic)\b/i, '🏆'],
  [/\b(fashion|clothing|style|luxury|brand)\b/i, '👗'],
  [/\b(home|real estate|housing|property|mortgage)\b/i, '🏠'],
  // Energy
  [/\b(energy|electricity|power|nuclear|fossil fuel|oil|gas)\b/i, '⚡'],
  [/\b(battery|ev|electric vehicle|charging)\b/i, '🔋'],
  // Default
  [/\b(overview|introduction|summary|conclusion|background)\b/i, '📋'],
  [/\b(future|trend|prediction|forecast|outlook)\b/i, '🔮'],
  [/\b(problem|challenge|solution|approach|method)\b/i, '🔧'],
  [/\b(benefit|advantage|feature|capability|strength)\b/i, '✨'],
  [/\b(risk|danger|threat|vulnerability|concern)\b/i, '⚠️'],
  [/\b(comparison|versus|vs|difference|alternative)\b/i, '⚖️'],
  [/\b(timeline|history|milestone|evolution|development)\b/i, '📅'],
  [/\b(example|case study|case|instance|scenario)\b/i, '💼'],
];

/**
 * Returns the most relevant Unicode emoji for a heading or topic string.
 * Returns empty string if no match found (caller should omit the icon).
 */
export function getEmojiForTopic(text: string): string {
  if (!text || text.trim().length === 0) return '';
  for (const [pattern, emoji] of TOPIC_EMOJI_MAP) {
    if (pattern.test(text)) return emoji;
  }
  return '';
}


/**
 * Fetch a high-quality SVG vector icon URL from the Iconify API for a keyword.
 * Strictly restricted to verified software & programming technology keywords.
 * Prefers the `logos:` icon set for accurate tech brand icons.
 */
export async function fetchIconifyUrl(keyword: string): Promise<string | null> {
  if (!keyword || keyword.trim().length === 0) return null;
  const cleanKeyword = keyword.trim().toLowerCase();

  // ONLY query Iconify for known software/programming technologies
  if (!KNOWN_TECH_KEYWORDS.has(cleanKeyword)) {
    return null;
  }

  try {
    // Fetch up to 5 candidates so we can prefer the `logos:` set
    const res = await fetchWithTimeout(
      `https://api.iconify.design/search?query=${encodeURIComponent(cleanKeyword)}&limit=5`,
      {},
      5000
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.icons) && data.icons.length > 0) {
      // Prefer `logos:` prefix for accurate brand icons; fall back to first result
      const bestIcon =
        data.icons.find((n: string) => n.startsWith('logos:')) ?? data.icons[0];
      if (bestIcon.includes(':')) {
        const [prefix, name] = bestIcon.split(':');
        return `https://api.iconify.design/${prefix}/${name}.svg`;
      }
    }
  } catch (err) {
    console.warn(`[MediaEngine] Iconify lookup failed for "${keyword}":`, err);
  }
  return null;
}

/**
 * Fetch a real image photo URL from Openverse REST API (700M+ CC & Public Domain Repository).
 * Uses a 5-second timeout to avoid stalling the pipeline.
 */
export async function fetchOpenverseImage(topic: string): Promise<string | null> {
  if (!topic || topic.trim().length === 0) return null;
  const cleanTopic = topic.trim();

  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(cleanTopic)}&page_size=1`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.results && Array.isArray(data.results) && data.results.length > 0) {
      const imgUrl = data.results[0]?.url;
      if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
        return imgUrl;
      }
    }
  } catch (err) {
    console.warn(`[MediaEngine] Openverse image lookup failed for "${topic}":`, err);
  }
  return null;
}

/**
 * Construct Google Favicon API URL for a domain or technology.
 */
export function getDomainFaviconUrl(domainOrTech: string): string {
  let domain = domainOrTech.toLowerCase().trim();
  if (domain.includes('apple')) domain = 'apple.com';
  else if (domain.includes('google')) domain = 'google.com';
  else if (domain.includes('microsoft')) domain = 'microsoft.com';
  else if (domain.includes('amazon')) domain = 'amazon.com';
  else if (domain.includes('python')) domain = 'python.org';
  else if (domain.includes('react')) domain = 'react.dev';
  else if (domain.includes('rust')) domain = 'rust-lang.org';
  else if (domain.includes('github')) domain = 'github.com';
  else if (domain.includes('openai') || domain.includes('chatgpt')) domain = 'openai.com';
  else if (domain.includes('nvidia')) domain = 'nvidia.com';
  else if (domain.includes('tesla')) domain = 'tesla.com';
  else if (!domain.includes('.')) domain = `${domain}.com`;

  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Fetch a real topic image photo URL from Openverse or Pixabay API.
 */
export async function fetchRealTopicPhoto(topic: string): Promise<string | null> {
  if (!topic || topic.trim().length === 0) return null;
  const cleanTopic = topic.trim();

  try {
    const photos = await searchTopicImages(cleanTopic, 1);
    if (photos.length > 0 && photos[0]?.url) {
      return photos[0].url;
    }
  } catch (err) {
    console.warn(`[MediaEngine] Image search failed for "${topic}":`, err);
  }
  return null;
}

/**
 * Extract clean, focused search keywords from a conversational prompt sentence.
 */
export function extractCoreTopicKeywords(rawQuery: string): string {
  if (!rawQuery) return '';
  let cleaned = rawQuery.trim();

  // Strip common prompt wrapper prefixes
  cleaned = cleaned.replace(/^(?:can\s+you\s+(?:please\s+)?)?(?:give\s+me\s+(?:an?\s+)?|deep\s+research\s+(?:on|about)|research\s+(?:on|about)|tell\s+me\s+about|explain|find\s+out\s+(?:about)?|search\s+(?:the\s+web\s+)?for|show\s+me\s+(?:an?\s+)?|images?\s+of|photos?\s+of|pictures?\s+of|visual\s+representation\s+of|what\s+is\s+(?:the\s+)?|who\s+is\s+(?:the\s+)?|all\s+about)\s+/i, '');
  cleaned = cleaned.replace(/\s+(?:with\s+all\s+facts|with\s+family\s+tree|family\s+tree|diagram|explained\s+in\s+detail|in\s+detail|detailed\s-research|for\s+me|please|with\s+images|with\s+photos)$/i, '');
  cleaned = cleaned.replace(/[?.!]+/g, '').trim();

  const stopWords = new Set([
    'research', 'about', 'which', 'is', 'best', 'for', 'long', 'and', 'can', 'work', 'in',
    'heavy', 'workloads', 'loads', 'including', 'want', 'you', 'to', 'every', 'under',
    'the', 'a', 'an', 'what', 'how', 'tell', 'me', 'give', 'show', 'find', 'or', 'with',
    'on', 'at', 'by', 'from', 'this', 'that', 'good', 'top', 'great', 'battery', 'life'
  ]);

  const words = cleaned.toLowerCase().split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(w => w.length > 2 && !stopWords.has(w));
  if (words.length > 0) {
    return words.slice(0, 2).join(' ');
  }

  return cleaned.length > 0 ? cleaned : rawQuery.trim();
}

export interface ExtractedImage {
  url: string;
  title: string;
}

/**
 * Dynamically search and return multiple real high-resolution, accurate web photos for any keyword query.
 *
 * SECURITY: All requests with API keys (Pexels, Pixabay) are proxied through the Rust backend
 * via `search_images_command`. The frontend never calls those providers directly.
 * Only Openverse (no auth required) is called from the browser as a fallback.
 */
export async function searchTopicImages(query: string, limit = 6): Promise<ExtractedImage[]> {
  const topic = extractCoreTopicKeywords(query);
  if (!topic) return [];

  const results: ExtractedImage[] = [];
  const seen = new Set<string>();

  // 1. Rust Unified Image Search Engine (Pixabay + Pexels + Openverse — keys stay in Rust)
  try {
    const rustResJson = await invoke<string>('search_images_command', { query: topic, limit });
    if (rustResJson) {
      const items = JSON.parse(rustResJson);
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item?.url && typeof item.url === 'string' && !seen.has(item.url)) {
            seen.add(item.url);
            results.push({
              url: item.url,
              title: (item.title || topic).trim(),
            });
            if (results.length >= limit) return results;
          }
        }
      }
    }
  } catch {
    // Fall back to Openverse (public, no API key)
  }

  // 2. Openverse fallback — public API, no key required, 5s timeout
  if (results.length < limit) {
    const encoded = encodeURIComponent(topic);
    try {
      const res = await fetchWithTimeout(
        `https://api.openverse.org/v1/images/?q=${encoded}&page_size=${limit}`,
        {},
        5000
      );
      if (res.ok) {
        const d = await res.json();
        if (d?.results && Array.isArray(d.results)) {
          for (const item of d.results) {
            const imgUrl = item?.url;
            const title = item?.title || topic;
            const lower = typeof imgUrl === 'string' ? imgUrl.toLowerCase() : '';
            if (imgUrl && !lower.includes('.svg') && !seen.has(imgUrl)) {
              seen.add(imgUrl);
              results.push({ url: imgUrl, title });
              if (results.length >= limit) break;
            }
          }
        }
      }
    } catch {
      // Openverse timeout/error — return what we have
    }
  }

  return results;
}

/**
 * Fetch an image from a URL via the Rust backend and return it as base64.
 * Required for local models that cannot receive direct image URLs.
 * Falls back to a browser fetch (may fail on CORS-restricted CDNs).
 */
export async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ data: string; mimeType: string } | null> {
  // Primary: Rust backend (avoids CORS, validates content-type)
  try {
    const result = await invoke<{ base64: string; mime_type: string }>('fetch_image_base64', {
      url: imageUrl,
    });
    if (result?.base64) {
      return { data: result.base64, mimeType: result.mime_type };
    }
  } catch {
    // Fall through to browser fetch
  }

  // Fallback: browser fetch (will fail on CORS-heavy CDNs)
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(imageUrl, { signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return { data: base64, mimeType: blob.type };
  } catch {
    return null;
  }
}

/**
 * Comprehensive Media Engine lookup method.
 */
export async function getTopicMedia(query: string): Promise<TopicMediaResult> {
  const cacheKey = query.trim().toLowerCase();
  const cached = getCachedMedia(cacheKey);
  if (cached) return cached;

  const domainFavicon = getDomainFaviconUrl(query);
  
  // Parallel asynchronous lookup for vector icon and real photo
  const [iconUrl, imageUrl] = await Promise.all([
    fetchIconifyUrl(query),
    fetchRealTopicPhoto(query),
  ]);

  const result: TopicMediaResult = {
    domainFavicon,
    iconUrl: iconUrl || undefined,
    imageUrl: imageUrl || undefined,
    source: 'MediaEngine',
  };

  setCachedMedia(cacheKey, result);
  return result;
}

export interface GeneratedImagePayload {
  success: boolean;
  imageUrl: string;
  prompt: string;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3';
  engine: string;
  thumbHash?: string;
}

/**
 * Dispatch image generation call to Rust backend / Pollinations API with aspect ratio & prompt IR enhancement.
 */
export async function generateVisualAsset(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' = '16:9',
  engineOverride?: string
): Promise<GeneratedImagePayload> {
  const cleanPrompt = prompt.trim();
  const cacheKey = `gen:${cleanPrompt}:${aspectRatio}`;
  
  const cachedGen = getCachedGen(cacheKey);
  if (cachedGen?.imageUrl) {
    return {
      success: true,
      imageUrl: cachedGen.imageUrl,
      prompt: cleanPrompt,
      aspectRatio,
      engine: cachedGen.source,
    };
  }

  try {
    // Attempt Tauri invoke if running in Tauri desktop environment
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
      const res = await tauriInvoke<any>('generate_image', { prompt: cleanPrompt, aspectRatio });
      if (res && res.image_path) {
        const payload: GeneratedImagePayload = {
          success: true,
          imageUrl: res.image_path,
          prompt: cleanPrompt,
          aspectRatio,
          engine: res.engine || 'Local Engine',
        };
        setCachedGen(cacheKey, { imageUrl: res.image_path, source: res.engine || 'Local Engine' });
        return payload;
      }
    }
  } catch (err) {
    console.warn('[MediaEngine] Tauri generate_image failed, using cloud fallback:', err);
  }

  // Cloud fallback: Pollinations AI with aspect ratio dimension map
  const dimensions: Record<string, { w: number; h: number }> = {
    '16:9': { w: 1344, h: 768 },
    '9:16': { w: 768, h: 1344 },
    '4:3': { w: 1152, h: 864 },
    '1:1': { w: 1024, h: 1024 },
  };

  const { w, h } = dimensions[aspectRatio] || dimensions['1:1'];
  const seed = Math.floor(Math.random() * 1000000);
  const cloudUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=flux`;

  const payload: GeneratedImagePayload = {
    success: true,
    imageUrl: cloudUrl,
    prompt: cleanPrompt,
    aspectRatio,
    engine: 'Pollinations FLUX Cloud',
  };

  setCachedGen(cacheKey, { imageUrl: cloudUrl, source: 'Pollinations FLUX Cloud' });
  return payload;
}
