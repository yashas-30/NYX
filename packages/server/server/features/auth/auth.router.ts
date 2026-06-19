import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { revokeSessionToken } from '../vault/vault.service.js';
import { AuditLog } from '../../lib/auditLog.js';
import { db } from '../../db/client.js';
import {
  users,
  sessions,
  chatConversations,
  codeConversations,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../config/env.js';

const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const mfaVerifySchema = z.object({
  mfaTempToken: z.string(),
  code: z.string().length(6),
});

export default async function authRouter(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const { username, password } = registerSchema.parse(request.body);
    const user = await AuthService.register(username, password);
    return reply.status(201).send(user);
  });

  app.post('/login', async (request, reply) => {
    const { username, password } = loginSchema.parse(request.body);
    const result = await AuthService.login(username, password);
    if (!result.requiresMfa) {
      reply.setCookie('nyx_session', result.sessionToken!, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      });
    }
    return reply.send(result);
  });

  app.post('/logout', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const revoked = revokeSessionToken(token);
    reply.clearCookie('nyx_session', { path: '/' });
    return reply.send({ success: revoked });
  });

  // ── GDPR Data Subject Endpoints ────────────────────────────────────

  /**
   * GET /data — Export all data for the authenticated user (GDPR Art. 15/20).
   * Accepts username + password to re-authenticate for sensitive access.
   */
  app.get('/data', async (request, reply) => {
    const { username, password } = request.query as { username?: string; password?: string };
    if (!username || !password) {
      return reply.code(401).send({ error: 'Username and password are required for data access' });
    }
    try {
      const userData = await AuthService.exportUserData(username, password);
      AuditLog.log({
        category: 'data_access',
        event: { action: 'export', username },
        status: 'success',
      });
      return reply.send(userData);
    } catch (err: any) {
      AuditLog.log({
        category: 'data_access',
        event: { action: 'export', username, error: err.message },
        status: 'failure',
      });
      return reply.code(403).send({ error: err.message });
    }
  });

  /**
   * DELETE /account — Erase user and all associated data (GDPR Art. 17).
   */
  app.delete('/account', async (request, reply) => {
    const { username, password } = request.body as { username?: string; password?: string };
    if (!username || !password) {
      return reply.code(401).send({ error: 'Username and password are required for account deletion' });
    }
    try {
      await AuthService.deleteUser(username, password);
      reply.clearCookie('nyx_session', { path: '/' });
      AuditLog.log({
        category: 'data_access',
        event: { action: 'erasure', username },
        status: 'success',
      });
      return reply.send({ success: true, message: 'Account and all associated data deleted' });
    } catch (err: any) {
      AuditLog.log({
        category: 'data_access',
        event: { action: 'erasure', username, error: err.message },
        status: 'failure',
      });
      return reply.code(403).send({ error: err.message });
    }
  });

  app.post('/mfa/setup', async (request, reply) => {
    // In a real app, you would extract the user ID from the authenticated session.
    // Assuming the user is already logged in for MFA setup.
    const { userId } = request.body as { userId: string };
    const result = await AuthService.generateMfaSecret(userId);
    return reply.send(result);
  });

  app.post('/mfa/setup/confirm', async (request, reply) => {
    const { userId, code } = request.body as { userId: string; code: string };
    const result = await AuthService.enableMfa(userId, code);
    return reply.send(result);
  });

  app.post('/mfa/verify', async (request, reply) => {
    const { mfaTempToken, code } = mfaVerifySchema.parse(request.body);
    const result = await AuthService.verifyMfaLogin(mfaTempToken, code);

    reply.setCookie('nyx_session', result.sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    return reply.send({ success: true });
  });
}
