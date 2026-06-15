import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import logger from './logger.js';
import { Gateway } from './gateway.js';

interface CacheEntry {
  cacheName: string;
  messageCount: number;
  hash: string;
  createdAt: number;
  model: string;
}

export class GeminiCacheManager {
  private static activeCaches = new Map<string, CacheEntry>();

  /**
   * Generates a SHA-256 hash of a messages array to uniquely identify context.
   */
  static hashMessages(messages: any[], tools?: any[]): string {
    const hash = crypto.createHash('sha256');
    for (const msg of messages) {
      hash.update(msg.role || '');
      hash.update(msg.content || '');
      if (msg.images && Array.isArray(msg.images)) {
        for (const img of msg.images) {
          hash.update(img.mimeType || '');
          hash.update(img.data || '');
        }
      }
    }
    if (tools && tools.length > 0) {
      hash.update(JSON.stringify(tools));
    }
    return hash.digest('hex');
  }

  /**
   * Finds the longest active cached prefix that matches the beginning of the messages array.
   */
  static findMatchingCache(messages: any[], model: string, tools?: any[]): CacheEntry | null {
    const now = Date.now();
    // Clean up expired cache entries (5-minute TTL)
    for (const [key, entry] of this.activeCaches.entries()) {
      if (now - entry.createdAt > 300000) {
        this.activeCaches.delete(key);
      }
    }

    let bestMatch: CacheEntry | null = null;
    let maxCount = 0;

    for (const entry of this.activeCaches.values()) {
      if (entry.model !== model) continue;
      // The cache must represent a subset/prefix of the messages
      if (entry.messageCount <= messages.length && entry.messageCount > maxCount) {
        const prefix = messages.slice(0, entry.messageCount);
        const prefixHash = this.hashMessages(prefix, tools);
        if (prefixHash === entry.hash) {
          bestMatch = entry;
          maxCount = entry.messageCount;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Gets an existing cache or creates a new one for a prefix of messages.
   */
  static async getOrCreateCache(
    messages: any[],
    systemInstruction: string | undefined,
    model: string,
    apiKey: string,
    tools?: any[]
  ): Promise<{ cacheName: string; cachedCount: number }> {
    const prefixHash = this.hashMessages(messages, tools);
    
    const existing = this.activeCaches.get(prefixHash);
    if (existing && Date.now() - existing.createdAt < 300000) {
      logger.info(`[GeminiCacheManager] Cache hit for prefix hash ${prefixHash.substring(0, 10)}. Reusing cache: ${existing.cacheName}`);
      return { cacheName: existing.cacheName, cachedCount: existing.messageCount };
    }

    logger.info(`[GeminiCacheManager] Cache miss. Creating new context cache for ${messages.length} messages on model ${model}...`);
    
    const ai = new GoogleGenAI({ apiKey });
    const { contents } = Gateway.formatMessages(messages, 'gemini');

    const config: any = {
      contents,
      systemInstruction,
      ttl: '300s', // 5 minutes TTL
    };

    if (tools && tools.length > 0) {
      // Format tools for @google/genai SDK
      const formattedTools = tools.map(t => {
        const fn = t.function || t;
        return {
          functionDeclarations: [{
            name: fn.name,
            description: fn.description || '',
            parameters: fn.parameters || { type: 'object', properties: {} }
          }]
        };
      });
      config.tools = formattedTools;
    }

    const cache = await ai.caches.create({
      model: model,
      config,
    });

    if (!cache.name) {
      throw new Error('Gemini API did not return a cache name.');
    }

    const cacheEntry: CacheEntry = {
      cacheName: cache.name,
      messageCount: messages.length,
      hash: prefixHash,
      createdAt: Date.now(),
      model,
    };

    this.activeCaches.set(prefixHash, cacheEntry);
    logger.info(`[GeminiCacheManager] Cache successfully created. Name: ${cache.name}`);

    return { cacheName: cache.name, cachedCount: messages.length };
  }
}
