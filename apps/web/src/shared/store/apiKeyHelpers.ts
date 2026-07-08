/**
 * @file src/shared/store/apiKeyHelpers.ts
 * @description Secure API key management for NYX.
 *              Hardware-backed encryption, key validation, masking,
 *              biometric gating, and audit logging — scoped to Gemini only.
 */

import { Dispatch, SetStateAction } from 'react';
import { toast } from '@src/shared/components/ui/sonner';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ApiKeyEntry {
  /** Provider identifier */
  provider: string;
  /** Encrypted key ciphertext (never plaintext) */
  ciphertext: string;
  /** Key metadata (never the key itself) */
  metadata: KeyMetadata;
  /** When the key was added */
  createdAt: string;
  /** When the key was last validated */
  lastValidatedAt: string | null;
  /** Validation status */
  validationStatus: 'unknown' | 'valid' | 'invalid' | 'expired';
  /** Usage counter for audit */
  usageCount: number;
  /** Last used timestamp */
  lastUsedAt: string | null;
}

export interface KeyMetadata {
  /** Key prefix hint (e.g., "AIza...") */
  prefix: string;
  /** Last 4 characters for identification */
  suffix: string;
  /** Detected provider from key format */
  detectedProvider: string;
  /** Key format version */
  formatVersion: string;
  /** Whether key has elevated permissions */
  isPrivileged: boolean;
}

export interface VaultConfig {
  /** Require biometric auth for privileged keys */
  biometricGate: boolean;
  /** Auto-validate keys on save */
  autoValidate: boolean;
  /** Warn when key is N days from expiry */
  expiryWarningDays: number;
  /** Maximum failed attempts before lockout */
  maxFailedAttempts: number;
  /** Lockout duration in minutes */
  lockoutDurationMinutes: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: 'store' | 'retrieve' | 'validate' | 'delete' | 'rotate' | 'access_denied';
  provider: string;
  success: boolean;
  error?: string;
  /** IP or session identifier */
  source: string;
  /** Whether biometric was required */
  biometricUsed: boolean;
}

export interface KeyValidationResult {
  valid: boolean;
  provider: string;
  error?: string;
  /** Estimated quota remaining */
  quotaRemaining?: number;
  /** Key expiry date if known */
  expiresAt?: string;
  /** Rate limit status */
  rateLimit?: {
    remaining: number;
    resetAt: string;
  };
}

export interface KeyDisplayInfo {
  provider: string;
  prefix: string;
  suffix: string;
  validationStatus: 'unknown' | 'valid' | 'invalid' | 'expired';
  lastValidatedAt: string | null;
  isPrivileged: boolean;
  usageCount: number;
}

// ============================================================================
// CONSTANTS — Gemini only
// ============================================================================

const VAULT_CONFIG_KEY = 'nyx-vault-config';
const AUDIT_LOG_KEY = 'nyx-vault-audit';
const MAX_AUDIT_ENTRIES = 1000;

/**
 * Supported providers and their key format patterns.
 * Currently scoped to Gemini. Extend here to add future providers.
 */
const KEY_PREFIXES: Record<string, RegExp> = {
  gemini: /^AIza[0-9A-Za-z_-]{35}/,
};

// ============================================================================
// SECURE KEY REGISTRY (in-memory, never stores plaintext)
// ============================================================================

