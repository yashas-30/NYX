import { CacheServer } from '../../lib/cache.ts';

export class CacheService {
  generateKey(body: any) {
    return CacheServer.generateKey(body);
  }

  async get(key: string) {
    return await CacheServer.get(key);
  }

  async set(key: string, data: any, provider: string, model: string) {
    return await CacheServer.set(key, data, provider, model);
  }

  getStats() {
    return CacheServer.getStats();
  }

  clear() {
    return CacheServer.clear();
  }
}
