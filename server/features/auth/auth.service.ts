import { db } from '../../db/client.ts';
import { users, sessions } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verifySync } from 'otplib';
import crypto from 'crypto';
import { AppError } from '../../lib/errors.ts';
import { getKeysSync } from '../vault/vault.service.ts';

export class AuthService {
  /**
   * Registers a new user.
   */
  static async register(username: string, passwordPlain: string) {
    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing.length > 0) {
      throw new AppError(400, 'Username is already taken.', 'AUTH_USER_EXISTS');
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(passwordPlain, salt);

    const newUser = {
      id: crypto.randomUUID(),
      username,
      passwordHash,
      salt,
      mfaEnabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.insert(users).values(newUser);
    return { id: newUser.id, username: newUser.username };
  }

  /**
   * Validates credentials and returns an MFA token if MFA is enabled, or a session token otherwise.
   */
  static async login(username: string, passwordPlain: string) {
    const userRecords = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (userRecords.length === 0) {
      throw new AppError(401, 'Invalid username or password.', 'AUTH_INVALID_CREDENTIALS');
    }

    const user = userRecords[0];
    const isMatch = await bcrypt.compare(passwordPlain, user.passwordHash);

    if (!isMatch) {
      throw new AppError(401, 'Invalid username or password.', 'AUTH_INVALID_CREDENTIALS');
    }

    if (user.mfaEnabled) {
      // Issue a temporary token required for MFA verification
      const mfaTempToken = crypto.randomUUID();
      // Store in memory cache with 5 minute expiration (in a real prod app, use Redis)
      AuthService.mfaPendingTokens.set(mfaTempToken, {
        userId: user.id,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return { requiresMfa: true, mfaTempToken };
    }

    // Direct login
    return { requiresMfa: false, sessionToken: await AuthService.createSession(user.id) };
  }

  /**
   * Generates a new MFA secret for the user.
   */
  static async generateMfaSecret(userId: string) {
    const secret = generateSecret();
    await db
      .update(users)
      .set({ mfaSecret: secret, updatedAt: Date.now() })
      .where(eq(users.id, userId));
    const otpauth = generateURI({ issuer: 'NYX', label: 'user', secret });
    return { secret, otpauth };
  }

  /**
   * Confirms MFA setup with a code.
   */
  static async enableMfa(userId: string, code: string) {
    const userRecords = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRecords[0];

    if (!user || !user.mfaSecret) {
      throw new AppError(400, 'MFA secret not initialized.', 'AUTH_MFA_NOT_SETUP');
    }

    const isValid = verifySync({ token: code, secret: user.mfaSecret });
    if (!isValid) {
      throw new AppError(400, 'Invalid MFA code.', 'AUTH_MFA_INVALID');
    }

    await db
      .update(users)
      .set({ mfaEnabled: true, updatedAt: Date.now() })
      .where(eq(users.id, userId));
    return { success: true };
  }

  static mfaPendingTokens = new Map<string, { userId: string; expiresAt: number }>();

  /**
   * Verifies an MFA code during login.
   */
  static async verifyMfaLogin(mfaTempToken: string, code: string) {
    const pending = AuthService.mfaPendingTokens.get(mfaTempToken);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new AppError(401, 'MFA token expired or invalid.', 'AUTH_MFA_EXPIRED');
    }

    const userRecords = await db.select().from(users).where(eq(users.id, pending.userId)).limit(1);
    const user = userRecords[0];

    if (!user || !user.mfaSecret) {
      throw new AppError(400, 'MFA not configured for this user.', 'AUTH_MFA_NOT_SETUP');
    }

    const isValid = verifySync({ token: code, secret: user.mfaSecret });
    if (!isValid) {
      throw new AppError(400, 'Invalid MFA code.', 'AUTH_MFA_INVALID');
    }

    AuthService.mfaPendingTokens.delete(mfaTempToken);
    return { sessionToken: await AuthService.createSession(user.id) };
  }

  static async createSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    await db.insert(sessions).values({
      id: crypto.randomUUID(),
      tokenHash,
      isStreamNonce: false,
      expiresAt,
      createdAt: Date.now(),
    });

    return token;
  }
}