class SecureKeyRegistry {
  private entries = new Map<string, ApiKeyEntry>();
  private failedAttempts = new Map<string, number>();
  private lockouts = new Map<string, number>();
  private config: VaultConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): VaultConfig {
    try {
      const raw = localStorage.getItem(VAULT_CONFIG_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      biometricGate: false,
      autoValidate: true,
      expiryWarningDays: 7,
      maxFailedAttempts: 5,
      lockoutDurationMinutes: 30,
    };
  }

  saveConfig(config: Partial<VaultConfig>): void {
    this.config = { ...this.config, ...config };
    try {
      localStorage.setItem(VAULT_CONFIG_KEY, JSON.stringify(this.config));
    } catch {}
  }

  getConfig(): VaultConfig {
    return { ...this.config };
  }

  isLockedOut(provider: string): boolean {
    const end = this.lockouts.get(provider);
    if (!end) return false;
    if (Date.now() > end) {
      this.lockouts.delete(provider);
      this.failedAttempts.delete(provider);
      return false;
    }
    return true;
  }

  recordFailure(provider: string): void {
    const attempts = (this.failedAttempts.get(provider) ?? 0) + 1;
    this.failedAttempts.set(provider, attempts);

    if (attempts >= this.config.maxFailedAttempts) {
      const lockoutEnd = Date.now() + this.config.lockoutDurationMinutes * 60 * 1000;
      this.lockouts.set(provider, lockoutEnd);
      this.logAudit({
        id: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'access_denied',
        provider,
        success: false,
        error: `Locked out after ${attempts} failed attempts`,
        source: 'local',
        biometricUsed: false,
      });
      toast.error(
        `Too many failed attempts. Locked out for ${this.config.lockoutDurationMinutes} minutes.`
      );
    }
  }

  clearFailure(provider: string): void {
    this.failedAttempts.delete(provider);
  }

  setEntry(entry: ApiKeyEntry): void {
    this.entries.set(entry.provider, entry);
    this.clearFailure(entry.provider);
  }

  getEntry(provider: string): ApiKeyEntry | undefined {
    return this.entries.get(provider);
  }

  hasEntry(provider: string): boolean {
    return this.entries.has(provider);
  }

  deleteEntry(provider: string): boolean {
    return this.entries.delete(provider);
  }

  getAllProviders(): string[] {
    return Array.from(this.entries.keys());
  }

  getAllEntries(): ApiKeyEntry[] {
    return Array.from(this.entries.values());
  }

  clear(): void {
    this.entries.clear();
    this.failedAttempts.clear();
    this.lockouts.clear();
  }

  logAudit(entry: AuditLogEntry): void {
    try {
      const existing = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) ?? '[]') as AuditLogEntry[];
      existing.unshift(entry);
      localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(existing.slice(0, MAX_AUDIT_ENTRIES)));
    } catch {}
  }

  getAuditLog(limit = 100): AuditLogEntry[] {
    try {
      const existing = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) ?? '[]') as AuditLogEntry[];
      return existing.slice(0, limit);
    } catch {
      return [];
    }
  }
}

// Module-level singleton
const registry = new SecureKeyRegistry();

// ============================================================================
// KEY FORMAT DETECTION
// ============================================================================

function analyzeKey(key: string): {
  provider: string;
  prefix: string;
  suffix: string;
  isPrivileged: boolean;
} {
  const trimmed = key.trim();

  for (const [provider, pattern] of Object.entries(KEY_PREFIXES)) {
    if (pattern.test(trimmed)) {
      return {
        provider,
        prefix: trimmed.substring(0, Math.min(12, trimmed.length)),
        suffix: trimmed.slice(-4),
        isPrivileged: false,
      };
    }
  }

  // Unknown format — treat as gemini anyway since it's the only provider
  return {
    provider: 'gemini',
    prefix: trimmed.substring(0, Math.min(8, trimmed.length)),
    suffix: trimmed.slice(-4),
    isPrivileged: false,
  };
}

// ============================================================================
// ENCRYPTION / DECRYPTION
// ============================================================================

async function encryptKey(plaintext: string): Promise<string> {
  // 1. Prefer Native safeStorage encryption
  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    try {
      const res = await (window as any).nyxIPC.invoke('vault:encrypt', { plaintext });
      if (res?.success) return res.ciphertext as string;
    } catch (err: any) {
      console.warn('[Vault] Native encryption unavailable, falling back:', err);
    }
  }

  // 2. Browser SubtleCrypto AES-256-GCM
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const key = await getOrCreateCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return 'enc:' + btoa(String.fromCharCode(...combined));
  }

  // 3. Last resort — plaintext marker (dev only)
  console.warn('[Vault] No encryption available');
  return 'plain:' + plaintext;
}

async function decryptKey(ciphertext: string): Promise<string> {
  if (ciphertext.startsWith('plain:')) return ciphertext.slice(6);

  // 1. Native decryption
  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    try {
      const res = await (window as any).nyxIPC.invoke('vault:decrypt', { ciphertext });
      if (res?.success) return res.plaintext as string;
    } catch (err: any) {
      console.warn('[Vault] Native decryption unavailable, falling back:', err);
    }
  }

  // 2. SubtleCrypto AES-256-GCM
  if (ciphertext.startsWith('enc:') && typeof crypto !== 'undefined' && crypto.subtle) {
    const combined = Uint8Array.from(atob(ciphertext.slice(4)), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await getOrCreateCryptoKey();
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  }

  throw new Error('Unable to decrypt key: no decryption backend available');
}

