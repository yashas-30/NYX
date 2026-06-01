import { Router } from 'express';
import { SystemService } from './system.service.ts';

export const healthRouter = Router();
const service = new SystemService();

healthRouter.get('/health', async (req, res) => {
  try {
    const { overall, checks } = await service.getHealth();
    res.status(overall === 'ok' ? 200 : 503).json(checks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
