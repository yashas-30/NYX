import { AIService } from '@src/core/services/ai.service';
import { ChatMessage, AISettings } from '@src/infrastructure/types';
import { PromptAnalysis, ConversationState } from '@src/core/services/promptClassifier';
import { buildChatSystemPrompt, buildChatUserPrompt } from '../prompts/chatPrompts';
import { searchWeb } from '@src/infrastructure/api/coderApi';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageAttachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface Artifact {
  id: string;
  type: 'code' | 'markdown' | 'json' | 'diff' | 'html' | 'svg';
  title: string;
  content: string;
  language?: string;
}

export interface Citation {
  id: string;
  source: string;
  quote: string;
  url?: string;
}

export interface ThinkingStep {
  id: string;
  step: number;
  content: string;
  timestamp: number;
}

export interface StreamMetrics {
  tokensPerSecond: number;
  totalTokens: number;
  latencyMs: number;
  modelName: string;
}

export interface StreamEvent {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'artifact' | 'citation' | 'metrics' | 'error' | 'done';
  content?: string;
  metadata?: any;
}

export interface ChatAgentConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  settings: AISettings;
  history: ChatMessage[];
  lightningDirectives?: string[];
  webSearchEnabled?: boolean;
  maxSearchResults?: number;
  maxContextLength?: number;
  conversationState?: ConversationState;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class ChatAgent {
  private config: ChatAgentConfig;
  private abortController: AbortController | null = null;

  constructor(config: ChatAgentConfig) {
    this.config = {
      maxSearchResults: 5,
      maxContextLength: 8000,
      ...config,
    };
  }

  // ── Abort Control ─────────────────────────────────────────────────────────

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  // ── Web Search ────────────────────────────────────────────────────────────

  shouldSearchWeb(prompt: string, analysis: PromptAnalysis): boolean {
    if (analysis.intent === 'web_search') return true;

    const lower = prompt.toLowerCase();
    
    // Traffic Controller & Token Optimizer Rules (Local Regex triggers)
    // 1. Temporal Gaps & News
    const temporalKeywords = ['current news', 'latest release', 'breaking news', 'recent events', 'today', 'now', 'recently', 'newest', 'latest', 'current'];
    const infoKeywords = ['price', 'weather', 'status', 'news', 'release', 'update', 'version', 'score', 'match', 'event'];
    
    // Check for explicit temporal/live requests
    if (lower.includes('live') || lower.includes('real-time') || lower.includes('realtime')) return true;
    
    // Check for status requests
    if (lower.includes('is currently') || lower.includes('what is the current') || lower.includes('who is currently')) return true;

    // Check combinations that strongly imply real-time or recent need
    const hasTemporal = temporalKeywords.some(k => lower.includes(k)) || /(2025|2026|2027)/.test(lower);
    const hasInfo = infoKeywords.some(k => lower.includes(k));

    if (hasTemporal && hasInfo) {
      return true;
    }

    // Default to false (save tokens, do not search for every prompt)
    return false;
  }

  async searchWeb(query: string, signal: AbortSignal): Promise<any[]> {
    // Retry with exponential backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await searchWeb(query, signal);
        if (data?.success && Array.isArray(data.results)) return data.results;
        if (Array.isArray(data)) return data;
        return [];
      } catch (err) {
        if (signal.aborted) throw err;
        if (attempt === 2) {
          console.warn('[ChatAgent] Web search failed after 3 attempts:', err);
          return [];
        }
        await delay(1000 * Math.pow(2, attempt));
      }
    }
    return [];
  }

  async gatherContext(prompt: string, signal: AbortSignal): Promise<string> {
    const results = await this.searchWeb(prompt, signal);
    return this.formatSearchResults(results);
  }

  formatSearchResults(results: any[]): string {
    if (!Array.isArray(results) || results.length === 0) return '';

    const seenUrls = new Set<string>();
    const unique = results.filter((r) => {
      if (!r.link) return true;
      if (seenUrls.has(r.link)) return false;
      seenUrls.add(r.link);
      return true;
    });

    const formatted = unique
      .slice(0, this.config.maxSearchResults)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.link}\n${r.snippet}`)
      .join('\n\n');

    const limit = this.config.maxContextLength!;
    return formatted.length > limit
      ? formatted.substring(0, limit) + '\n\n[... truncated]'
      : formatted;
  }

  // ── Core Streaming ────────────────────────────────────────────────────────

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    prefetchedWebSearchResults?: string,
    images?: ImageAttachment[]
  ): AsyncGenerator<StreamEvent> {
    this.abortController = new AbortController();
    const combinedSignal = this.combineSignals(signal, this.abortController.signal);

    const detectedLang = this.detectLanguage(prompt);
    const tone = this.inferTone(prompt, analysis);
    let webSearchResults = prefetchedWebSearchResults || '';

    // Phase 1: Web Search
    if (!webSearchResults && this.shouldSearchWeb(prompt, analysis)) {
      yield { type: 'thinking', content: '🔍 Searching the web for current information...' };
      try {
        const rawResults = await this.searchWeb(prompt, combinedSignal);
        webSearchResults = this.formatSearchResults(rawResults);
        yield { type: 'thinking', content: `✓ Found ${rawResults.length} results` };
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          yield { type: 'thinking', content: '⚠ Web search unavailable, using local knowledge...' };
        }
      }
    }

    // Phase 2: Build Prompts
    const systemPrompt = buildChatSystemPrompt(this.config.modelId, {
      conversationTone: tone,
      detectedLanguage: detectedLang,
      previousMessages: this.config.history.length,
      lightningDirectives: this.config.lightningDirectives,
    });

    const userPrompt = buildChatUserPrompt(
      prompt,
      {
        conversationTone: tone,
        detectedLanguage: detectedLang,
        previousMessages: this.config.history.length,
      },
      webSearchResults
    );

    yield { type: 'thinking', content: '💭 Generating response...' };

    // Phase 3: Stream from AIService
    const startTime = Date.now();
    let totalTokens = 0;
    let lastChunkTime = Date.now();
    let accumulatedText = '';

    // Use a queue for thread-safe chunk handling
    const chunkQueue: string[] = [];
    let resolveChunk: (() => void) | null = null;
    let streamDone = false;
    let streamError: Error | null = null;

    const onChunk = (text: string) => {
      // AIService gives accumulated text — we need to compute delta
      const delta = text.slice(accumulatedText.length);
      accumulatedText = text;
      totalTokens += 1;

      chunkQueue.push(delta);
      if (resolveChunk) {
        resolveChunk();
        resolveChunk = null;
      }
    };

    // Start the AI call
    const aiPromise = AIService.execute(
      this.config.modelId,
      this.config.provider,
      userPrompt,
      this.config.apiKey,
      systemPrompt,
      { ...this.config.settings },
      onChunk,
      combinedSignal,
      {
        history: this.config.history.slice(-20),
        agentMode: 'chat',
        webSearch: this.config.webSearchEnabled,
        images,
      }
    ).then((result) => {
      streamDone = true;
      if (resolveChunk) resolveChunk();
      return result;
    }).catch((err) => {
      streamError = err;
      streamDone = true;
      if (resolveChunk) resolveChunk();
      throw err;
    });

    // Consume chunks as they arrive
    while (!streamDone || chunkQueue.length > 0) {
      if (chunkQueue.length === 0) {
        await new Promise<void>((resolve) => { resolveChunk = resolve; });
      }

      if (streamError) throw streamError;

      while (chunkQueue.length > 0) {
        const delta = chunkQueue.shift()!;
        if (delta) {
          yield { type: 'text', content: delta };
        }
      }
    }

    // Phase 4: Finalize
    const result = await aiPromise;
    const latency = Date.now() - startTime;

    // Extract artifacts from final text
    const artifacts = this.extractArtifacts(accumulatedText);
    for (const artifact of artifacts) {
      yield { type: 'artifact', metadata: artifact };
    }

    // Extract citations if web search was used
    if (webSearchResults) {
      const citations = this.extractCitations(webSearchResults);
      for (const citation of citations) {
        yield { type: 'citation', metadata: citation };
      }
    }

    yield {
      type: 'metrics',
      metadata: {
        tokensPerSecond: totalTokens / (latency / 1000),
        totalTokens,
        latencyMs: latency,
        modelName: this.config.modelId,
      } as StreamMetrics,
    };

    yield { type: 'done' };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private combineSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        return controller.signal;
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  }

  private extractArtifacts(text: string): Artifact[] {
    const artifacts: Artifact[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    let index = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const lang = match[1] || 'text';
      const content = match[2].trim();
      if (content.length > 100) { // Only significant blocks
        artifacts.push({
          id: `art-${Date.now()}-${index++}`,
          type: 'code',
          title: `snippet.${lang}`,
          content,
          language: lang,
        });
      }
    }

    return artifacts;
  }

  private extractCitations(searchResults: string): Citation[] {
    const citations: Citation[] = [];
    const lines = searchResults.split('\n');
    let currentId = '';
    let currentTitle = '';
    let currentUrl = '';

    for (const line of lines) {
      const numMatch = line.match(/^\[(\d+)\]\s*(.+)/);
      if (numMatch) {
        if (currentId) {
          citations.push({
            id: currentId,
            source: currentTitle,
            quote: '',
            url: currentUrl,
          });
        }
        currentId = numMatch[1];
        currentTitle = numMatch[2];
        currentUrl = '';
      }
      const urlMatch = line.match(/^URL:\s*(.+)/);
      if (urlMatch) currentUrl = urlMatch[1];
    }

    if (currentId) {
      citations.push({ id: currentId, source: currentTitle, quote: '', url: currentUrl });
    }

    return citations;
  }

  private detectLanguage(prompt: string): string {
    const patterns: [RegExp, string][] = [
      [/\b(español|hola|gracias|qué|cómo)\b/i, 'spanish'],
      [/\b(français|bonjour|merci|comment|quoi)\b/i, 'french'],
      [/\b(deutsch|hallo|danke|wie|was)\b/i, 'german'],
      [/\b(中文|你好|谢谢|什么|怎么)\b/u, 'chinese'],
      [/\b(日本語|こんにちは|ありがとう|何|どう)\b/u, 'japanese'],
    ];
    for (const [pattern, lang] of patterns) {
      if (pattern.test(prompt)) return lang;
    }
    return 'english';
  }

  private inferTone(prompt: string, analysis: PromptAnalysis): 'casual' | 'professional' | 'technical' {
    const lower = prompt.toLowerCase();
    if (lower.includes('explain') && lower.includes('how does')) return 'technical';
    if (['hey', 'hi', 'thanks', 'lol'].some((w) => lower.includes(w))) return 'casual';
    return 'professional';
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));