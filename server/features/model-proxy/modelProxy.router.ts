import { Router } from 'express';
import { validate } from '../../middleware/validate.ts';
import { modelQuerySchema } from './modelProxy.schema.ts';
import { ModelProxyService } from './modelProxy.service.ts';

export const modelProxyRouter = Router();
const service = new ModelProxyService();

modelProxyRouter.post('/list', validate(modelQuerySchema), async (req, res) => {
  const { provider, apiKey } = req.body;
  if (apiKey && !service.validateKey(provider, apiKey)) {
    return res.status(400).json({ error: 'Invalid API key format for provider: ' + provider });
  }
  try {
    const models = await service.listModels(provider, apiKey);
    res.json({ models });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

modelProxyRouter.post('/quota', validate(modelQuerySchema), async (req, res) => {
  const { provider, apiKey } = req.body;
  if (apiKey && !service.validateKey(provider, apiKey)) {
    return res.status(400).json({ error: 'Invalid API key format for provider: ' + provider });
  }
  try {
    const quota = await service.getQuota(provider, apiKey);
    res.json(quota);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
