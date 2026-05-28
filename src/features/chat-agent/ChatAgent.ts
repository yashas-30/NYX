import { AIService } from '@src/features/coder/services/ai.service';
import { ChatMessage, AISettings } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { buildChatSystemPrompt, buildChatUserPrompt } from './promptBuilders';

export interface ChatAgentConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  settings: AISettings;
  history: ChatMessage[];
  lightningDirectives?: string[];
}

export class ChatAgent {
  private config: ChatAgentConfig;
  
  constructor(config: ChatAgentConfig) {
    this.config = config;
  }
  
  async *streamResponse(
    prompt: string, 
    analysis: PromptAnalysis,
    signal: AbortSignal,
    webSearchResults?: string
  ): AsyncGenerator<{ type: 'text' | 'thinking' | 'tool_call'; content: string; metadata?: any }> {
    
    // Detect language and tone
    const detectedLang = this.detectLanguage(prompt);
    const tone = this.inferTone(prompt, analysis);

    // Build optimized prompts
    let systemPrompt = buildChatSystemPrompt(this.config.modelId, {
      conversationTone: tone,
      detectedLanguage: detectedLang,
      previousMessages: this.config.history.length,
      lightningDirectives: this.config.lightningDirectives,
    });

    const contextWindow = buildChatUserPrompt(prompt, {
      conversationTone: tone,
      detectedLanguage: detectedLang,
      previousMessages: this.config.history.length,
    }, webSearchResults);
    
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

    yield { type: 'thinking', content: 'Thinking...' };

    const runPromise = AIService.execute(
      this.config.modelId,
      this.config.provider,
      contextWindow,
      this.config.apiKey,
      systemPrompt,
      { ...this.config.settings, temperature: 0.7 }, // Higher temp for creativity
      onStreamCallback,
      signal,
      { history: this.config.history.slice(-20), agentMode: 'chat' } // Chat keeps more history
    ).then((result) => {
      finished = true;
      if (resolveStream) resolveStream();
      return result;
    }).catch((err) => {
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
        chunks.length = 0; // Clear the queue since we yielded the latest accumulated text
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

  private inferTone(prompt: string, analysis: PromptAnalysis): 'casual' | 'professional' | 'technical' {
    const lower = prompt.toLowerCase();

    if (analysis.detectedLanguages.length > 0 || 
        (lower.includes('explain') && lower.includes('how does'))) {
      return 'technical';
    }

    if (lower.includes('hey') || lower.includes('hi') || lower.includes('thanks') ||
        analysis.intent === 'greeting') {
      return 'casual';
    }

    return 'professional';
  }
}
