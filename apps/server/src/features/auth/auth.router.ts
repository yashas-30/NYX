import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
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

export const router: FastifyPluginAsync = async (app: FastifyInstance) => {

app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
  const { username, password } = registerSchema.parse(request.body);
  const user = await AuthService.register(username, password);
  return reply.code(201).send(user);
});

app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
  const { username, password } = loginSchema.parse(request.body);
  const result = await AuthService.login(username, password);
  if (!result.requiresMfa) {
    reply.cookie('nyx_session', result.sessionToken!, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }
  return reply.send(result);
});

app.post('/mfa/setup', async (request: FastifyRequest, reply: FastifyReply) => {
  // In a real app, you would extract the user ID from the authenticated session.
  // Assuming the user is already logged in for MFA setup.
  const { userId } = request.body as { userId: string };
  const result = await AuthService.generateMfaSecret(userId);
  return reply.send(result);
});

app.post('/mfa/setup/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
  const { userId, code } = request.body as { userId: string; code: string };
  const result = await AuthService.enableMfa(userId, code);
  return reply.send(result);
});

app.post('/mfa/verify', async (request: FastifyRequest, reply: FastifyReply) => {
  const { mfaTempToken, code } = mfaVerifySchema.parse(request.body);
  const result = await AuthService.verifyMfaLogin(mfaTempToken, code);

  reply.cookie('nyx_session', result.sessionToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  return reply.send({ success: true });
});



};
