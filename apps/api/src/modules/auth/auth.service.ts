import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import type { Env } from '../../config/env';
import { PrismaService } from '../../db/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { LoginThrottlerService } from './login-throttler.service';
import { RecoveryCodeService } from './recovery-code.service';
import { SessionsService } from './sessions.service';
import type { AuthenticatedUser, JwtPayload } from './types';
import type { LoginResponse } from './dto/login.dto';

export interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
}

export type LoginSource = 'password' | 'oauth_google';

/** User row fields the auth flow needs. Shared by credentials + OAuth. */
export interface AuthUserRow {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'analyst' | 'viewer';
  totpSecret: { secretEncrypted: Uint8Array; verifiedAt: Date | null } | null;
}

/** JWT lifetime, in seconds. 8h is comfortable for an admin session. */
export const TOKEN_TTL_SECONDS = 8 * 60 * 60;

const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP 2024 minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

// Same window used by TwoFactorService — keeps login + enrollment
// behavior identical.
authenticator.options = { window: 1 };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionsService,
    private readonly throttler: LoginThrottlerService,
    private readonly recoveryCodes: RecoveryCodeService,
    private readonly audit: AuditService,
  ) {}

  /** Hash a password with argon2id. Returns the encoded hash string. */
  static async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON_OPTIONS);
  }

  /** Verify a password against a stored hash. Returns true/false. */
  static async verifyPassword(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Issue a signed JWT and a matching `Session` row. Caller passes the
   * jti (= session.id) so revocation is a single DB delete.
   */
  signToken(user: AuthenticatedUser, jti: string): { token: string; expiresIn: number } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant_id: user.tenantId,
      jti,
    };
    const token = this.jwt.sign(payload, {
      algorithm: 'RS256',
      issuer: 'cdp-api',
      expiresIn: TOKEN_TTL_SECONDS,
    });
    return { token, expiresIn: TOKEN_TTL_SECONDS };
  }

  /** Verify and decode a JWT. Throws on any failure. */
  verifyToken(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      algorithms: ['RS256'],
      issuer: 'cdp-api',
    });
  }

  /** True iff the user has a verified TOTP secret. */
  hasTwoFactor(user: AuthUserRow): boolean {
    return user.totpSecret?.verifiedAt != null;
  }

  /**
   * Check a TOTP code (or single-use recovery code) for a user with
   * verified 2FA. Records audit + throttler on failure. Returns a
   * tagged success/failure object so the caller can audit the
   * recovery-code-used event correctly.
   */
  async checkTwoFactor(
    user: AuthUserRow,
    ctx: LoginContext | undefined,
    options: { totp?: string; recoveryCode?: string },
  ): Promise<{ ok: true; usedRecoveryCode: boolean } | { ok: false }> {
    if (!this.hasTwoFactor(user)) return { ok: true, usedRecoveryCode: false };
    if (!user.totpSecret) return { ok: false };

    const totp = options.totp;
    const recoveryCode = options.recoveryCode;
    let ok = false;
    let usedRecoveryCode = false;

    if (totp) {
      const secret = this.crypto.decrypt(Buffer.from(user.totpSecret.secretEncrypted));
      ok = authenticator.check(totp.replace(/\s+/g, '').trim(), secret);
    } else if (recoveryCode) {
      ok = await this.recoveryCodes.consume(user.id, recoveryCode);
      usedRecoveryCode = ok;
    }

    if (!ok) {
      await this.throttler.recordFailure(user.email.toLowerCase(), {
        userId: user.id,
        tenantId: user.tenantId,
        ip: ctx?.ip ?? null,
      });
      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'login_failed',
        entity: 'auth',
        entityId: user.id,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        after: { reason: recoveryCode ? 'wrong_recovery_code' : 'wrong_totp' },
      });
      return { ok: false };
    }

    if (usedRecoveryCode) {
      const remaining = await this.recoveryCodes.remaining(user.id);
      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'recovery_code_used',
        entity: 'auth.two_factor',
        entityId: user.id,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        after: { remaining },
      });
    }

    return { ok: true, usedRecoveryCode };
  }

  /**
   * Mint a new session JWT for a user that has already passed every
   * authentication factor. Emits the `login` audit row, clears the
   * email lockout counter, and updates `last_login_at`.
   *
   * Used by the credentials login (after password+TOTP) and the OAuth
   * flow (after Google id_token verification + optional 2FA challenge).
   */
  async issueSessionAfterAuth(
    user: AuthUserRow,
    ctx: LoginContext | undefined,
    source: LoginSource,
  ): Promise<LoginResponse> {
    await this.throttler.recordSuccess(user.email.toLowerCase());

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const principal: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
    const sessionId = await this.sessions.issue({
      userId: user.id,
      expiresAt,
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });
    const { token, expiresIn } = this.signToken(principal, sessionId);

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'login',
      entity: 'auth',
      entityId: user.id,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      after: { session_id: sessionId, source },
    });

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      user: {
        id: principal.id,
        email: principal.email,
        name: principal.name,
        role: principal.role,
        tenant_id: principal.tenantId,
      },
    };
  }

  /**
   * Resolve email + password (+ optional TOTP / recovery code) to an
   * authenticated user + JWT. Wrong email, wrong password, or a NULL
   * `password_hash` (Google-only user) all surface as the same
   * `Unauthorized`. When 2FA is on, we either consume the provided code
   * or surface 401 `2fa_required`.
   */
  async login(
    email: string,
    password: string,
    totp?: string,
    ctx?: LoginContext,
    recoveryCode?: string,
  ): Promise<LoginResponse> {
    const lowered = email.toLowerCase();

    // Step 1 — IP rate-limit + email lockout. Both throw 429.
    await this.throttler.assertNotThrottled(ctx?.ip ?? null, lowered);

    const user = await this.prisma.user.findUnique({
      where: { email: lowered },
      select: {
        id: true,
        tenantId: true,
        email: true,
        passwordHash: true,
        name: true,
        role: true,
        totpSecret: { select: { secretEncrypted: true, verifiedAt: true } },
      },
    });

    // Run argon2 even on a missing user (or a Google-only user with
    // NULL password_hash) so timing leaks don't reveal which emails
    // exist or how they're configured.
    const hash =
      user?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const ok = await AuthService.verifyPassword(password, hash);

    if (!user || !user.passwordHash || !ok) {
      this.logger.debug(`Login failed for email hash ${this.shortHash(lowered)}`);
      await this.throttler.recordFailure(
        lowered,
        user
          ? { userId: user.id, tenantId: user.tenantId, ip: ctx?.ip ?? null }
          : undefined,
      );
      // Only audit when we recognize the email — keeps the log from
      // bloating with random enumeration attempts.
      if (user) {
        await this.audit.log({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'login_failed',
          entity: 'auth',
          entityId: user.id,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          after: { reason: user.passwordHash ? 'wrong_password' : 'no_password_set' },
        });
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2FA gate
    if (this.hasTwoFactor(user)) {
      if (!totp && !recoveryCode) {
        throw new HttpException(
          { error: '2fa_required', message: '2FA code required' },
          HttpStatus.UNAUTHORIZED,
        );
      }
      const result = await this.checkTwoFactor(user, ctx, {
        ...(totp ? { totp } : {}),
        ...(recoveryCode ? { recoveryCode } : {}),
      });
      if (!result.ok) {
        throw new HttpException(
          { error: '2fa_required', message: 'Invalid 2FA code' },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    return this.issueSessionAfterAuth(user, ctx, 'password');
  }

  private shortHash(s: string): string {
    // Cheap, non-crypto fingerprint for log lines (so we don't log raw email).
    let h = 0;
    for (let i = 0; i < s.length; i += 1) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return `0x${(h >>> 0).toString(16)}`;
  }
}
