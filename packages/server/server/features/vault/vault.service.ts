import logger from '../../lib/logger.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import keytar from 'keytar';
import { db } from '../../db/client.js';
import { sessions } from '../../db/schema.js';
import { eq, lt } from 'drizzle-orm';
import { VAULT_DIR, APP_STATE_DIR } from '../../lib/paths.js';
import { env } from '../../config/env.js';
import { CONSTANTS } from '../../config/constants.js';

const VAULT_FILE = path.join(VAULT_DIR, 'vault.enc');
const KEYTAR_SERVICE = 'NYX_VAULT';
const KEYTAR_ACCOUNT_API = 'api_keys';
const KEYTAR_ACCOUNT_SIGNER = 'request_signer';

function getMasterKey(): Buffer {
  const masterKey = env.NYX_MASTER_KEY;
  if (!masterKey) {
    if (env.NODE_ENV === 'production') {
      logger.fatal(
        '[KeyVault] NYX_MASTER_KEY environment variable is not provided. FAILED TO START SERVER.'
      );
      throw new Error(
        'NYX_MASTER_KEY environment variable must be provided in production environment.'
      );
    }
    const fallbackPath = path.join(VAULT_DIR, '.master-key');
    if (fs.existsSync(fallbackPath)) {
      return fs.readFileSync(fallbackPath);
    }
    const newKey = crypto.randomBytes(32);
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true });
    }
    fs.writeFileSync(fallbackPath, newKey, { mode: 0o600 });
    logger.warn('[KeyVault] Generated new master key. BACK UP .nyx-keys/.master-key!');
    return newKey;
  }
  return crypto.createHash('sha256').update(masterKey).digest();
}

export function encryptText(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

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

let cachedKeys: Record<string, string> | null = null;

export function getKeysSync(): Record<string, string> {
  if (cachedKeys) return cachedKeys;
  if (!fs.existsSync(VAULT_FILE)) return {};
  try {
    const encryptedData = fs.readFileSync(VAULT_FILE, 'utf8');
    const decryptedJson = decryptText(encryptedData);
    cachedKeys = JSON.parse(decryptedJson);
    return cachedKeys!;
  } catch {
    return {};
  }
}

export async function loadKeys(): Promise<Record<string, string>> {
  try {
    const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_API);
    if (stored) {
      cachedKeys = JSON.parse(stored);
      return cachedKeys!;
    }
  } catch (err: any) {
    logger.warn('[KeyVault] Keytar load failed, falling back to file vault:', err.message);
  }

  if (!fs.existsSync(VAULT_FILE)) {
    return {};
  }
  try {
    const encryptedData = fs.readFileSync(VAULT_FILE, 'utf8');
    const decryptedJson = decryptText(encryptedData);
    cachedKeys = JSON.parse(decryptedJson);
    return cachedKeys!;
  } catch (error: any) {
    logger.error('[KeyVault] Failed to decrypt vault keys:', error.message);
    return {};
  }
}

export async function saveKeys(keys: Record<string, string>): Promise<void> {
  cachedKeys = keys;
  const jsonStr = JSON.stringify(keys);
  try {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_API, jsonStr);
  } catch (err: any) {
    logger.warn('[KeyVault] Keytar save failed, falling back to file vault:', err.message);
  }

  // Always save to file vault as fallback for CI/CD environments
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true });
    }
    const encryptedData = encryptText(jsonStr);
    fs.writeFileSync(VAULT_FILE, encryptedData, 'utf8');
  } catch (error: any) {
    logger.error('[KeyVault] Failed to save keys to vault file:', error.message);
  }
}

// Request Signer Storage
export interface SignerSecrets {
  current: string;
  previous?: string;
  rotatedAt: number;
}

export async function getRequestSignerSecrets(): Promise<SignerSecrets> {
  let data: SignerSecrets | null = null;
  try {
    const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_SIGNER);
    if (stored) data = JSON.parse(stored);
  } catch (err) {}

  if (!data) {
    // Generate initial secret
    data = {
      current: crypto.randomBytes(32).toString('hex'),
      rotatedAt: Date.now(),
    };
    try {
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_SIGNER, JSON.stringify(data));
    } catch (err) {}
  }

  // Auto rotate if older than 24h
  if (Date.now() - data.rotatedAt > 24 * 60 * 60 * 1000) {
    data = await rotateRequestSignerSecret();
  }

  return data;
}

