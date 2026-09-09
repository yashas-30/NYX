/**
 * mediaEngine.ts
 *
 * Unified Media Retrieval & Synthesis Engine for NYX:
 * 1. Real Web Photos: DuckDuckGo Images + Bing Web Images (via Rust native backend & browser fallback)
 * 2. Visual Assets: Rust local Diffusers engine & DuckDuckGo/Bing Web Images
 * 3. Vector Logos & Favicons: Iconify Logos API + Google Favicons Service
 */

import { invoke } from '@tauri-apps/api/core';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ExtractedImage {
  url: string;
  title: string;
  source?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface ExtractedVideo {
  url: string;
  previewUrl: string;
  title: string;
  duration: number | string;
  width?: number;
  height?: number;
  source: string;
  author: string;
  authorUrl?: string;
  videoId?: string;
  thumbnailUrl?: string;
}

export interface ExtractedAudio {
  url: string;
  title: string;
  artist: string;
  duration?: number;
  source: string;
  tags?: string;
  previewUrl?: string;
}

export interface TopicMediaResult {
  imageUrl?: string;
  images?: ExtractedImage[];
  videos?: ExtractedVideo[];
  audios?: ExtractedAudio[];
  iconUrl?: string;
  domainFavicon?: string;
  source: string;
}

// ── TTL Cache Layer ───────────────────────────────────────────────────────────

const MEDIA_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  value: T;
  ts: number;
}

const _mediaCacheStore = new Map<string, CacheEntry<TopicMediaResult>>();
const _genCacheStore = new Map<string, CacheEntry<{ imageUrl: string; source: string }>>();

function getCached<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > MEDIA_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(store: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (store.size > 300) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(key, { value, ts: Date.now() });
}

// ── Fetch Helper with Timeout ─────────────────────────────────────────────────

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

// ── Dynamic Topic Icon & Emoji Resolution ──────────────────────────────────────

export function getEmojiForTopic(_text: string): string {
  // Domain-agnostic: avoid hardcoding topic strings or regex tables
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Vector Icons & Favicons
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchIconifyUrl(keyword: string): Promise<string | null> {
  if (!keyword?.trim()) return null;
  const clean = keyword
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!clean || clean.length < 2) return null;

  try {
    const res = await fetchWithTimeout(
      `https://api.iconify.design/search?query=${encodeURIComponent(clean)}&limit=5`,
      {},
      4000
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.icons && Array.isArray(data.icons) && data.icons.length > 0) {
      const bestIcon = data.icons.find((n: string) => n.startsWith('logos:')) ?? data.icons[0];
      if (bestIcon.includes(':')) {
        const [prefix, name] = bestIcon.split(':');
        return `https://api.iconify.design/${prefix}/${name}.svg`;
      }
    }
  } catch {
    // Non-critical icon fetch failure
  }
  return null;
}