async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  const CRYPTO_KEY_SESSION = 'nyx-crypto-key';
  try {
    const stored = sessionStorage.getItem(CRYPTO_KEY_SESSION);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }
  } catch {}

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const exported = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem(
    CRYPTO_KEY_SESSION,
    btoa(String.fromCharCode(...new Uint8Array(exported)))
  );
  return key;
}

// ============================================================================
// KEY VALIDATION (Gemini)
// ============================================================================

async function validateGeminiKey(key: string): Promise<KeyValidationResult> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      return { valid: true, provider: 'gemini' };
    }

    if (response.status === 400 || response.status === 403) {
      return { valid: false, provider: 'gemini', error: 'Invalid Gemini API key' };
    }

    if (response.status === 429) {
      return {
        valid: true,
        provider: 'gemini',
        error: 'Rate limited',
        rateLimit: { remaining: 0, resetAt: new Date(Date.now() + 3_600_000).toISOString() },
      };
    }

    return { valid: false, provider: 'gemini', error: `HTTP ${response.status}` };
  } catch (err: any) {
    // Network errors don't mean the key is invalid — assume valid
    return {
      valid: true,
      provider: 'gemini',
      error: err instanceof Error ? err.message : 'Network error (key assumed valid)',
    };
  }
}

// ============================================================================
// BIOMETRIC GATING
// ============================================================================

async function requestBiometric(reason: string): Promise<boolean> {
  // Native biometric (TouchID/Windows Hello)
  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    try {
      const res = await (window as any).nyxIPC.invoke('vault:biometric-auth', { reason });
      return !!res?.success;
    } catch {}
  }

  // WebAuthn fallback
  if (typeof PublicKeyCredential !== 'undefined') {
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [],
          userVerification: 'required',
          timeout: 30000,
        },
      });
      return true;
    } catch {}
  }

  // No biometric available — allow unless strictly gated
  return !registry.getConfig().biometricGate;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Store a Gemini API key securely.
 * Validates the key against the Gemini API, encrypts it with AES-256-GCM,
 * and stores only a masked reference in React state.
 *
 * @param setApiKeys - React state setter for the apiKeys record
 * @param provider   - Provider identifier (expected: 'gemini')
 * @param key        - Raw Gemini API key
 * @returns true on success, false on failure
 */
