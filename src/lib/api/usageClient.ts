import { AIService } from '../../core/services/ai.service';

/**
 * Fetches the remaining quota/credits for a given provider.
 * Supports detailed usage for OpenRouter and verification for others.
 */
export async function fetchQuota(provider: string, apiKey?: string): Promise<{ total: number; used: number; totalUSD?: number; usedUSD?: number }> {
  try {
    const response = await (AIService as any).fetchWithAuth('/api/models/quota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey: apiKey ? apiKey.trim() : undefined })
    });

    if (!response.ok) throw new Error(`Quota proxy failed: ${response.status}`);
    const data = await response.json();

    if (provider === 'openrouter') {
      const totalUSD = data.data?.total_credits || 0;
      const usedUSD = data.data?.used_credits || 0;
      return {
        total: Math.floor(totalUSD * 1000000),
        used: Math.floor(usedUSD * 1000000),
        totalUSD,
        usedUSD
      };
    }

    if (provider === 'gemini') {
      if (data.status === 'ok') return { total: 5000000, used: 0 };
    }

    if (provider === 'nvidia') {
      return { total: 1000000, used: 0 };
    }

    return { total: 1000000, used: 0 };
  } catch (err) {
    console.error(`Failed to fetch quota for ${provider}:`, err);
    return { total: 1000000, used: 0 };
  }
}
