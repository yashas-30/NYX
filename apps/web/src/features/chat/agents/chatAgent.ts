import { AIService, countTokens } from '@src/infrastructure/api/ai.service';
import {
  ChatMessage,
  AISettings,
  ImageAttachment,
  Artifact,
  Citation,
  ThinkingStep,
  StreamMetrics,
  StreamEvent,
  ToolCall,
  TelemetryMetrics,
} from '@src/infrastructure/types';
import { PromptAnalysis, ConversationState } from '@src/infrastructure/utils/promptClassifier';
import { buildChatSystemPrompt, buildChatUserPrompt } from '../prompts/chatPrompts';
import { searchWeb } from '@src/infrastructure/api/searchApi';
import { BaseAgent, BaseAgentConfig, HISTORY_SLICE_SIZE } from '../../shared/agents/baseAgent';
import { encoding_for_model } from 'tiktoken';

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatAgentConfig extends BaseAgentConfig {
  maxSearchResults?: number;
  maxContextLength?: number;
  conversationState?: ConversationState;
  updateHistory?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

class ContextWindowManager {
  private encoder: any;
  private maxTokens: number;

  constructor(modelId: string, maxTokens: number = 128000) {
    this.maxTokens = maxTokens;
    const encodingMap: Record<string, string> = {
      'gemini': 'cl100k_base',
      'claude': 'cl100k_base',
      'gpt': 'cl100k_base',
    };
    const encodingName = encodingMap[modelId.split('-')[0]] || 'cl100k_base';
    this.encoder = encoding_for_model(encodingName as any);
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  buildContext(messages: ChatMessage[], systemPrompt: string, maxOutputTokens: number = 4096): {
    messages: ChatMessage[];
    summary?: string;
    totalTokens: number;
  } {
    const systemTokens = this.countTokens(systemPrompt);
    const availableTokens = this.maxTokens - systemTokens - maxOutputTokens - 1000; // Safety margin

    let currentTokens = 0;
    const included: ChatMessage[] = [];

    // Work backwards from most recent
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.countTokens(msg.content) + (msg.images?.length || 0) * 512;

      if (currentTokens + msgTokens > availableTokens) {
        // Summarize older messages
        const olderMessages = messages.slice(0, i + 1);
        const summary = this.summarizeMessages(olderMessages);
        const summaryTokens = this.countTokens(summary);

        return {
          messages: [
            { role: 'system', content: `Previous conversation summary: ${summary}`, timestamp: Date.now() },
            ...included.reverse()
          ],
          summary,
          totalTokens: currentTokens + summaryTokens + systemTokens
        };
      }

      currentTokens += msgTokens;
      included.push(msg);
    }

    return {
      messages: included.reverse(),
      totalTokens: currentTokens + systemTokens
    };
  }

  private summarizeMessages(messages: ChatMessage[]): string {
    const topics = this.extractTopics(messages);
    const decisions = this.extractDecisions(messages);
    return `Topics: ${topics.join(', ')}. Key decisions: ${decisions.join('; ')}. Total messages: ${messages.length}.`;
  }

  private extractTopics(messages: ChatMessage[]): string[] {
    const allText = messages.map(m => m.content).join(' ');
    const keywords = ['function', 'class', 'API', 'database', 'frontend', 'backend', 'bug', 'feature'];
    return keywords.filter(k => allText.toLowerCase().includes(k));
  }

  private extractDecisions(messages: ChatMessage[]): string[] {
    const allText = messages.map(m => m.content).join(' ');
    const patterns = [/decided to ([^.]+)/gi, /will use ([^.]+)/gi, /chose ([^.]+)/gi];
    const decisions: string[] = [];
    for (const pattern of patterns) {
      const matches = allText.matchAll(pattern);
      for (const match of matches) decisions.push(match[1].trim());
    }
    return decisions.slice(0, 5);
  }
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class ChatAgent extends BaseAgent<ChatAgentConfig, StreamEvent> {
  constructor(config: ChatAgentConfig) {
    super({
      maxSearchResults: 5,
      maxContextLength: 8000,
      ...config,
    });
  }

  // ── Web Search ────────────────────────────────────────────────────────────

  shouldSearchWeb(prompt: string, analysis: PromptAnalysis): boolean {
    if (analysis.intent === 'web_search') return true;

    const lower = prompt.toLowerCase();

    // Traffic Controller & Token Optimizer Rules (Local Regex triggers)
    // 1. Temporal Gaps & News
    const temporalKeywords = [
      'current news',
      'latest release',
      'breaking news',
      'recent events',
      'today',
      'now',
      'recently',
      'newest',
      'latest',
      'current',
    ];
    const infoKeywords = [
      'price',
      'weather',
      'status',
      'news',
      'release',
      'update',
      'version',
      'score',
      'match',
      'event',
    ];

    // Check for explicit temporal/live requests
    if (lower.includes('live') || lower.includes('real-time') || lower.includes('realtime'))
      return true;

    // Check for status requests
    if (
      lower.includes('is currently') ||
      lower.includes('what is the current') ||
      lower.includes('who is currently')
    )
      return true;

    // Check combinations that strongly imply real-time or recent need
    const hasTemporal =
      temporalKeywords.some((k) => lower.includes(k)) || /(2025|2026|2027)/.test(lower);
    const hasInfo = infoKeywords.some((k) => lower.includes(k));

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
      } catch (err: any) {
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

  async gatherContext(prompt: string, signal: AbortSignal): Promise<any[]> {
    return this.searchWeb(prompt, signal);
  }

  formatSearchResults(results: any[]): string {
    if (!Array.isArray(results) || results.length === 0) return '';

    const seenUrls = new Set<string>();
    const unique = results.filter((r) => {
      const u = r.link || r.url;
      if (!u) return true;
      if (seenUrls.has(u)) return false;
      seenUrls.add(u);
      return true;
    });

    // Sort by relevance and recency
    const sorted = unique
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, this.config.maxSearchResults);

    const formatted = sorted
      .map((r, i) => {
        const u = r.link || r.url;
        const date = r.date ? ` [${r.date}]` : '';
        let block = `[${i + 1}] ${r.title}${date}\nURL: ${u}\n${r.snippet}`;
        if (r.content) block += `\nFull Content Extracted:\n${r.content}`;
        return block;
      })
      .join('\n\n---\n\n');

    const limit = this.config.maxContextLength!;
    const truncated =
      formatted.length > limit ? formatted.substring(0, limit) + '\n\n[... truncated]' : formatted;

    return `\n\n[WEB SEARCH RESULTS - ${sorted.length} sources]\n${truncated}\n[END WEB SEARCH]\n\n[CRITICAL INSTRUCTION: You MUST cite your sources using inline citations like [1], [2] when referencing the web search results above. Ensure the citation number matches the Source number.]\n`;
  }

  async verifySources(results: any[]): Promise<any[]> {
    // Check if URLs are accessible (HEAD request)
    const verified = await Promise.all(
      results.map(async (r) => {
        try {
          const u = r.link || r.url;
          if (!u) return { ...r, accessible: true };
          const res = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          return { ...r, accessible: res.ok };
        } catch {
          return { ...r, accessible: false };
        }
      })
    );
    return verified.filter(r => r.accessible);
  }

  // ── Core Streaming ────────────────────────────────────────────────────────

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    prefetchedWebSearchResults?: any[],
    images?: ImageAttachment[]
  ): AsyncGenerator<StreamEvent> {
    this.abortController = new AbortController();
    const combinedSignal = this.combineSignals(signal, this.abortController.signal);

    const detectedLang = this.detectLanguage(prompt);
    const tone = this.inferTone(prompt, analysis);

    let rawResults = prefetchedWebSearchResults || [];
    let webSearchResults = '';

    // Phase 1: Web Search
    if (rawResults.length === 0 && this.shouldSearchWeb(prompt, analysis)) {
      yield { type: 'thinking', content: '🔍 Searching the web for current information...' };
      try {
        rawResults = await this.searchWeb(prompt, combinedSignal);
        yield { type: 'thinking', content: `✓ Found ${rawResults.length} results` };
      } catch (err: any) {
        if ((err as Error).name !== 'AbortError') {
          yield { type: 'thinking', content: '⚠ Web search unavailable, using local knowledge...' };
        }
      }
    }

    if (rawResults.length > 0) {
      webSearchResults = this.formatSearchResults(rawResults);
      // Yield citations so the UI can populate source cards
      for (let i = 0; i < rawResults.length && i < (this.config.maxSearchResults || 5); i++) {
        const r = rawResults[i];
        yield {
          type: 'citation',
          // fallow-ignore-next-line code-duplication
          metadata: {
            id: String(i + 1),
            url: r.url || r.link,
            title: r.title,
            snippet: r.snippet,
            source: r.source || new URL(r.url || r.link || 'https://unknown').hostname,
          },
        };
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

    const windowManager = new ContextWindowManager(this.config.modelId, this.config.maxContextLength || 128000);
    const context = windowManager.buildContext(this.config.history, systemPrompt);
    const optimizedHistory = context.messages;

    yield { type: 'thinking', content: '💭 Generating response...' };

    // Phase 3: Stream from AIService
    const startTime = Date.now();
    let totalTokens = 0;
    let lastChunkTime = Date.now();
    let accumulatedText = '';

    // Use a queue for thread-safe chunk handling
    const eventQueue: StreamEvent[] = [];
    let resolveChunk: (() => void) | null = null;
    let streamDone = false;
    let streamError: Error | null = null;

    const onStreamEvent = (event: any) => {
      if (typeof event === 'string') return; // Fallback
      if (event.type === 'text' && event.content) {
        totalTokens += countTokens(event.content);
        accumulatedText += event.content;
        eventQueue.push({ type: 'text', content: event.content });
      } else if (event.type === 'reasoning' && event.content) {
        eventQueue.push({ type: 'thinking', content: event.content });
      }

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
      onStreamEvent,
      combinedSignal,
      {
        history: optimizedHistory,
        agentMode: 'chat',
        webSearch: this.config.webSearchEnabled,
        images,
        streamEvents: true,
      }
    )
      .then((result) => {
        streamDone = true;
        if (resolveChunk) resolveChunk();
        return result;
      })
      .catch((err) => {
        streamError = err;
        streamDone = true;
        if (resolveChunk) resolveChunk();
        throw err;
      });

    // Stream processing with backpressure protection
    const MAX_QUEUE_SIZE = 100;
    let queueOverflow = false;

    // Consume chunks as they arrive
    while (!streamDone || eventQueue.length > 0) {
      if (signal.aborted) break;
      if (eventQueue.length === 0) {
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            resolve();
          };
          signal.addEventListener('abort', onAbort, { once: true });

          resolveChunk = () => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          };
        });
        resolveChunk = null;
      }

      if (signal.aborted) break;
      if (streamError) throw streamError;

      if (eventQueue.length > MAX_QUEUE_SIZE && !queueOverflow) {
        queueOverflow = true;
        yield {
          type: 'thinking',
          content: '⚠ Stream backpressure detected. Output generating faster than display.',
        };
      }

      // Drain chunks efficiently
      while (eventQueue.length > 0) {
        const ev = eventQueue.shift()!;
        yield ev;
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

    if (this.config.updateHistory) {
      this.config.updateHistory((prev) => [
        ...prev,
        { role: 'assistant', content: accumulatedText, timestamp: Date.now() },
      ]);
    }

    yield { type: 'done' };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private extractArtifacts(text: string): Artifact[] {
    const artifacts: Artifact[] = [];
    let index = 0;
    const generateId = () => `art-${Date.now()}-${index++}`;

    const getType = (lang: string): Artifact['type'] => {
      lang = lang.toLowerCase();
      if (['diff', 'patch'].includes(lang)) return 'diff';
      if (['json', 'json5'].includes(lang)) return 'json';
      if (['html', 'xml'].includes(lang)) return 'html';
      if (['svg'].includes(lang)) return 'svg';
      if (['md', 'markdown'].includes(lang)) return 'markdown';
      return 'code';
    };

    // 1. Code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      const lang = match[1] || 'text';
      const content = match[2].trim();
      if (content.length > 50) {
        artifacts.push({
          id: generateId(),
          type: getType(lang),
          title: `snippet.${lang}`,
          content,
          language: lang,
        });
      }
    }

    const textWithoutBlocks = text.replace(codeBlockRegex, '');

    // 2. Inline SVG
    const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
    let svgMatch;
    while ((svgMatch = svgRegex.exec(textWithoutBlocks)) !== null) {
      const content = svgMatch[0].trim();
      if (content.length > 50) {
        artifacts.push({ id: generateId(), type: 'svg', title: 'Inline SVG', content });
      }
    }

    // 3. Markdown Tables
    const tableRegex = /(?:^|\n)( *\|.*\|\s*\n *\|[\s\-:|]+\|\s*\n(?: *\|.*\|\s*(?:\n|$))+)/g;
    let tableMatch;
    while ((tableMatch = tableRegex.exec(textWithoutBlocks)) !== null) {
      const content = tableMatch[1].trim();
      if (content.length > 50) {
        artifacts.push({ id: generateId(), type: 'markdown', title: 'Markdown Table', content });
      }
    }

    // 4. Inline JSON (Schemas, objects, arrays)
    let depth = 0;
    let startIndex = -1;
    let inString = false;
    let escape = false;
    for (let i = 0; i < textWithoutBlocks.length; i++) {
      const char = textWithoutBlocks[i];
      if (inString) {
        if (escape) escape = false;
        else if (char === '\\') escape = true;
        else if (char === '"') inString = false;
      } else {
        // fallow-ignore-next-line code-duplication
        if (char === '"') inString = true;
        else if (char === '{' || char === '[') {
          if (depth === 0) startIndex = i;
          depth++;
        } else if (char === '}' || char === ']') {
          depth--;
          if (depth === 0 && startIndex !== -1) {
            const possibleJson = textWithoutBlocks.slice(startIndex, i + 1);
            if (possibleJson.length > 100) {
              try {
                const parsed = JSON.parse(possibleJson);
                if (parsed && typeof parsed === 'object') {
                  artifacts.push({
                    id: generateId(),
                    type: 'json',
                    title: 'Inline JSON',
                    content: possibleJson,
                    language: 'json',
                  });
                }
              } catch {}
            }
            startIndex = -1;
          } else if (depth < 0) depth = 0;
        }
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

  private inferTone(
    prompt: string,
    analysis: PromptAnalysis
  ): 'casual' | 'professional' | 'technical' {
    const lower = prompt.toLowerCase();

    // Technical indicators (highest priority)
    const technicalIndicators = [
      'explain',
      'how does',
      'how to',
      'what is',
      'difference between',
      'implement',
      'algorithm',
    ];
    const hasTechnical = technicalIndicators.some((w) => lower.includes(w));

    // Casual indicators
    const casualIndicators = ['hey', 'hi', 'lol', 'haha', 'thanks', 'btw'];
    const hasCasual = casualIndicators.some((w) => lower.includes(w));

    if (hasTechnical && !hasCasual) return 'technical';
    if (hasCasual && !hasTechnical) return 'casual';
    if (hasTechnical && hasCasual) return 'professional'; // Mixed
    return 'professional';
  }
}