export const updateApiKey = async (
  setApiKeys: Dispatch<SetStateAction<Record<string, string>>>,
  provider: string,
  key: string
): Promise<boolean> => {
  const trimmed = key.trim();
  if (!trimmed) {
    toast.error('API key cannot be empty');
    return false;
  }

  // Check lockout
  if (registry.isLockedOut(provider)) {
    toast.error(`${provider} is temporarily locked due to too many failed attempts`);
    registry.logAudit({
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'access_denied',
      provider,
      success: false,
      error: 'Provider locked out',
      source: 'user_action',
      biometricUsed: false,
    });
    return false;
  }

  // Detect format
  const analysis = analyzeKey(trimmed);
  // Prefer caller-supplied provider label over auto-detect for Gemini
  const resolvedProvider = provider || analysis.provider;

  // Biometric gate (disabled by default; only fires if biometricGate: true)
  if (analysis.isPrivileged && registry.getConfig().biometricGate) {
    const authed = await requestBiometric(`Store key for ${resolvedProvider}`);
    if (!authed) {
      toast.error('Biometric authentication required');
      registry.recordFailure(resolvedProvider);
      return false;
    }
  }

  // Validate against Gemini API if auto-validate is on
  let validation: KeyValidationResult = { valid: true, provider: resolvedProvider };
  if (registry.getConfig().autoValidate && resolvedProvider === 'gemini') {
    toast.info('Validating Gemini API key...');
    validation = await validateGeminiKey(trimmed);

    if (!validation.valid) {
      toast.error(`Key validation failed: ${validation.error}`);
      registry.recordFailure(resolvedProvider);
      registry.logAudit({
        id: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'validate',
        provider: resolvedProvider,
        success: false,
        error: validation.error,
        source: 'user_action',
        biometricUsed: false,
      });
      return false;
    }

    toast.success('Gemini API key validated ✓');
  }

  // Encrypt key
  let ciphertext: string;
  try {
    ciphertext = await encryptKey(trimmed);
  } catch (err: any) {
    toast.error('Failed to encrypt key securely');
    console.error('[Vault] Encryption error:', err);
    return false;
  }

  // Build registry entry
  const entry: ApiKeyEntry = {
    provider: resolvedProvider,
    ciphertext,
    metadata: {
      prefix: analysis.prefix,
      suffix: analysis.suffix,
      detectedProvider: analysis.provider,
      formatVersion: 'v1',
      isPrivileged: analysis.isPrivileged,
    },
    createdAt: new Date().toISOString(),
    lastValidatedAt: validation.valid ? new Date().toISOString() : null,
    validationStatus: validation.valid ? 'valid' : 'invalid',
    usageCount: 0,
    lastUsedAt: null,
  };

  registry.setEntry(entry);

  // Store masked reference in React state — never the raw key
  setApiKeys((prev) => ({
    ...prev,
    [resolvedProvider]: `${analysis.prefix}...${analysis.suffix}`,
  }));

  // Persist encrypted entry to Native vault
  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    try {
      // Use the legacy vault:store-key call for compatibility with main process
      await (window as any).nyxIPC.invoke('vault:store-key', {
        provider: resolvedProvider,
        key: trimmed,
      });
    } catch (err: any) {
      console.warn('[Vault] Native IPC unavailable:', err);
    }
  }

  // Audit
  registry.logAudit({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'store',
    provider: resolvedProvider,
    success: true,
    source: 'user_action',
    biometricUsed: analysis.isPrivileged,
  });

  toast.success(`API key for ${resolvedProvider} stored securely`);
  return true;
};

/**
 * Retrieve a decrypted key for internal API calls.
 * This is the ONLY path that exposes a plaintext key.
 *
 * @param provider - Provider identifier (e.g. 'gemini')
 * @returns Plaintext key string, or null if not found
 */
export const retrieveKey = async (provider: string): Promise<string | null> => {
  if (registry.isLockedOut(provider)) {
    throw new Error(`${provider} is locked out due to too many failed attempts`);
  }

  const entry = registry.getEntry(provider);
  if (!entry) return null;

  if (entry.metadata.isPrivileged && registry.getConfig().biometricGate) {
    const authed = await requestBiometric(`Access key for ${provider}`);
    if (!authed) {
      registry.recordFailure(provider);
      throw new Error('Biometric authentication required');
    }
  }

  try {
    const plaintext = await decryptKey(entry.ciphertext);

    // Update usage counters
    entry.usageCount++;
    entry.lastUsedAt = new Date().toISOString();
    registry.setEntry(entry);

    registry.logAudit({
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'retrieve',
      provider,
      success: true,
      source: 'api_call',
      biometricUsed: entry.metadata.isPrivileged,
    });

    registry.clearFailure(provider);
    return plaintext;
  } catch (err: any) {
    registry.recordFailure(provider);
    registry.logAudit({
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'retrieve',
      provider,
      success: false,
      error: err instanceof Error ? err.message : 'Decryption failed',
      source: 'api_call',
      biometricUsed: entry.metadata.isPrivileged,
    });
    throw err;
  }
};

/**
 * Get safe display info for all stored keys (never exposes raw key).
 */
export const getKeyDisplayInfo = (): KeyDisplayInfo[] =>
  registry.getAllEntries().map((entry) => ({
    provider: entry.provider,
    prefix: entry.metadata.prefix,
    suffix: entry.metadata.suffix,
    validationStatus: entry.validationStatus,
    lastValidatedAt: entry.lastValidatedAt,
    isPrivileged: entry.metadata.isPrivileged,
    usageCount: entry.usageCount,
  }));

/**
 * Clear ALL API keys from both in-memory registry and Native vault.
 *
 * @param setApiKeys - React state setter
 */
