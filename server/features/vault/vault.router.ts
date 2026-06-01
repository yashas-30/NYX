import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loadKeys, saveKeys, createSessionToken, getVaultStatus, backupVault, exportVault, importVault } from './vault.service.ts';
import { validate } from '../../middleware/validate.ts';
import { vaultStoreSchema } from './vault.schema.ts';

export const vaultRouter = Router();

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests, please try again later.' }
});

const vaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many vault operations, please try again later.' }
});

vaultRouter.post('/store', validate(vaultStoreSchema), vaultLimiter, (req, res) => {
  const { keys } = req.body;
  try {
    const currentKeys = loadKeys();
    const updatedKeys = { ...currentKeys, ...keys };
    saveKeys(updatedKeys);
    res.json({ status: 'ok' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const handleGetToken = (req: any, res: any) => {
  const isStream = req.query.stream === 'true';
  const token = createSessionToken(isStream);
  res.json({ token, expiresAt: Date.now() + 5 * 60 * 1000 });
};

vaultRouter.get('/token', tokenLimiter, handleGetToken);
vaultRouter.get('/status', (req, res) => {
  res.json(getVaultStatus());
});

vaultRouter.post('/backup', vaultLimiter, (req, res) => {
  try {
    const backupPath = backupVault();
    res.json({ status: 'ok', path: backupPath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vaultRouter.post('/export', vaultLimiter, (req, res) => {
  try {
    const data = exportVault();
    res.json({ status: 'ok', data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vaultRouter.post('/import', vaultLimiter, (req, res) => {
  const { data } = req.body;
  if (!data || typeof data !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid encrypted vault data in body' });
  }
  try {
    importVault(data);
    res.json({ status: 'ok' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

vaultRouter.post('/validate', vaultLimiter, async (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'Missing provider or apiKey in request body' });
  }

  const key = apiKey.trim();

  try {
    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (response.ok) {
        return res.json({ valid: true });
      } else {
        const errData = await response.json().catch(() => ({}));
        return res.status(400).json({ valid: false, error: errData.error?.message || 'Invalid API Key' });
      }
    } 
    
    if (provider === 'scrapling') {
      const scraplingPort = process.env.SCRAPLING_PORT || '3002';
      const url = (req.body.scraplingUrl || `http://localhost:${scraplingPort}`).trim();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) {
        headers['Authorization'] = `Bearer ${key}`;
      }
      
      try {
        const response = await fetch(`${url}/v1/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'test', limit: 1 }),
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok || response.status === 400) {
          return res.json({ valid: true });
        }
        
        // Try fallback to health check
        const healthResponse = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
        if (healthResponse.ok) {
          return res.json({ valid: true });
        }
        return res.status(400).json({ valid: false, error: `Scrapling service returned status ${response.status}` });
      } catch (error: any) {
        // Double check health fallback
        try {
          const healthResponse = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
          if (healthResponse.ok) {
            return res.json({ valid: true });
          }
        } catch {}
        return res.status(400).json({ valid: false, error: `Scrapling service unreachable at ${url}: ${error.message}` });
      }
    }

    return res.status(400).json({ error: `Validation not supported for provider: ${provider}` });
  } catch (error: any) {
    return res.status(500).json({ error: `Connection failed: ${error.message}` });
  }
});
