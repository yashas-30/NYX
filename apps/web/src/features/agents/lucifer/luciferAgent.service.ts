import { invoke } from '@tauri-apps/api/core';
import { LuciferTurnAnalysis } from './useLuciferStore';
import { getLuciferPersona, LUCIFER_PERSONA } from '@src/core/agents/luciferPersona';
import { NYX_PERSONA } from '@src/core/agents/nyxPersona';

/**
 * Anchored greeting regex — mirrors the Rust GREETING_REGEX in lucifer.rs.
 * Evaluated ONLY against the current user message, never against history.
 */
const GREETING_RE = /^(hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day)|yo|sup|ping|test|howdy|what's\s+up|whats\s+up|hiya)(?:[\s!.,?]+(?:lucifer|nyx|there|bot|assistant))?[\s!.,?]*$/i;

/**
 * Explicit voice synthesis prefix — mirrors VOICE_INTENT_REGEX in lucifer.rs.
 * Only matches when user provides an explicit TTS command prefix.
 */
const VOICE_PREFIX_RE = /^(?:say\s+this:|say:|speak:|read\s+aloud:|synthesize\s+(?:voice|audio|speech):|generate\s+audio\s+for:|text-to-speech:|tts:)\s*|\b(?:say\s+out\s+loud|read\s+(?:this|that|it)\s+(?:aloud|out\s+loud)|synthesize\s+(?:voice|audio|speech)\s+for|convert\s+to\s+speech|speak\s+this\s+text)\b/i;

/**
 * Explicit image generation intent prefix.
 */
const IMAGE_PREFIX_RE = /^(?:\/image|\/img|image:|draw:|generate\s+image:)\s*|\b(?:generate|create|draw|paint|render)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|banner|poster|logo|avatar)\b|\b(?:draw|paint|render)\s+me\b|\bgenerate\s+(?:a\s+)?picture\s+of\b/i;

/**
 * Explicit memory save/recall intent.
 */
const MEMORY_PREFIX_RE = /^(?:\/memory|\/remember|remember:|memory:)\s*|\b(?:remember\s+that|remember\s+this|save\s+(?:this\s+)?to\s+(?:your\s+)?memory|store\s+this\s+fact)\b|\b(?:what\s+do\s+you\s+remember\s+about|what\s+did\s+I\s+say\s+about|do\s+you\s+recall\s+(?:my|what|when)|search\s+(?:your\s+)?memory\s+for)\b/i;

/**
 * Focused web search intent — only explicit web/search commands and real-time data requests.
 * Does NOT match generic words like "find", "what is", "table", "result" etc.
 */
const SEARCH_PREFIX_RE = /^(?:\/search|\/web|search:|google:|lookup:|web:)\s*|\b(?:search\s+(?:the\s+)?web|search\s+online|google\s+for|search\s+for|look\s*up\s+online|browse\s+the\s+web)\b|\b(?:latest|current|today's|breaking|live|real-time)\s+(?:news|weather|score|scores|stock|stocks|price|prices|market|release|version|fixtures|standings)\b|\b(?:what\s+is\s+the\s+latest|what\s+happened\s+today|who\s+won\s+today|breaking\s+news|trending\s+now)\b/i;

function isGreetingText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 30 && GREETING_RE.test(trimmed);
}

export class LuciferAgentService {
  /**
   * Analyze prompt/messages and model configuration via Tauri command or local fallback.
   *
   * FIXED: Tool intent flags are evaluated on the CURRENT user message ONLY (messages.last()).
   * Historical messages are NOT concatenated for tool-trigger evaluation \u2014 they caused
   * stale intent leakage (e.g. "audio" from turn N-1 triggering TTS on "hi" in turn N).
   */
  async analyzeTurn(messages: any[] | string, provider: string): Promise<LuciferTurnAnalysis> {
    const formattedMessages = typeof messages === 'string'
      ? [{ role: 'user', content: messages }]
      : messages;

    try {
      const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      if (isTauri) {
        return await invoke<LuciferTurnAnalysis>('analyze_lucifer_turn', { messages: formattedMessages, provider });
      }
    } catch (e) {
      console.warn('[LuciferAgentService] Fallback to client-side intent analysis:', e);
    }

    // Client-side fallback \u2014 evaluate ONLY the last (current) user message
    const lastMsg = formattedMessages[formattedMessages.length - 1];
    const lastUserText: string = lastMsg
      ? (typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content))
      : '';

    const is_local = provider === 'nyx-native' || provider === 'ollama' || provider === 'vllm' || provider === 'lmstudio' || provider.includes('local');

    // --- GREETING SHORT-CIRCUIT ---
    if (isGreetingText(lastUserText)) {
      return {
        intent: 'conversational',
        requires_search: false,
        requires_memory: false,
        requires_image_gen: false,
        requires_voice: false,
        is_local_model: is_local,
        confidence: 1.0,
      };
    }

    // Evaluate tool triggers on current message ONLY
    const requires_voice = VOICE_PREFIX_RE.test(lastUserText);
    const requires_image_gen = IMAGE_PREFIX_RE.test(lastUserText);
    const requires_memory = MEMORY_PREFIX_RE.test(lastUserText);
    const requires_search = SEARCH_PREFIX_RE.test(lastUserText);

    return {
      intent: requires_image_gen ? 'image_generation'
        : requires_voice ? 'voice_synthesis'
        : requires_search ? 'web_search'
        : requires_memory ? 'memory_rag'
        : 'conversational',
      requires_search,
      requires_memory,
      requires_image_gen,
      requires_voice,
      is_local_model: is_local,
      confidence: 0.95,
    };
  }

  /**
   * Enrich system instructions with a model-aware Lucifer persona.
   *
   * FIXED: Now accepts modelId and provider to inject the active model name
   * and capability context into the system instruction, so Lucifer knows
   * what backend it's running on and can explain limitations accurately.
   */
  enrichSystemPrompt(
    existingPrompt?: string,
    analysis?: LuciferTurnAnalysis,
    modelId?: string,
    provider?: string
  ): string {
    const persona = getLuciferPersona({
      modelId,
      provider,
      isLocalModel: analysis?.is_local_model,
    });

    if (!existingPrompt) {
      return persona;
    }

    // Replace static NYX_PERSONA or default LUCIFER_PERSONA with model-aware persona
    let cleanedPrompt = existingPrompt.replace(NYX_PERSONA, persona);
    if (!cleanedPrompt.includes('You are Lucifer')) {
      cleanedPrompt = `${persona}\n\n${cleanedPrompt}`;
    } else if (!cleanedPrompt.includes('CURRENT ENGINE CONTEXT') && modelId) {
      // Already has Lucifer persona but missing model context \u2014 append it
      cleanedPrompt = `${cleanedPrompt}\n\nCURRENT ENGINE CONTEXT:\n- Active Backend Model: ${modelId}\n- Provider: ${provider || 'unknown'}`;
    }

    return cleanedPrompt;
  }
}

export const luciferAgentService = new LuciferAgentService();
