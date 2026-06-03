import logger from '../../lib/logger.ts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { VAULT_DIR, APP_STATE_DIR } from '../../lib/paths.ts';
const VAULT_FILE = path.join(VAULT_DIR, 'vault.enc');

// Derive 32-byte key for AES-256-GCM
function getMasterKey(): Buffer {
  const masterKey = process.env.NYX_MASTER_KEY;
  if (!masterKey) {
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
    logger.error('[KeyVault] Failed to decrypt vault keys:', error.message);
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
    logger.error('[KeyVault] Failed to save keys to vault:', error.message);
    throw new Error(`Vault save failed: ${error.message}`);
  }
}

import { db } from '../../db/client.ts';
import { sessions } from '../../db/schema.ts';
import { eq, lt } from 'drizzle-orm';

// Session store using SQLite
function pruneExpiredSessions(): void {
  try {
    const now = Date.now();
    db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to prune expired sessions');
  }
}

// Prune expired sessions every 10 minutes
setInterval(pruneExpiredSessions, 10 * 60 * 1000).unref();

// Generate a new temporary session token or streaming nonce
export function createSessionToken(isStreamNonce = false): string {
  const token = crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ttl = 5 * 60 * 1000; // 5 minutes
  
  try {
    db.insert(sessions).values({
      id: crypto.randomUUID(),
      tokenHash,
      isStreamNonce,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    }).run();
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to create session');
  }
  
  return token;
}

// Verify a session token and optionally consume if it's a stream nonce
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

    if (session.isStreamNonce) {
      // Single-use for SSE streaming, invalidate immediately
      db.delete(sessions).where(eq(sessions.id, session.id)).run();
    }

    return true;
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to verify session token');
    return false;
  }
}

// Refresh an existing session token
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

    // Extend by 5 minutes
    db.update(sessions)
      .set({ expiresAt: Date.now() + 5 * 60 * 1000 })
      .where(eq(sessions.id, session.id))
      .run();

    return true;
  } catch (error) {
    logger.error({ error }, '[SessionStore] Failed to refresh session token');
    return false;
  }
}

// Get configure statuses of keys
export function getVaultStatus(): Record<string, boolean> {
  const keys = loadKeys();
  return {
    gemini: !!(keys.gemini && keys.gemini.trim().length > 0),
    scrapling: !!(
      (keys.scrapling && keys.scrapling.trim().length > 0) ||
      (keys.scrapling_url && keys.scrapling_url.trim().length > 0)
    ),
  };
}

export function exportVault(): string {
  const keys = loadKeys();
  return encryptText(JSON.stringify(keys));
}

export function importVault(encryptedData: string): void {
  const decrypted = decryptText(encryptedData);
  const keys = JSON.parse(decrypted);
  saveKeys(keys);
}

export function backupVault(): string {
  const backupDir = path.join(APP_STATE_DIR, '.nyx-backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `vault-${timestamp}.enc`);

  if (fs.existsSync(VAULT_FILE)) {
    fs.copyFileSync(VAULT_FILE, backupPath);
  } else {
    // If no vault exists yet, write empty encrypted file
    fs.writeFileSync(backupPath, encryptText(JSON.stringify({})), 'utf8');
  }

  // Keep up to 10 backups
  try {
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('vault-') && f.endsWith('.enc'))
      .sort();

    // Sort ascends, so oldest are at the beginning
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
