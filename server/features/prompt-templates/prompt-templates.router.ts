import { Router, Request, Response } from 'express';
import { PromptTemplatesStore } from './prompt-templates.service.ts';

export const promptTemplatesRouter = Router();
const store = new PromptTemplatesStore();

promptTemplatesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const templates = await store.list();
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

promptTemplatesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, content, type } = req.body;
    if (!name || !content || !type) {
      res.status(400).json({ error: 'Missing name, content, or type' });
      return;
    }
    const template = await store.create({ name, content, type });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

promptTemplatesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, content, type } = req.body;
    await store.update(id, { name, content, type });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

promptTemplatesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await store.delete(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
