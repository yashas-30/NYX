import logger from '../../lib/logger.js';
import { validateApiKey } from '../../lib/apiKeyValidator.js';
import { env } from '../../config/env.js';

export class ModelProxyService {
  validateKey(provider: string, apiKey?: string): boolean {
    if (!apiKey) return true;
    return validateApiKey(provider, apiKey);
  }



  async listModels(provider: string, apiKey?: string): Promise<string[]> {
    if (provider === 'gemini') {
      return ['google/codegemma-2b'];
    }
    return [];
  }

  async getQuota(provider: string, apiKey?: string): Promise<any> {
    if (provider === 'gemini') {
      return { status: 'ok', local: true };
    }
    return {};
  }
}
