import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Environment Config Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitMock: any;
  let consoleErrorMock: any;

  beforeEach(() => {
    originalEnv = { ...process.env };
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    exitMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  it('successfully loads a valid environment config', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3010';
    process.env.DATABASE_URL = 'http://localhost:5432';

    const { env } = await import('../server/config/env.ts');

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3010);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('exits with 1 when environment variables are invalid', async () => {
    process.env.NODE_ENV = 'invalid-env' as any;

    try {
      await import('../server/config/env.ts');
    } catch (e) {
      // Expected import error or exit mock call
    }

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('exits with 1 in production if NYX_MASTER_KEY is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NYX_MASTER_KEY;

    try {
      await import('../server/config/env.ts');
    } catch (e) {
      // Expected import error or exit mock call
    }

    expect(exitMock).toHaveBeenCalledWith(1);
  });
});

