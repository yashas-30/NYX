import logger from '../../lib/logger.ts';
import { validateApiKey } from '../../lib/apiKeyValidator.ts';

export class ModelProxyService {
  validateKey(provider: string, apiKey?: string): boolean {
    if (!apiKey) return true;
    return validateApiKey(provider, apiKey);
  }

  private getBaseUrl(): string {
    return (
      process.env.ANTIGRAVITY_URL || `http://127.0.0.1:${process.env.ANTIGRAVITY_PORT || '3003'}`
    );
  }

  async listModels(provider: string, apiKey?: string): Promise<string[]> {
    if (provider !== 'gemini' && provider !== 'antigravity-sdk') {
      return [];
    }

    try {
      const res = await fetch(`${this.getBaseUrl()}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      if (!res.ok) throw new Error('Antigravity service error');
      const data = await res.json();
      return data.models || [];
    } catch (err: any) {
      if (provider === 'gemini') {
        return ['google/codegemma-2b'];
      }
      logger.warn(
        `[ModelProxyService] Antigravity service unavailable for listModels (${provider}).`
      );
      return [];
    }
  }

  async getQuota(provider: string, apiKey?: string): Promise<any> {
    if (provider !== 'gemini' && provider !== 'antigravity-sdk') {
      return {};
    }

    try {
      const res = await fetch(`${this.getBaseUrl()}/quota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err: any) {
      logger.warn(
        `[ModelProxyService] Antigravity service unavailable for getQuota (${provider}).`
      );
    }
    if (provider === 'gemini') {
      return { status: 'ok', local: true };
    }
    return {};
  }
}
