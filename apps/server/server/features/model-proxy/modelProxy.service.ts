import logger from '../../lib/logger.js';
import { validateApiKey } from '../../lib/apiKeyValidator.js';
import { env } from '../../config/env.js';

export class ModelProxyService {
  validateKey(provider: string, apiKey?: string): boolean {
    if (!apiKey) return true;
    return validateApiKey(provider, apiKey);
  }

  private getBaseUrl(): string {
    return (
      env.ANTIGRAVITY_URL || `http://127.0.0.1:${env.ANTIGRAVITY_PORT || 3003}`
    );
  }

  async listModels(provider: string, apiKey?: string): Promise<string[]> {
    if (provider === 'lmstudio') {
      try {
        let res = await fetch('http://127.0.0.1:1234/v1/models').catch(() => null);
        if (!res || !res.ok) {
          res = await fetch('http://127.0.0.1:1234/api/v1/models').catch(() => null);
        }
        if (res && res.ok) {
          const data = await res.json() as any;
          if (data && data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => `lmstudio/${m.id}`);
          }
          if (data && data.models && Array.isArray(data.models)) {
            return data.models.map((m: any) => `lmstudio/${m.key || m.id || m.name || m}`);
          }
        }
      } catch (e) {
        // Fallthrough to local filesystem
      }
      
      // Fallback to local filesystem if API failed or returned empty/non-ok
      try {
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        const lmStudioPath = path.join(os.homedir(), '.cache', 'lm-studio', 'models');
        if (fs.existsSync(lmStudioPath)) {
          const models: string[] = [];
          const publishers = fs.readdirSync(lmStudioPath);
          for (const pub of publishers) {
            const pubPath = path.join(lmStudioPath, pub);
            if (fs.statSync(pubPath).isDirectory()) {
              const repos = fs.readdirSync(pubPath);
              for (const repo of repos) {
                const repoPath = path.join(pubPath, repo);
                if (fs.statSync(repoPath).isDirectory()) {
                  models.push(`${pub}/${repo}`);
                }
              }
            }
          }
          if (models.length > 0) return models.map(m => `lmstudio/${m}`);
        }
      } catch (fsErr) {
         // ignore filesystem errors
      }
      return [];
    }

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
      const data = await res.json() as any;
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
