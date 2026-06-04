import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Setup Mocks
const mockGetPassword = vi.fn();
const mockSetPassword = vi.fn();

vi.mock('keytar', () => ({
  default: {
    getPassword: (...args: any[]) => mockGetPassword(...args),
    setPassword: (...args: any[]) => mockSetPassword(...args),
  },
}));

const mockRun = vi.fn();
const mockGet = vi.fn();

const mockValues = vi.fn().mockReturnValue({ run: mockRun });
const mockWhere = vi.fn().mockReturnValue({ run: mockRun, get: mockGet });
const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });

const mockDbDelete = vi.fn().mockReturnValue({ where: mockWhere });
const mockDbInsert = vi.fn().mockReturnValue({ values: mockValues });
const mockDbSelect = vi.fn().mockReturnValue({ from: mockFrom });
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockSet });

vi.mock('../server/db/client.js', () => ({
  db: {
    delete: (...args: any[]) => mockDbDelete(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    select: (...args: any[]) => mockDbSelect(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
}));

// Mock FS to avoid touching disk
const mockExistsSync = vi.fn().mockReturnValue(true);
const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    existsSync: (...args: any[]) => mockExistsSync(...args),
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  };
});

// Import vault service functions after mock registration
import {
  encryptText,
  decryptText,
  loadKeys,
  saveKeys,
  createSessionToken,
  verifySessionToken,
  refreshSessionToken,
} from '../server/features/vault/vault.service.ts';

describe('KeyVault Feature Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Symmetric Encryption & Decryption', () => {
    it('encrypts and decrypts text successfully', () => {
      const originalText = 'my-secret-payload';
      const encrypted = encryptText(originalText);
      expect(encrypted).toContain(':');
      
      const decrypted = decryptText(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('throws error for invalid encrypted format', () => {
      expect(() => decryptText('invalid-format')).toThrow('Invalid vault encrypted format');
    });
  });

  describe('loadKeys & saveKeys', () => {
    it('saves keys to keytar and decrypts fallback successfully', async () => {
      const keys = { gemini: 'test-api-key' };
      mockSetPassword.mockResolvedValue(undefined);
      
      await saveKeys(keys);
      expect(mockSetPassword).toHaveBeenCalledWith('NYX_VAULT', 'api_keys', JSON.stringify(keys));
    });

    it('loads keys from keytar', async () => {
      const keys = { gemini: 'test-api-key' };
      mockGetPassword.mockResolvedValue(JSON.stringify(keys));

      const loaded = await loadKeys();
      expect(loaded).toEqual(keys);
    });
  });

  describe('Session Token Management', () => {
    it('creates session tokens and hashes them in sqlite', () => {
      const token = createSessionToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('verifies valid session token', () => {
      const token = 'session-token';
      const expiresAt = Date.now() + 10000;
      mockGet.mockReturnValue({
        id: '1',
        tokenHash: 'hashed',
        isStreamNonce: false,
        expiresAt,
      });

      const result = verifySessionToken(token);
      expect(result).toBe(true);
    });

    it('returns false for invalid or missing token', () => {
      const result = verifySessionToken(undefined);
      expect(result).toBe(false);
    });
  });
});
