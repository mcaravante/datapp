import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import type { Env } from '../../config/env';
import { PrismaService } from '../../db/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import type { AuthenticatedUser, JwtPayload } from './types';
import type { LoginResponse } from './dto/login.dto';

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

  /** Issue a signed JWT for the given user. Used by login + refresh. */
  signToken(user: AuthenticatedUser): { token: string; expiresIn: number } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant_id: user.tenantId,
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

  /**
   * Resolve email + password (+ optional TOTP) to an authenticated
   * user + JWT. Wrong email, wrong password, or inactive user all
   * surface as the same `Unauthorized` (no enumeration leak). When the
   * user has 2FA verified and the totp is missing/invalid we return
   * 401 with body `{ error: '2fa_required' }` so the client can prompt
   * for the code without restarting the password flow.
   */
  async login(email: string, password: string, totp?: string): Promise<LoginResponse> {
    const lowered = email.toLowerCase();
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

    // Run argon2 even on a missing user so timing leaks don't reveal which
    // emails exist. The dummy hash is the well-known argon2id encoding of
    // an empty string (different from any real password).
    const hash =
      user?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const ok = await AuthService.verifyPassword(password, hash);

    if (!user || !ok) {
      this.logger.debug(`Login failed for email hash ${this.shortHash(lowered)}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2FA gate: if the user has a verified TOTP, the code is mandatory.
    if (user.totpSecret?.verifiedAt) {
      if (!totp) {
        throw new HttpException(
          { error: '2fa_required', message: '2FA code required' },
          HttpStatus.UNAUTHORIZED,
        );
      }
      const secret = this.crypto.decrypt(Buffer.from(user.totpSecret.secretEncrypted));
      const codeOk = authenticator.check(totp.replace(/\s+/g, '').trim(), secret);
      if (!codeOk) {
        throw new HttpException(
          { error: '2fa_required', message: 'Invalid 2FA code' },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

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
    const { token, expiresIn } = this.signToken(principal);

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

  private shortHash(s: string): string {
    // Cheap, non-crypto fingerprint for log lines (so we don't log raw email).
    let h = 0;
    for (let i = 0; i < s.length; i += 1) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return `0x${(h >>> 0).toString(16)}`;
  }
}
