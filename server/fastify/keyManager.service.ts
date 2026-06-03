import logger from '../lib/logger.ts';
import crypto from 'crypto';
import { loadKeys } from '../features/vault/vault.service.ts';

interface KeyMetadata {
  id: string; // Hash of the key to uniquely identify it without storing plaintext
  isRateLimited: boolean;
  rateLimitResetAt?: number;
}

export class KeyManagerService {
  private providerKeyMetadata: Map<string, KeyMetadata[]> = new Map();
  private providerIndices: Map<string, number> = new Map();

  /**
   * Initializes or refreshes the tracking metadata for a provider's keys.
   */
  private refreshKeys(provider: string): string[] {
    // 1. Fetch keys from process.env
    const envVar = `${provider.toUpperCase()}_API_KEYS`;
    const envKeysStr = process.env[envVar] || process.env[`${provider.toUpperCase()}_API_KEY`];
    let keys: string[] = [];
    
    if (envKeysStr) {
      keys = envKeysStr.split(',').map((k) => k.trim()).filter(Boolean);
    }

    // 2. Fetch keys from Vault
    try {
      const vaultKeys = loadKeys();
      const vaultKeyStr = vaultKeys[`${provider}_api_keys`] || vaultKeys[`${provider.toUpperCase()}_API_KEY`] || vaultKeys[`${provider}_api_key`];
      if (vaultKeyStr) {
        const vKeys = vaultKeyStr.split(',').map((k) => k.trim()).filter(Boolean);
        keys = [...keys, ...vKeys];
      }
    } catch (err) {
      logger.warn(`[KeyManager] Failed to load keys from vault for ${provider}`);
    }

    // Deduplicate
    keys = Array.from(new Set(keys));

    if (keys.length === 0) {
      return [];
    }

    const currentMetadata = this.providerKeyMetadata.get(provider) || [];
    const newMetadata: KeyMetadata[] = keys.map((k) => {
      const id = crypto.createHash('sha256').update(k).digest('hex');
      const existing = currentMetadata.find(m => m.id === id);
      return existing || { id, isRateLimited: false };
    });

    this.providerKeyMetadata.set(provider, newMetadata);
    if (!this.providerIndices.has(provider)) {
      this.providerIndices.set(provider, 0);
    }

    return keys;
  }

  initializeFromEnv() {
    this.refreshKeys('gemini');
  }

  /**
   * Gets the next available key for a provider via round-robin.
   */
  getNextKey(provider: string): string {
    const keys = this.refreshKeys(provider);
    if (keys.length === 0) {
      throw new Error(`No API keys configured for provider: ${provider}`);
    }

    const metadata = this.providerKeyMetadata.get(provider)!;
    const now = Date.now();
    let currentIndex = this.providerIndices.get(provider) || 0;

    // Find the next available (non-rate-limited) key
    for (let i = 0; i < keys.length; i++) {
      const idx = (currentIndex + i) % keys.length;
      const meta = metadata[idx];

      if (meta.isRateLimited) {
        if (meta.rateLimitResetAt && now > meta.rateLimitResetAt) {
          // Rate limit expired
          meta.isRateLimited = false;
          meta.rateLimitResetAt = undefined;
        } else {
          continue; // Still rate limited
        }
      }

      // Update index for next request (round-robin)
      this.providerIndices.set(provider, (idx + 1) % keys.length);
      return keys[idx];
    }

    // If all keys are rate limited, fallback to the first key anyway
    this.providerIndices.set(provider, (currentIndex + 1) % keys.length);
    return keys[currentIndex];
  }

  /**
   * Marks a key as rate limited for a specific duration.
   */
  markRateLimited(provider: string, key: string, retryAfterSeconds: number = 60) {
    const metadata = this.providerKeyMetadata.get(provider);
    if (!metadata) return;

    const id = crypto.createHash('sha256').update(key).digest('hex');
    const meta = metadata.find((m) => m.id === id);
    if (meta) {
      meta.isRateLimited = true;
      meta.rateLimitResetAt = Date.now() + retryAfterSeconds * 1000;
      logger.warn(
        `[KeyManager] API Key for ${provider} rate limited. Backoff: ${retryAfterSeconds}s`
      );
    }
  }
}

export const keyManager = new KeyManagerService();
