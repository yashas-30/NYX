import express from 'express';
import { LocalModelManager } from '../lib/localModelManager.ts';
import { LocalModelRunner } from '../lib/localModelRunner.ts';

export const localModelsRouter = express.Router();

// List presets and their installation status
localModelsRouter.get('/', (_req, res) => {
  try {
    const list = LocalModelManager.listModels();
    const activeModelId = LocalModelRunner.getActiveModel();
    const runnerStatus = LocalModelRunner.getStartStatus();

    res.json({
      models: list,
      activeModelId,
      runnerStatus
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Start GGUF model download
localModelsRouter.post('/download', (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }

  try {
    const result = LocalModelManager.startDownload(modelId);
    res.json(result);
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
    const progress = LocalModelManager.getProgress(modelId);
    res.json(progress);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Run a model natively via llama-server
localModelsRouter.post('/run', async (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }

  try {
    // Start runner asynchronously or wait for it
    await LocalModelRunner.start(modelId);
    res.json({ status: 'running', modelId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stop the native runner and evict model from memory
localModelsRouter.post('/stop', async (_req, res) => {
  try {
    await LocalModelRunner.stop();
    res.json({ status: 'stopped' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get current runner startup status
localModelsRouter.get('/status', (_req, res) => {
  try {
    const status = LocalModelRunner.getStartStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy streaming chat completion to port 12345
localModelsRouter.post('/chat', async (req, res) => {
  if (!LocalModelRunner.isRunning()) {
    return res.status(400).json({ error: 'No local GGUF model is currently loaded in RAM. Please start a model first.' });
  }

  const targetUrl = 'http://127.0.0.1:12345/v1/chat/completions';
  
  try {
    // Forward the chat requests
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...req.body,
        stream: true // Enforce streaming
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `llama-server error: ${errorText}` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

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
