import { validateApiKey } from '../../lib/apiKeyValidator.ts';

export class ModelProxyService {
  validateKey(provider: string, apiKey?: string): boolean {
    if (!apiKey) return true;
    return validateApiKey(provider, apiKey);
  }

  async listModels(provider: string, apiKey?: string): Promise<string[]> {
    if (provider === 'gemini') {
      return ['google/codegemma-2b'];
    }
    let url = '';
    const headers: Record<string, string> = {};
    if (provider === 'openrouter') { url = 'https://openrouter.ai/api/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }
    if (provider === 'nvidia')     { url = 'https://integrate.api.nvidia.com/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }
    if (!url) {
      throw new Error('Unsupported provider');
    }

    const r = await fetch(url, { headers });
    if (!r.ok) {
      throw new Error(`Failed to fetch models: ${r.statusText}`);
    }
    const data = await r.json();

    let models: string[] = [];
    if (provider === 'openrouter') models = data.data?.map((m: any) => m.id) || [];
    if (provider === 'nvidia')     models = data.data?.map((m: any) => m.id) || [];
    return models;
  }

  async getQuota(provider: string, apiKey?: string): Promise<any> {
    if (provider === 'gemini') {
      return { status: 'ok', local: true };
    }
    if (provider === 'openrouter') {
      if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('API key required for OpenRouter');
      }
      const r = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!r.ok) {
        throw new Error(`Failed to fetch credits: ${r.statusText}`);
      }
      const data = await r.json();
      return data;
    }
    return {};
  }
}
