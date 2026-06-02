import { Router } from 'express';
import logger from '../../lib/logger.ts';
import { FilesService } from './files.service.ts';

export const filesRouter = Router();
const filesService = new FilesService();

filesRouter.post('/upload', async (req, res) => {
  try {
    const { name, mimeType, data } = req.body;
    if (!data || !name || !mimeType) {
      return res.status(400).json({ error: 'Missing required file data' });
    }

    const filePath = await filesService.saveFile(name, mimeType, data);

    res.json({
      success: true,
      name,
      mimeType,
      path: filePath,
    });
  } catch (error: any) {
    logger.error({ error }, 'File upload failed');
    res.status(500).json({ error: 'Failed to upload file' });
  }
});