export async function rotateRequestSignerSecret(): Promise<SignerSecrets> {
  let data: SignerSecrets | null = null;
  try {
    const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_SIGNER);
    if (stored) data = JSON.parse(stored);
  } catch (err) {}

  const newSecret = crypto.randomBytes(32).toString('hex');
  const newData: SignerSecrets = {
    current: newSecret,
    previous: data?.current,
    rotatedAt: Date.now(),
  };

  try {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_SIGNER, JSON.stringify(newData));
  } catch (err) {}

  return newData;
}

// Session store using SQLite
function pruneExpiredSessions(): void {
  try {
    const now = Date.now();
    db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to prune expired sessions');
  }
}

setInterval(pruneExpiredSessions, CONSTANTS.SESSION_PRUNE_INTERVAL_MS).unref();

export function createSessionToken(isStreamNonce = false): string {
  const token = crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ttl = CONSTANTS.SESSION_TTL_MS;

  try {
    db.insert(sessions)
      .values({
        id: crypto.randomUUID(),
        tokenHash,
        isStreamNonce,
        expiresAt: Date.now() + ttl,
        createdAt: Date.now(),
      })
      .run();
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to create session');
  }

  return token;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const session = db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();

    if (!session) return false;

    if (Date.now() > session.expiresAt) {
      db.delete(sessions).where(eq(sessions.id, session.id)).run();
      return false;
    }

    if (session.revokedAt) {
      db.delete(sessions).where(eq(sessions.id, session.id)).run();
      return false;
    }

    if (session.isStreamNonce) {
      db.delete(sessions).where(eq(sessions.id, session.id)).run();
    }

    return true;
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to verify session token');
    return false;
  }
}

export function refreshSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const session = db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
    if (!session || session.isStreamNonce) return false;
    if (Date.now() > session.expiresAt) {
      db.delete(sessions).where(eq(sessions.id, session.id)).run();
      return false;
    }
    db.update(sessions)
      .set({ expiresAt: Date.now() + CONSTANTS.SESSION_REFRESH_TTL_MS })
      .where(eq(sessions.id, session.id))
      .run();
    return true;
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to refresh session token');
    return false;
  }
}

export function revokeSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const session = db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      db.delete(sessions).where(eq(sessions.id, session.id)).run();
      return false;
    }
    db.update(sessions)
      .set({ revokedAt: Date.now() })
      .where(eq(sessions.id, session.id))
      .run();
    return true;
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to revoke session token');
    return false;
  }
}

export async function getVaultStatus(): Promise<Record<string, boolean>> {
  const keys = await loadKeys();
  return {
    gemini: !!(keys.gemini && keys.gemini.trim().length > 0),
    scrapling: !!(
      (keys.scrapling && keys.scrapling.trim().length > 0) ||
      (keys.scrapling_url && keys.scrapling_url.trim().length > 0)
    ),
  };
}

export async function exportVault(): Promise<string> {
  const keys = await loadKeys();
  return encryptText(JSON.stringify(keys));
}

export async function importVault(encryptedData: string): Promise<void> {
  const decrypted = decryptText(encryptedData);
  const keys = JSON.parse(decrypted);
  await saveKeys(keys);
}

export async function backupVault(): Promise<string> {
  const backupDir = path.join(APP_STATE_DIR, '.nyx-backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `vault-${timestamp}.enc`);

  if (fs.existsSync(VAULT_FILE)) {
    fs.copyFileSync(VAULT_FILE, backupPath);
  } else {
    fs.writeFileSync(backupPath, encryptText(JSON.stringify({})), 'utf8');
  }

  try {
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('vault-') && f.endsWith('.enc'))
      .sort();
    if (backups.length > 10) {
      const toRemoveCount = backups.length - 10;
      for (let i = 0; i < toRemoveCount; i++) {
        const fileToRemove = backups[i];
        if (fileToRemove) {
          fs.unlinkSync(path.join(backupDir, fileToRemove));
        }
      }
    }
  } catch (error: any) {
    logger.error('[KeyVault] Backup rotation failed:', error.message);
  }

  return backupPath;
}
