import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loadKeys, saveKeys, createSessionToken, getVaultStatus } from '../lib/keyVault.ts';

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

vaultRouter.post('/store', vaultLimiter, (req, res) => {
  const { keys } = req.body;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    return res.status(400).json({ error: 'Invalid payload: keys object required' });
  }
  if (Object.keys(keys).length > 100) {
    return res.status(400).json({ error: 'Too many keys provided (max 100)' });
  }
  try {
    const currentKeys = loadKeys();
    const updatedKeys = { ...currentKeys, ...keys };
    saveKeys(updatedKeys);
    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