export function getDomainFaviconUrl(domainOrUrl: string): string {
  if (!domainOrUrl?.trim()) return '';
  let clean = domainOrUrl.toLowerCase().trim();
  try {
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      clean = new URL(clean).hostname;
    }
  } catch {
    // Fall back to clean string
  }
  clean = clean.replace(/^[a-z0-9_-]+:\/\//i, '').split('/')[0];
  if (!clean.includes('.')) clean = `${clean}.com`;
  return `https://www.google.com/s2/favicons?domain=${clean}&sz=64`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Real Web Image Search Engines: DuckDuckGo Images + Bing Images
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchBingWebImages(query: string, limit = 6): Promise<ExtractedImage[]> {
  if (!query?.trim()) return [];
  const cleanQ = query.trim().replace(/['"“”#]/g, '');

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const rustJson = await invoke<string>('search_images_command', {
        query: cleanQ,
        limit,
      });
      if (rustJson) {
        const items = JSON.parse(rustJson);
        if (Array.isArray(items)) {
          return items
            .filter((it: any) => it?.url && typeof it.url === 'string' && it.url.startsWith('http'))
            .map((it: any) => ({
              url: it.url,
              title: it.title || cleanQ,
              source: it.source || 'Web (Bing Images)',
              thumbnailUrl: it.url,
            }));
        }
      }
    } catch {}
  }

  return [];
}

export async function fetchDuckDuckGoImages(query: string, limit = 6): Promise<ExtractedImage[]> {
  if (!query?.trim()) return [];
  const cleanQ = query.trim().replace(/['"“”#]/g, '');
  const results: ExtractedImage[] = [];
  const seenUrls = new Set<string>();

  // 1. Primary: Native Rust backend search_images_command (executes DDG + Bing without CORS or header limits)
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const rustJson = await invoke<string>('search_images_command', {
        query: cleanQ,
        limit,
      });
      if (rustJson) {
        const items = JSON.parse(rustJson);
        if (Array.isArray(items)) {
          for (const item of items) {
            if (
              item?.url &&
              typeof item.url === 'string' &&
              item.url.startsWith('http') &&
              !seenUrls.has(item.url)
            ) {
              seenUrls.add(item.url);
              results.push({
                url: item.url,
                title: (item.title || cleanQ).trim(),
                source: item.source || 'DuckDuckGo Images',
                thumbnailUrl: item.url,
              });
              if (results.length >= limit) return results;
            }
          }
        }
      }
      if (results.length > 0) return results;
    }
  } catch (err) {
    console.warn('[MediaEngine] Rust search_images_command failed:', err);
  }

  // 2. Direct browser fallback for DuckDuckGo
  if (results.length < limit) {
    try {
      const tokenUrl = `https://duckduckgo.com/?q=${encodeURIComponent(cleanQ)}&t=h_&iar=images&iax=images&ia=images`;
      const tokenRes = await fetchWithTimeout(
        tokenUrl,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        },
        4000
      );
      if (tokenRes.ok) {
        const html = await tokenRes.text();
        const vqdMatch = html.match(/vqd=([0-9-_]+)/) || html.match(/vqd="([^"]+)"/);
        if (vqdMatch && vqdMatch[1]) {
          const vqd = vqdMatch[1];
          const iUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(cleanQ)}&vqd=${vqd}&f=,,,;&p=1`;
          const iRes = await fetchWithTimeout(
            iUrl,
            {
              headers: {
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json, text/javascript, */*; q=0.01',
              },
            },
            4000
          );
          if (iRes.ok) {
            const data = await iRes.json();
            for (const r of data.results || []) {
              if (
                r.image &&
                typeof r.image === 'string' &&
                r.image.startsWith('http') &&
                !seenUrls.has(r.image)
              ) {
                seenUrls.add(r.image);
                results.push({
                  url: r.image,
                  title: r.title || cleanQ,
                  source: 'DuckDuckGo Images',
                  thumbnailUrl: r.thumbnail || r.image,
                  width: r.width,
                  height: r.height,
                });
                if (results.length >= limit) return results;
              }
            }
          }
        }
      }
    } catch {}
  }

  return results;
}

/**
 * Searches real-world images from DuckDuckGo Images and Bing Images:
 * Real photos, comic artwork, vehicles, products, gadgets, historical events, and real web photos.
 * DuckDuckGo and Bing images are searched concurrently in the native Rust backend and deduplicated.
 */
const BLOCKED_STOCK_DOMAINS = [
  'dreamstime.com',
  'depositphotos.com',
  'shutterstock.com',
  'istockphoto.com',
  'alamy.com',
  '123rf.com',
  'vectorstock.com',
  'gettyimages.com',
  'stock.adobe.com',
  'ftcdn.net',
  'clipart.com',
  'freepik.com',
  'canstockphoto.com',
  'bigstockphoto.com',
  'cleanpng.com',
  'pngtree.com',
  'pngwing.com',
  'pngfind.com',
  'pngitem.com',
  'doubleclick',
  'googleads',
  'adservice',
];

export function isBlockedStockDomain(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return BLOCKED_STOCK_DOMAINS.some((d) => lower.includes(d));
}

export async function searchTopicImages(query: string, limit = 6): Promise<ExtractedImage[]> {
  const topic = query?.trim();
  if (!topic) return [];

  const cleanQ = topic.replace(/['"“”#]/g, '');
  const results: ExtractedImage[] = [];
  const seenUrls = new Set<string>();

  // 1. Primary: Native Rust backend (executes DDG + Bing in parallel without CORS limitations)
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const rustJson = await invoke<string>('search_images_command', {
        query: cleanQ,
        limit,
      });
      if (rustJson) {
        const items = JSON.parse(rustJson);
        if (Array.isArray(items)) {
          for (const item of items) {
            if (
              item?.url &&
              typeof item.url === 'string' &&
              item.url.startsWith('http') &&
              !seenUrls.has(item.url) &&
              !isBlockedStockDomain(item.url)
            ) {
              seenUrls.add(item.url);
              results.push({
                url: item.url,
                title: (item.title || cleanQ).trim(),
                source: item.source || 'Web Image',
                thumbnailUrl: item.url,
              });
              if (results.length >= limit) return results;
            }
          }
        }
      }
      if (results.length > 0) return results;
    }
  } catch (err) {
    console.warn('[MediaEngine] Rust search_images_command failed:', err);
  }

  // 2. Direct browser fallback
  const ddgFallback = await fetchDuckDuckGoImages(cleanQ, limit).catch(() => []);
  for (const img of ddgFallback) {
    if (!seenUrls.has(img.url) && !isBlockedStockDomain(img.url)) {
      seenUrls.add(img.url);
      results.push(img);
      if (results.length >= limit) break;
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Video & Audio Retrieval (Real YouTube & Web Videos)
// ─────────────────────────────────────────────────────────────────────────────

export function isYouTubeUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)/i.test(url);
}

export function extractYouTubeVideoId(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

export function isNonEnglishText(text?: string): boolean {
  if (!text) return false;
  const nonLatinRegex =
    /[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u0590-\u05FF\u0980-\u0DFF]/;
  return nonLatinRegex.test(text);
}

export function parseDurationToSeconds(durationStr?: string): number {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const parts = durationStr.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function isYouTubeShortsVideo(
  url?: string,
  title?: string,
  description?: string,
  durationSecs = 0
): boolean {
  if (!url) return false;
  if (url.includes('/shorts/')) return true;
  const lowerTitle = (title || '').toLowerCase();
  if (/\b(?:#shorts|#short|youtube shorts|yt shorts)\b/i.test(lowerTitle)) return true;
  const lowerDesc = (description || '').toLowerCase();
  if (/\b(?:#shorts|#short)\b/i.test(lowerDesc)) return true;
  if (durationSecs > 0 && durationSecs < 75) return true;
  return false;
}

export function calculateVideoExplanationScore(
  viewCount: number,
  durationSecs: number,
  title = '',
  uploader = ''
): number {
  let score = viewCount > 0 ? Math.log10(viewCount) * 10 : 10;
  if (durationSecs >= 180 && durationSecs <= 2100) {
    score += 15;
  } else if (durationSecs >= 120 && durationSecs <= 3600) {
    score += 8;
  } else if (durationSecs > 3600) {
    score += 2;
  }

  const lowerTitle = title.toLowerCase();
  const explanationKeywords = [
    'explained',
    'explanation',
    'how it works',
    'architecture',
    'deep dive',
    'tutorial',
    'lecture',
    'course',
    'guide',
    'demonstration',
    'breakdown',
    'understanding',
    'complete',
    'overview',
    'fundamentals',
    'introduction',
    'walkthrough',
    'step by step',
  ];
  for (const kw of explanationKeywords) {
    if (lowerTitle.includes(kw)) {
      score += 6;
      break;
    }
  }

  const lowerUploader = uploader.toLowerCase();
  const authorityChannels = [
    'ibm',
    'microsoft',
    'google',
    'mit',
    'stanford',
    'veritasium',
    '3blue1brown',
    'kurzgesagt',
    'computerphile',
    'fireship',
    'lex fridman',
    'two minute papers',
    'khan academy',
    'freecodecamp',
    'real engineering',
    'scientific american',
    'crashcourse',
    'ted-ed',
    'pbs space time',
    'numberphile',
    'sabine hossenfelder',
    'statquest',
    'cosden solutions',
    'neetcode',
    'quanta magazine',
  ];
  for (const auth of authorityChannels) {
    if (lowerUploader.includes(auth)) {
      score += 10;
      break;
    }
  }

  return score;
}

export async function searchTopicVideos(query: string, limit = 3): Promise<ExtractedVideo[]> {
  if (!query?.trim()) return [];
  const cleanQ = query.trim().replace(/['"“”#]/g, '');
  const results: ExtractedVideo[] = [];
  const seenIds = new Set<string>();

  // 1. Primary: Native Rust backend search_videos_command (queries DuckDuckGo video search with view ranking and English filter)
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const rustJson = await invoke<string>('search_videos_command', {
        query: cleanQ,
        limit,
      });
      if (rustJson) {
        const items = JSON.parse(rustJson);
        if (Array.isArray(items)) {
          for (const item of items) {
            const vidId = item.video_id || extractYouTubeVideoId(item.url);
            if (vidId && !seenIds.has(vidId)) {
              seenIds.add(vidId);
              results.push({
                url: item.url || `https://www.youtube.com/watch?v=${vidId}`,
                previewUrl:
                  item.thumbnail_url || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
                title: item.title || cleanQ,
                duration: item.duration || '',
                source: item.source || 'YouTube (DuckDuckGo Video Search)',
                author: item.uploader || 'YouTube',
                videoId: vidId,
                thumbnailUrl:
                  item.thumbnail_url || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
              });
              if (results.length >= limit) return results;
            }
          }
        }
      }
      if (results.length > 0) return results;
    }
  } catch (err) {
    console.warn('[MediaEngine] Rust search_videos_command failed:', err);
  }

  // 2. Direct browser fallback for DuckDuckGo videos with scoring and filtering
  try {
    const tokenUrl = `https://duckduckgo.com/?q=${encodeURIComponent(cleanQ)}&t=h_&iar=videos&iax=videos&ia=videos`;
    const tokenRes = await fetchWithTimeout(
      tokenUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
      4000
    );
    if (tokenRes.ok) {
      const html = await tokenRes.text();
      const vqdMatch = html.match(/vqd=([0-9-_]+)/) || html.match(/vqd="([^"]+)"/);
      if (vqdMatch && vqdMatch[1]) {
        const vqd = vqdMatch[1];
        const vUrl = `https://duckduckgo.com/v.js?l=us-en&o=json&q=${encodeURIComponent(cleanQ)}&vqd=${vqd}&p=1&s=0`;
        const vRes = await fetchWithTimeout(
          vUrl,
          {
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              Accept: 'application/json, text/javascript, */*; q=0.01',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          },
          4000
        );
        if (vRes.ok) {
          const data = await vRes.json();
          const candidates: Array<{ item: ExtractedVideo; score: number }> = [];

          for (const r of data.results || []) {
            const vidId = extractYouTubeVideoId(r.content || '');
            if (!vidId || seenIds.has(vidId)) continue;

            const cleanTitle = (r.title || cleanQ).replace(/<[^>]+>/g, '').trim();
            const uploader = (r.uploader || 'YouTube').trim();

            // English only filter
            if (isNonEnglishText(cleanTitle) || isNonEnglishText(uploader)) continue;

            // Shorts filter
            const durationSecs = parseDurationToSeconds(r.duration);
            if (isYouTubeShortsVideo(r.content, cleanTitle, r.description, durationSecs)) continue;

            seenIds.add(vidId);
            const views =
              r.statistics?.viewCount ||
              (typeof r.views === 'number'
                ? r.views
                : typeof r.views === 'string'
                  ? parseInt(r.views.replace(/,/g, ''), 10) || 0
                  : 0);
            const score = calculateVideoExplanationScore(views, durationSecs, cleanTitle, uploader);

            candidates.push({
              item: {
                url: `https://www.youtube.com/watch?v=${vidId}`,
                previewUrl:
                  r.images?.large ||
                  r.images?.medium ||
                  `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
                title: cleanTitle,
                duration: r.duration || '',
                source: 'YouTube',
                author: uploader,
                videoId: vidId,
                thumbnailUrl:
                  r.images?.large ||
                  r.images?.medium ||
                  `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
              },
              score,
            });
          }

          candidates.sort((a, b) => b.score - a.score);
          for (const cand of candidates.slice(0, limit)) {
            results.push(cand.item);
          }
        }
      }
    }
  } catch {}

  return results;
}

