import { Router } from 'express';
import { validate } from '../../middleware/validate.ts';
import { CacheService } from './cache.service.ts';
import { cacheSetSchema } from './cache.schema.ts';

export const cacheRouter = Router();
const service = new CacheService();

cacheRouter.post('/get', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid payload: request body must be an object' });
    }
    const key = service.generateKey(req.body);
    const text = await service.get(key);
    if (text !== null) {
      return res.json({ hit: true, text, key });
    }
    return res.json({ hit: false, key });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cacheRouter.post('/set', validate(cacheSetSchema), async (req, res) => {
  const { key, data, provider, model } = req.body;
  try {
    await service.set(key, data, provider, model);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cacheRouter.get('/stats', (_req, res) => {
  try {
    const stats = service.getStats();
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cacheRouter.post('/clear', (_req, res) => {
  try {
    const result = service.clear();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
