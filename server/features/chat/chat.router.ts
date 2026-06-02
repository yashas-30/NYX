import { Router } from 'express';
import logger from '../../lib/logger.ts';
import { ChatService } from './chat.service.ts';

export const chatRouter = Router();
const chatService = new ChatService();

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
      logger.warn(
        { err: sharpErr.message || sharpErr },
        'Sharp image processing unavailable, using original image'
      );
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

chatRouter.post('/stream', async (req, res) => {
  try {
    const {
      prompt,
      history,
      provider,
      modelId,
      settings,
      systemInstruction,
      enableWebSearch,
      images,
    } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Abort signal handling if client disconnects
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    await chatService.streamChat(
      { prompt, history, provider, modelId, settings, systemInstruction, enableWebSearch, images },
      abortController.signal,
      (chunk: string) => {
        try {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        } catch (e) {
          logger.error('Error writing chunk to stream', e);
        }
      },
      () => {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    );
  } catch (error: any) {
    logger.error({ error }, 'Chat stream failed');
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Chat stream failed' });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

chatRouter.post('/suggestions', async (req, res) => {
  try {
    const { history } = req.body;
    const suggestions = await chatService.getSuggestions(history || []);
    res.json({ suggestions });
  } catch (error: any) {
    logger.error({ error }, 'Failed to get suggestions');
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});
