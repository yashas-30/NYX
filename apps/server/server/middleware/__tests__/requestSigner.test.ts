import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { requestSignerMiddleware } from '../requestSigner.js';
import { getRequestSignerSecrets } from '../../features/vault/vault.service.js';
import { env } from '../../config/env.js';

// Mock getRequestSignerSecrets
vi.mock('../../features/vault/vault.service.js', () => ({
  getRequestSignerSecrets: vi.fn(),
}));

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    ENFORCE_REQUEST_SIGNATURE: true,
  },
}));

describe('requestSignerMiddleware', () => {
  let mockRequest: any;
  let mockReply: any;
  const mockSecrets = {
    current: 'global-secret-current-12345',
    previous: 'global-secret-previous-67890',
    rotatedAt: Date.now(),
  };
  const mockSessionToken = 'session-token-abc-xyz';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequestSignerSecrets).mockResolvedValue(mockSecrets);
    env.ENFORCE_REQUEST_SIGNATURE = true;

    mockRequest = {
      url: '/api/v1/agents/chat',
      method: 'POST',
      headers: {},
      body: { prompt: 'test prompt' },
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  const generateSignature = (
    method: string,
    path: string,
    timestamp: number,
    body: any,
    sessionToken: string,
    globalSecret: string
  ) => {
    const derivedUserKey = crypto
      .createHmac('sha256', globalSecret)
      .update(sessionToken)
      .digest('hex');

    const payload = `${method}:${path}:${timestamp}:${
      body && Object.keys(body).length > 0 ? JSON.stringify(body) : ''
    }`;

    return crypto
      .createHmac('sha256', derivedUserKey)
      .update(payload)
      .digest('hex');
  };

  it('skips verification for public routes', async () => {
    mockRequest.url = '/api/v1/health';
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('skips verification for public routes with trailing slash', async () => {
    mockRequest.url = '/api/v1/health/';
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('skips verification for GET requests', async () => {
    mockRequest.method = 'GET';
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('passes if ENFORCE_REQUEST_SIGNATURE is false and signature/timestamp are missing', async () => {
    env.ENFORCE_REQUEST_SIGNATURE = false;
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('fails with 401 if ENFORCE_REQUEST_SIGNATURE is true and signature/timestamp are missing', async () => {
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing request signature' });
  });

  it('fails with 400 if timestamp is invalid (NaN)', async () => {
    mockRequest.headers['x-nyx-signature'] = 'somesig';
    mockRequest.headers['x-nyx-timestamp'] = 'not-a-number';
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid timestamp' });
  });

  it('fails with 401 if request is expired (clock skew > 5 mins)', async () => {
    mockRequest.headers['x-nyx-signature'] = 'somesig';
    mockRequest.headers['x-nyx-timestamp'] = String(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
  });

  it('fails with 401 if session token is missing', async () => {
    const timestamp = Date.now();
    mockRequest.headers['x-nyx-signature'] = 'somesig';
    mockRequest.headers['x-nyx-timestamp'] = String(timestamp);
    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing session token' });
  });

  it('verifies successfully with a valid signature and current secret', async () => {
    const timestamp = Date.now();
    const sig = generateSignature(
      'POST',
      '/api/v1/agents/chat',
      timestamp,
      mockRequest.body,
      mockSessionToken,
      mockSecrets.current
    );

    mockRequest.headers['x-nyx-signature'] = sig;
    mockRequest.headers['x-nyx-timestamp'] = String(timestamp);
    mockRequest.headers['authorization'] = `Bearer ${mockSessionToken}`;

    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('verifies successfully using the backup (previous) secret', async () => {
    const timestamp = Date.now();
    const sig = generateSignature(
      'POST',
      '/api/v1/agents/chat',
      timestamp,
      mockRequest.body,
      mockSessionToken,
      mockSecrets.previous
    );

    mockRequest.headers['x-nyx-signature'] = sig;
    mockRequest.headers['x-nyx-timestamp'] = String(timestamp);
    mockRequest.headers['authorization'] = `Bearer ${mockSessionToken}`;

    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).not.toHaveBeenCalled();
  });

  it('fails with 401 on signature mismatch', async () => {
    const timestamp = Date.now();
    mockRequest.headers['x-nyx-signature'] = 'deadbeef';
    mockRequest.headers['x-nyx-timestamp'] = String(timestamp);
    mockRequest.headers['authorization'] = `Bearer ${mockSessionToken}`;

    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid request signature' });
  });

  it('fails with 401 if signature is not valid hex', async () => {
    const timestamp = Date.now();
    mockRequest.headers['x-nyx-signature'] = { invalid: 'type' } as any;
    mockRequest.headers['x-nyx-timestamp'] = String(timestamp);
    mockRequest.headers['authorization'] = `Bearer ${mockSessionToken}`;

    await requestSignerMiddleware(mockRequest, mockReply);
    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid request signature format' });
  });
});
