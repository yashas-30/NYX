import logger from '../../lib/logger.ts';
import { Router } from 'express';
import { validate } from '../../middleware/validate.ts';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { LocalModelsService } from './localModels.service.ts';
import {
  localModelStartSchema,
  localModelDownloadSchema,
  localModelDeleteSchema,
  localModelChatSchema,
} from './localModels.schema.ts';

export const localModelsRouter = Router();
const service = new LocalModelsService();

// List presets and their installation status
localModelsRouter.get('/', (_req, res) => {
  try {
    res.json(service.listModels());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Detect hardware compatibility and suggest model presets
localModelsRouter.get('/compatibility', async (_req, res) => {
  try {
    res.json(await service.getDeviceCompatibility());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-select optimal model for device specs and start downloading
localModelsRouter.post('/auto-setup', async (_req, res) => {
  try {
    res.json(await service.autoSetup());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-detect and download all compatible models for the device specs
localModelsRouter.post('/download-all-compatible', async (_req, res) => {
  try {
    res.json(await service.downloadAllCompatible());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start GGUF model download
localModelsRouter.post('/download', validate(localModelDownloadSchema), (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }
  try {
    res.json(service.startDownload(modelId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Poll download progress
localModelsRouter.get('/download-progress', (req, res) => {
  const { modelId } = req.query;
  if (!modelId || typeof modelId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid modelId query parameter.' });
  }
  try {
    res.json(service.getProgress(modelId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pause an active download (keeps .part file for resume)
localModelsRouter.post('/pause', (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }
  try {
    res.json(service.pauseDownload(modelId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resume a paused download from where it left off
localModelsRouter.post('/resume', (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }
  try {
    res.json(service.resumeDownload(modelId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a download and delete the partial file
localModelsRouter.post('/cancel', (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }
  try {
    res.json(service.cancelDownload(modelId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run a model natively via llama-server
localModelsRouter.post('/run', validate(localModelStartSchema), async (req, res) => {
  const { modelId, settings } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }
  try {
    res.json(await service.runModel(modelId, settings));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop the native runner and evict model from memory
localModelsRouter.post('/stop', async (_req, res) => {
  try {
    res.json(await service.stopModel());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a downloaded GGUF model from disk
localModelsRouter.delete('/delete', validate(localModelDeleteSchema), (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }
  try {
    res.json(service.deleteModel(modelId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current runner startup status
localModelsRouter.get('/status', (_req, res) => {
  try {
    res.json(service.getStartStatus());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy streaming chat completion to llama-server port
localModelsRouter.post('/chat', validate(localModelChatSchema), async (req, res) => {
  const model = req.body.model;
  const { messages, temperature, max_tokens, agentMode, webSearch } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid or missing messages in request body.' });
  }

  try {
    const response = await service.chat({
      model,
      messages,
      temperature,
      max_tokens,
      agentMode,
      webSearch,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sendSseTokenRotate(res);

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error: any) {
    logger.error('[Local runner proxy error]:', error.message);
    if (res.headersSent) {
      // Headers already sent (streaming started) — write an SSE error event and close
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      } catch {
        /* socket already closed */
      }
    } else {
      res.status(500).json({ error: `Connection to local model runner failed: ${error.message}` });
    }
  }
});
