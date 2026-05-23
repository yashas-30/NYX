import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const VAULT_DIR = path.join(process.cwd(), '.nyx-keys');
const VAULT_FILE = path.join(VAULT_DIR, 'vault.enc');

// Derive 32-byte key for AES-256-GCM
function getMasterKey(): Buffer {
  const masterKey = process.env.NYX_MASTER_KEY;
  if (!masterKey) {
    console.warn('[KeyVault] WARNING: NYX_MASTER_KEY environment variable is not configured. Falling back to derived hash (insecure).');
  }
  const keySource = masterKey || 'default-nyx-master-key-fallback';
  return crypto.createHash('sha256').update(keySource).digest();
}

// Encrypt string using AES-256-GCM
export function encryptText(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

// Decrypt string using AES-256-GCM
export function decryptText(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid vault encrypted format');
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Load decrypted keys from disk
export function loadKeys(): Record<string, string> {
  if (!fs.existsSync(VAULT_FILE)) {
    return {};
  }
  try {
    const encryptedData = fs.readFileSync(VAULT_FILE, 'utf8');
    const decryptedJson = decryptText(encryptedData);
    return JSON.parse(decryptedJson);
  } catch (error: any) {
    console.error('[KeyVault] Failed to decrypt vault keys:', error.message);
    return {};
  }
}

// Save encrypted keys to disk
export function saveKeys(keys: Record<string, string>): void {
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true });
    }
    const jsonStr = JSON.stringify(keys);
    const encryptedData = encryptText(jsonStr);
    fs.writeFileSync(VAULT_FILE, encryptedData, 'utf8');
  } catch (error: any) {
    console.error('[KeyVault] Failed to save keys to vault:', error.message);
    throw new Error(`Vault save failed: ${error.message}`);
  }
}

// Session store in-memory
interface SessionInfo {
  expiresAt: number;
  isStreamNonce: boolean;
}

const sessionStore = new Map<string, SessionInfo>();

// Clean expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, info] of sessionStore.entries()) {
    if (now > info.expiresAt) {
      sessionStore.delete(token);
    }
  }
}, 60000).unref();

// Generate a new temporary session token or streaming nonce
export function createSessionToken(isStreamNonce = false): string {
  const token = crypto.randomUUID();
  const ttl = 5 * 60 * 1000; // 5 minutes
  sessionStore.set(token, {
    expiresAt: Date.now() + ttl,
    isStreamNonce,
  });
  return token;
}

// Verify a session token and optionally consume if it's a stream nonce
export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const info = sessionStore.get(token);
  if (!info) return false;

  if (Date.now() > info.expiresAt) {
    sessionStore.delete(token);
    return false;
  }

  if (info.isStreamNonce) {
    // Single-use for SSE streaming, invalidate immediately
    sessionStore.delete(token);
  }

  return true;
}

// Get configure statuses of keys
export function getVaultStatus(): Record<string, boolean> {
  const keys = loadKeys();
  return {
    gemini: !!(keys.gemini && keys.gemini.trim().length > 0),
    openrouter: !!(keys.openrouter && keys.openrouter.trim().length > 0),
    nvidia: !!(keys.nvidia && keys.nvidia.trim().length > 0),
    opencode: !!(keys.opencode && keys.opencode.trim().length > 0),
  };
}
