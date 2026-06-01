import { validateApiKey } from '../../lib/apiKeyValidator.ts';

export class ModelProxyService {
  validateKey(provider: string, apiKey?: string): boolean {
    if (!apiKey) return true;
    return validateApiKey(provider, apiKey);
  }

  async listModels(provider: string, apiKey?: string): Promise<string[]> {
    try {
      const res = await fetch('http://127.0.0.1:3003/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey })
      });
      if (!res.ok) throw new Error('Antigravity service error');
      const data = await res.json();
      return data.models || [];
    } catch (err) {
      if (provider === 'gemini') {
        return ['google/codegemma-2b'];
      }
      throw new Error('Unsupported provider or Antigravity service unavailable');
    }
  }

  async getQuota(provider: string, apiKey?: string): Promise<any> {
    try {
      const res = await fetch('http://127.0.0.1:3003/quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      // fallback
    }
    if (provider === 'gemini') {
      return { status: 'ok', local: true };
    }
    return {};
  }
}
