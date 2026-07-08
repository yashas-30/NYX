/**
 * @file features/voice/tts.ts
 * @description Text-to-speech player with two backends:
 *   1. Server TTS (OpenAI API) — high quality, requires OPENAI_API_KEY on server
 *   2. Browser SpeechSynthesis API — zero-dependency fallback, always available
 *
 * Usage:
 *   import { tts } from '@src/features/voice/tts';
 *   tts.speak('Hello world');
 *   tts.stop();
 *   tts.isSpeaking(); // boolean
 */

class TTSPlayer {
  private currentAudio: HTMLAudioElement | null = null;
  private synthUtterance: SpeechSynthesisUtterance | null = null;
  private _isSpeaking = false;

  /** Speak text using the best available backend */
  async speak(text: string, voice?: string): Promise<void> {
    this.stop();

    // Try server TTS first (OpenAI quality)
    const serverSuccess = await this.tryServerTTS(text, voice);
    if (!serverSuccess) {
      // Fall back to browser SpeechSynthesis
      this.browserSpeak(text);
    }
  }

  /** Stop any ongoing speech */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    if (window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
    }
    this.synthUtterance = null;
    this._isSpeaking = false;
  }

  /** True while speaking */
  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  // ── Private methods ─────────────────────────────────────────────────────────

  private async tryServerTTS(text: string, voice = 'alloy'): Promise<boolean> {
    // Server TTS requires Fastify backend, which is removed in Tauri migration.
    // We immediately fall back to browser synthesis.
    return false;
  }

  private browserSpeak(text: string): void {
    if (!window.speechSynthesis) return;

    // Strip markdown for cleaner audio
    const clean = text
      .replace(/```[\s\S]*?```/g, 'code block')
      .replace(/`[^`]+`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean.slice(0, 5000));
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => { this._isSpeaking = true; };
    utterance.onend = () => {
      this._isSpeaking = false;
      this.synthUtterance = null;
    };
    utterance.onerror = () => {
      this._isSpeaking = false;
      this.synthUtterance = null;
    };

    this.synthUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }
}

// Singleton
export const tts = new TTSPlayer();