export async function searchTopicAudio(
  _query: string,
  _limit = 0,
  _qwenQuery?: string
): Promise<ExtractedAudio[]> {
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Media Retrieval Gateway
// ─────────────────────────────────────────────────────────────────────────────

export interface TopicMediaOptions {
  includeVideos?: boolean;
  includeAudio?: boolean;
  includeImages?: boolean;
  limit?: number;
}

export async function getTopicMedia(
  query: string,
  optionsOrLimit: number | TopicMediaOptions = 4
): Promise<TopicMediaResult> {
  const options: TopicMediaOptions =
    typeof optionsOrLimit === 'number'
      ? { limit: optionsOrLimit, includeImages: true, includeVideos: false, includeAudio: false }
      : {
          limit: 4,
          includeImages: true,
          includeVideos: false,
          includeAudio: false,
          ...optionsOrLimit,
        };

  const cacheKey = `${query.trim().toLowerCase()}:i=${options.includeImages !== false}`;
  const cached = getCached(_mediaCacheStore, cacheKey);
  if (cached) return cached;

  const domainFavicon = getDomainFaviconUrl(query);
  const limit = options.limit || 4;

  const imagePromise =
    options.includeImages !== false
      ? searchTopicImages(query, limit).catch(() => [] as ExtractedImage[])
      : Promise.resolve([] as ExtractedImage[]);

  const [iconUrl, topicPhotos] = await Promise.all([fetchIconifyUrl(query), imagePromise]);

  const primaryPhoto = topicPhotos[0]?.url || undefined;

  const result: TopicMediaResult = {
    domainFavicon,
    iconUrl: iconUrl || undefined,
    imageUrl: primaryPhoto,
    images: topicPhotos.length > 0 ? topicPhotos : undefined,
    source: 'MediaEngine (DuckDuckGo & Bing Web Images)',
  };

  setCached(_mediaCacheStore, cacheKey, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generative Visual Asset Synthesis
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratedImagePayload {
  success: boolean;
  imageUrl: string;
  prompt: string;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3';
  engine: string;
  thumbHash?: string;
}

export async function generateVisualAsset(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' = '16:9',
  _engineOverride?: string
): Promise<GeneratedImagePayload> {
  const cleanPrompt = prompt.trim();
  const cacheKey = `gen:${cleanPrompt}:${aspectRatio}`;

  const cachedGen = getCached(_genCacheStore, cacheKey);
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
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const res = await invoke<any>('generate_image', { prompt: cleanPrompt, aspectRatio });
      if (res?.image_path) {
        const payload: GeneratedImagePayload = {
          success: true,
          imageUrl: res.image_path,
          prompt: cleanPrompt,
          aspectRatio,
          engine: res.engine || 'Local Engine',
        };
        setCached(_genCacheStore, cacheKey, {
          imageUrl: res.image_path,
          source: res.engine || 'Local Engine',
        });
        return payload;
      }
    }
  } catch (err) {
    console.warn('[MediaEngine] Local generate_image error:', err);
  }

  // Authentic web image retrieval fallback
  try {
    const webImages = await searchTopicImages(cleanPrompt, 1);
    if (webImages.length > 0) {
      const topImg = webImages[0];
      const payload: GeneratedImagePayload = {
        success: true,
        imageUrl: topImg.url,
        prompt: cleanPrompt,
        aspectRatio,
        engine: topImg.source || 'DuckDuckGo & Bing Web Images',
      };
      setCached(_genCacheStore, cacheKey, {
        imageUrl: topImg.url,
        source: topImg.source || 'DuckDuckGo & Bing Web Images',
      });
      return payload;
    }
  } catch (webErr) {
    console.warn('[MediaEngine] searchTopicImages fallback failed:', webErr);
  }

  return {
    success: false,
    imageUrl: '',
    prompt: cleanPrompt,
    aspectRatio,
    engine: 'No visual asset found',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Base64 Fetch Helper (for local GGUF vision models)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const result = await invoke<{ base64: string; mime_type: string }>('fetch_image_base64', {
      url: imageUrl,
    });
    if (result?.base64) {
      return { data: result.base64, mimeType: result.mime_type };
    }
  } catch {
    // Fall through
  }

  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 6000);
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
