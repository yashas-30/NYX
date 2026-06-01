import { Router } from 'express';
import logger from '../../lib/logger.ts';

export const chatRouter = Router();

chatRouter.post('/upload-image', async (req, res) => {
  try {
    const { name, mimeType, data } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    const buffer = Buffer.from(data, 'base64');
    let base64Data = data;

    try {
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default || sharpModule;
      // Process the image using sharp (resize to max 1024px width/height to keep context token count reasonable)
      const processedBuffer = await sharp(buffer)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      base64Data = processedBuffer.toString('base64');
    } catch (sharpErr: any) {
      logger.warn({ err: sharpErr.message || sharpErr }, 'Sharp image processing unavailable, using original image');
    }

    res.json({
      success: true,
      name,
      mimeType,
      data: base64Data,
    });
  } catch (error: any) {
    logger.error({ error }, 'Image processing failed');
    res.status(500).json({ error: 'Failed to process image' });
  }
});
