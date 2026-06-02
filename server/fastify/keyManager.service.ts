import logger from '../lib/logger.ts';

interface KeyState {
  key: string;
  isRateLimited: boolean;
  rateLimitResetAt?: number;
}

export class KeyManagerService {
  private providerKeys: Map<string, KeyState[]> = new Map();
  private providerIndices: Map<string, number> = new Map();

  /**
   * Initializes keys from environment variables for load balancing.
   */
  initializeFromEnv() {
    // Example: GEMINI_API_KEYS="key1,key2,key3"
    const providers = ['gemini', 'openai', 'anthropic', 'pollinations'];

    for (const provider of providers) {
      const envVar = `${provider.toUpperCase()}_API_KEYS`;
      const keysStr = process.env[envVar] || process.env[`${provider.toUpperCase()}_API_KEY`];

      if (keysStr) {
        const keys = keysStr
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        this.setKeys(provider, keys);
        logger.info(`[KeyManager] Initialized ${keys.length} keys for ${provider}`);
      }
    }
  }

  setKeys(provider: string, keys: string[]) {
    const states: KeyState[] = keys.map((k) => ({ key: k, isRateLimited: false }));
    this.providerKeys.set(provider, states);
    this.providerIndices.set(provider, 0);
  }

  /**
   * Gets the next available key for a provider via round-robin.
   */
  getNextKey(provider: string): string {
    const keys = this.providerKeys.get(provider);
    if (!keys || keys.length === 0) {
      throw new Error(`No API keys configured for provider: ${provider}`);
    }

    const now = Date.now();
    let currentIndex = this.providerIndices.get(provider) || 0;

    // Find the next available (non-rate-limited) key
    for (let i = 0; i < keys.length; i++) {
      const idx = (currentIndex + i) % keys.length;
      const keyState = keys[idx];

      if (keyState.isRateLimited) {
        if (keyState.rateLimitResetAt && now > keyState.rateLimitResetAt) {
          // Rate limit expired
          keyState.isRateLimited = false;
          keyState.rateLimitResetAt = undefined;
        } else {
          continue; // Still rate limited
        }
      }

      // Update index for next request (round-robin)
      this.providerIndices.set(provider, (idx + 1) % keys.length);
      return keyState.key;
    }

    // If all keys are rate limited, fallback to the first key anyway
    // The request queue logic will handle retries
    this.providerIndices.set(provider, (currentIndex + 1) % keys.length);
    return keys[currentIndex].key;
  }

  /**
   * Marks a key as rate limited for a specific duration.
   */
  markRateLimited(provider: string, key: string, retryAfterSeconds: number = 60) {
    const keys = this.providerKeys.get(provider);
    if (!keys) return;

    const keyState = keys.find((k) => k.key === key);
    if (keyState) {
      keyState.isRateLimited = true;
      keyState.rateLimitResetAt = Date.now() + retryAfterSeconds * 1000;
      logger.warn(
        `[KeyManager] API Key for ${provider} rate limited. Backoff: ${retryAfterSeconds}s`
      );
    }
  }
}

export const keyManager = new KeyManagerService();
