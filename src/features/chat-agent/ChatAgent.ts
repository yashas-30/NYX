import { AIService } from '@src/core/services/ai.service';
import { ChatMessage, AISettings } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { buildChatSystemPrompt, buildChatUserPrompt } from './promptBuilders';
import { searchWeb } from '@src/features/coder/api/coderApi';

export interface ChatAgentConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  settings: AISettings;
  history: ChatMessage[];
  lightningDirectives?: string[];
  webSearchEnabled?: boolean;
}

export class ChatAgent {
  private config: ChatAgentConfig;

  constructor(config: ChatAgentConfig) {
    this.config = config;
  }

  /**
   * BAD-7: Intent detection for web search
   */
  shouldSearchWeb(prompt: string, analysis: PromptAnalysis): boolean {
    if (!this.config.webSearchEnabled) return false;

    // Explicit signal in classifier analysis
    if (analysis.intent === 'web_search') return true;

    // Local pattern fallback
    const lower = prompt.toLowerCase();
    const webKeywords = [
      'search the web',
      'lookup',
      'google',
      'search web',
      'current news',
      'latest release',
      'weather today',
      'what is the current',
      'who is currently',
      'latest version of',
      'recent events',
    ];
    return webKeywords.some((keyword) => lower.includes(keyword));
  }

  /**
   * BAD-7: Web search with fallbacks managed by backend service
   */
  async searchWeb(query: string, signal?: AbortSignal): Promise<any> {
    try {
      const data = await searchWeb(query, signal);
      if (data && data.success && Array.isArray(data.results)) {
        return data.results;
      }
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[ChatAgent] Web search failed, returning empty:', err);
      return [];
    }
  }

  /**
   * BAD-7: Gather search context for web search intent
   */
  async gatherContext(prompt: string, signal?: AbortSignal): Promise<string> {
    const rawResults = await this.searchWeb(prompt, signal);
    return this.formatSearchResults(rawResults);
  }

  /**
   * BAD-7: Deduplicate, format, and truncate search results for model context
   */
  formatSearchResults(results: any[]): string {
    if (!Array.isArray(results) || results.length === 0) return '';

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const uniqueResults = results.filter((r) => {
      if (!r.link) return true;
      if (seenUrls.has(r.link)) return false;
      seenUrls.add(r.link);
      return true;
    });

    // Format results to markdown block
    const formatted = uniqueResults
      .slice(0, 5) // Cap at top 5 unique results
      .map((r, i) => `[Result ${i + 1}] Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`)
      .join('\n\n');

    // Safe truncation to context limits
    if (formatted.length > 8000) {
      return formatted.substring(0, 8000) + '\n\n[... truncated for context limit ...]';
    }
    return formatted;
  }

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    prefetchedWebSearchResults?: string,
    images?: { name: string; mimeType: string; data: string }[]
  ): AsyncGenerator<{ type: 'text' | 'thinking' | 'tool_call'; content: string; metadata?: any }> {
    // Detect language and tone
    const detectedLang = this.detectLanguage(prompt);
    const tone = this.inferTone(prompt, analysis);

    let webSearchResults = prefetchedWebSearchResults || '';

    // BAD-7: WebEnabledAgent search trigger inside pipeline stream
    if (!webSearchResults && this.shouldSearchWeb(prompt, analysis)) {
      yield { type: 'thinking', content: 'Searching the web for current information...' };
      const rawResults = await this.searchWeb(prompt, signal);
      webSearchResults = this.formatSearchResults(rawResults);
    }

    // Build optimized prompts
    const systemPrompt = buildChatSystemPrompt(this.config.modelId, {
      conversationTone: tone,
      detectedLanguage: detectedLang,
      previousMessages: this.config.history.length,
      lightningDirectives: this.config.lightningDirectives,
    });

    const contextWindow = buildChatUserPrompt(
      prompt,
      {
        conversationTone: tone,
        detectedLanguage: detectedLang,
        previousMessages: this.config.history.length,
      },
      webSearchResults
    );

    const chunks: string[] = [];
    let resolveStream: (() => void) | null = null;
    let finished = false;
    let streamError: any = null;

    const onStreamCallback = (accumulatedText: string) => {
      chunks.push(accumulatedText);
      if (resolveStream) {
        resolveStream();
      }
    };

    yield { type: 'thinking', content: 'Generating response...' };

    const runPromise = AIService.execute(
      this.config.modelId,
      this.config.provider,
      contextWindow,
      this.config.apiKey,
      systemPrompt,
      { ...this.config.settings, temperature: 0.7 }, // Higher temp for creativity
      onStreamCallback,
      signal,
      {
        history: this.config.history.slice(-20),
        agentMode: 'chat',
        webSearch: this.config.webSearchEnabled,
        images,
      } // Chat keeps more history
    )
      .then((result) => {
        finished = true;
        if (resolveStream) resolveStream();
        return result;
      })
      .catch((err) => {
        streamError = err;
        finished = true;
        if (resolveStream) resolveStream();
      });

    while (!finished || chunks.length > 0) {
      if (chunks.length === 0) {
        await new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
        resolveStream = null;
      }
      if (streamError) {
        throw streamError;
      }
      if (chunks.length > 0) {
        const content = chunks[chunks.length - 1];
        chunks.length = 0; // Clear the queue since we yielded the latest text
        yield { type: 'text', content };
      }
    }

    const finalResult = await runPromise;
    if (finalResult) {
      yield { type: 'text', content: finalResult.text, metadata: finalResult.metrics };
    }
  }

  private detectLanguage(prompt: string): string {
    const lower = prompt.toLowerCase();
    if (/\b(spanish|español|hola|gracias)\b/i.test(lower)) return 'spanish';
    if (/\b(french|français|bonjour|merci)\b/i.test(lower)) return 'french';
    if (/\b(german|deutsch|hallo|danke)\b/i.test(lower)) return 'german';
    if (/\b(chinese|中文|你好|谢谢)\b/i.test(lower)) return 'chinese';
    if (/\b(japanese|日本語|こんにちは|ありがとう)\b/i.test(lower)) return 'japanese';
    return 'english';
  }

  private inferTone(
    prompt: string,
    analysis: PromptAnalysis
  ): 'casual' | 'professional' | 'technical' {
    const lower = prompt.toLowerCase();

    if (
      analysis.detectedLanguages.length > 0 ||
      (lower.includes('explain') && lower.includes('how does'))
    ) {
      return 'technical';
    }

    if (
      lower.includes('hey') ||
      lower.includes('hi') ||
      lower.includes('thanks') ||
      analysis.intent === 'greeting'
    ) {
      return 'casual';
    }

    return 'professional';
  }
}
