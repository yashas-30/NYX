import { Router } from 'express';
import { validateApiKey } from '../lib/apiKeyValidator.ts';

export const modelProxyRouter = Router();

modelProxyRouter.post('/list', async (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || typeof provider !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid provider in request body' });
  }
  if (provider.length > 64) {
    return res.status(400).json({ error: 'Provider name too long' });
  }
  if (apiKey && !validateApiKey(provider, apiKey)) {
    return res.status(400).json({ error: 'Invalid API key format for provider: ' + provider });
  }
  try {
    if (provider === 'gemini') {
      return res.json({ models: ['google/codegemma-2b'] });
    }
    let url = '';
    const headers: Record<string, string> = {};
    if (provider === 'openrouter') { url = 'https://openrouter.ai/api/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }
    if (provider === 'nvidia')     { url = 'https://integrate.api.nvidia.com/v1/models'; headers['Authorization'] = `Bearer ${apiKey}`; }
    if (!url) return res.status(400).json({ error: 'Unsupported provider' });

    const r = await fetch(url, { headers });
    const data = await r.json();

    let models: string[] = [];
    if (provider === 'openrouter') models = data.data?.map((m: any) => m.id) || [];
    if (provider === 'nvidia')     models = data.data?.map((m: any) => m.id) || [];

    res.json({ models });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

modelProxyRouter.post('/quota', async (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || typeof provider !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid provider in request body' });
  }
  if (provider.length > 64) {
    return res.status(400).json({ error: 'Provider name too long' });
  }
  if (apiKey && !validateApiKey(provider, apiKey)) {
    return res.status(400).json({ error: 'Invalid API key format for provider: ' + provider });
  }
  try {
    if (provider === 'gemini') {
      return res.json({ status: 'ok', local: true });
    }
    if (provider === 'openrouter') {
      if (!apiKey || typeof apiKey !== 'string') return res.status(401).json({ error: 'API key required for OpenRouter' });
      const r = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await r.json();
      return res.json(data);
    }
    res.json({});
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