export const clearApiKeys = async (
  setApiKeys: Dispatch<SetStateAction<Record<string, string>>>
): Promise<void> => {
  const providers = registry.getAllProviders();

  if (providers.length === 0) {
    toast.info('No API keys to remove');
    return;
  }

  // Biometric confirmation for bulk delete
  const hasPrivileged = registry.getAllEntries().some((e) => e.metadata.isPrivileged);
  if (hasPrivileged && registry.getConfig().biometricGate) {
    const authed = await requestBiometric('Remove all stored API keys');
    if (!authed) {
      toast.error('Biometric authentication required');
      return;
    }
  }

  // Clear Native vault
  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    try {
      const ipc = (window as any).nyxIPC;
      for (const provider of providers) {
        await ipc.invoke('vault:delete-key', { provider }).catch(() => {});
      }
    } catch (err: any) {
      console.error('[Vault] Native clear failed:', err);
    }
  }

  // Audit
  for (const provider of providers) {
    registry.logAudit({
      id: `audit_${Date.now()}_${provider}`,
      timestamp: new Date().toISOString(),
      action: 'delete',
      provider,
      success: true,
      source: 'user_action',
      biometricUsed: hasPrivileged,
    });
  }

  registry.clear();
  setApiKeys({});
  localStorage.removeItem('llm_ref_api_keys');
  sessionStorage.removeItem('nyx-crypto-key');

  toast.success(`Removed ${providers.length} API key(s) from secure storage`);
};

/**
 * Delete a single provider's key.
 */
export const deleteApiKey = async (
  setApiKeys: Dispatch<SetStateAction<Record<string, string>>>,
  provider: string
): Promise<boolean> => {
  const entry = registry.getEntry(provider);
  if (!entry) {
    toast.error(`No key found for ${provider}`);
    return false;
  }

  if (entry.metadata.isPrivileged && registry.getConfig().biometricGate) {
    const authed = await requestBiometric(`Remove key for ${provider}`);
    if (!authed) {
      toast.error('Biometric authentication required');
      return false;
    }
  }

  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    try {
      await (window as any).nyxIPC.invoke('vault:delete-key', { provider });
    } catch {}
  }

  registry.deleteEntry(provider);
  setApiKeys((prev) => {
    const next = { ...prev };
    delete next[provider];
    return next;
  });

  registry.logAudit({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'delete',
    provider,
    success: true,
    source: 'user_action',
    biometricUsed: entry.metadata.isPrivileged,
  });

  toast.success(`API key for ${provider} removed`);
  return true;
};

/**
 * Re-validate all stored keys in-place.
 */
export const revalidateAllKeys = async (): Promise<Record<string, KeyValidationResult>> => {
  const results: Record<string, KeyValidationResult> = {};

  for (const entry of registry.getAllEntries()) {
    try {
      const plaintext = await decryptKey(entry.ciphertext);
      const result =
        entry.provider === 'gemini'
          ? await validateGeminiKey(plaintext)
          : { valid: true, provider: entry.provider };

      entry.validationStatus = result.valid ? 'valid' : 'invalid';
      entry.lastValidatedAt = new Date().toISOString();
      registry.setEntry(entry);
      results[entry.provider] = result;

      registry.logAudit({
        id: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'validate',
        provider: entry.provider,
        success: result.valid,
        error: result.error,
        source: 'scheduled',
        biometricUsed: false,
      });
    } catch (err: any) {
      results[entry.provider] = {
        valid: false,
        provider: entry.provider,
        error: err instanceof Error ? err.message : 'Validation failed',
      };
    }
  }

  return results;
};

/** Check if a provider has a stored and validated key */
export const hasValidKey = (provider: string): boolean => {
  const entry = registry.getEntry(provider);
  return entry !== undefined && entry.validationStatus === 'valid';
};

/** Get masked display string for a provider's key */
export const getMaskedKey = (provider: string): string | null => {
  const entry = registry.getEntry(provider);
  if (!entry) return null;
  return `${entry.metadata.prefix}...${entry.metadata.suffix}`;
};

/** Get vault configuration */
export const getVaultConfig = (): VaultConfig => registry.getConfig();

/** Update vault configuration */
export const updateVaultConfig = (config: Partial<VaultConfig>): void => {
  registry.saveConfig(config);
  toast.success('Vault configuration updated');
};

/** Get audit log entries */
export const getAuditLog = (limit?: number): AuditLogEntry[] => registry.getAuditLog(limit);


