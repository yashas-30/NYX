import { Router } from 'express';
import { validate } from '../../middleware/validate.ts';
import { sendSseTokenRotate } from '../../lib/sseHelpers.ts';
import { LocalModelsService } from './localModels.service.ts';
import {
  localModelStartSchema,
  localModelDownloadSchema,
  localModelDeleteSchema,
  localModelChatSchema
} from './localModels.schema.ts';

export const localModelsRouter = Router();
const service = new LocalModelsService();

// List presets and their installation status
localModelsRouter.get('/', (_req, res) => {
  try {
    res.json(service.listModels());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Detect hardware compatibility and suggest model presets
localModelsRouter.get('/compatibility', async (_req, res) => {
  try {
    res.json(await service.getDeviceCompatibility());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-select optimal model for device specs and start downloading
localModelsRouter.post('/auto-setup', async (_req, res) => {
  try {
    res.json(await service.autoSetup());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-detect and download all compatible models for the device specs
localModelsRouter.post('/download-all-compatible', async (_req, res) => {
  try {
    res.json(await service.downloadAllCompatible());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stop the native runner and evict model from memory
localModelsRouter.post('/stop', async (_req, res) => {
  try {
    res.json(await service.stopModel());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get current runner startup status
localModelsRouter.get('/status', (_req, res) => {
  try {
    res.json(service.getStartStatus());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy streaming chat completion to port 12345
localModelsRouter.post('/chat', validate(localModelChatSchema), async (req, res) => {
  const model = req.body.model;
  const { messages, temperature, max_tokens, agentMode } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid or missing messages in request body.' });
  }

  try {
    const response = await service.chat({ model, messages, temperature, max_tokens, agentMode });

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
  } catch (e: any) {
    console.error('[Local runner proxy error]:', e.message);
    res.status(500).json({ error: `Connection to local model runner failed: ${e.message}` });
  }
});
