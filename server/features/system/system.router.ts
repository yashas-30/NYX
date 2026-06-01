import { Router } from 'express';
import { SystemService } from './system.service.ts';

export const systemRouter = Router();
const service = new SystemService();

systemRouter.get('/system', async (req, res) => {
  const modelId = req.query.modelId as string;
  try {
    const specs = await service.getSystemSpecs(modelId);
    res.json(specs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
