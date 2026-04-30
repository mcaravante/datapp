import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../../config/env';
import { PrismaService } from '../../db/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService, type AuthUserRow, type LoginContext } from './auth.service';
import { LoginThrottlerService } from './login-throttler.service';
import type { LoginResponse } from './dto/login.dto';

/** Short-lived signed token used between phase 1 (OAuth) and phase 2 (TOTP). */
const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_ISSUER = 'datapp-api-oauth-challenge';

export interface OAuthLoginPending {
  status: 'requires_2fa';
  challenge_token: string;
  email: string;
}

interface ChallengePayload {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
  iss?: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly google: OAuth2Client;
  private readonly clientId: string;
  private readonly ownerEmail: string;
  private readonly defaultTenantSlug: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly throttler: LoginThrottlerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    this.ownerEmail = this.config.get('OWNER_EMAIL', { infer: true }).toLowerCase();
    this.defaultTenantSlug = this.config.get('DEFAULT_TENANT_SLUG', { infer: true });
    this.google = new OAuth2Client(this.clientId.length > 0 ? this.clientId : undefined);
  }

  /**
   * Phase 1: verify the Google id_token, find (or bootstrap) the
   * matching local user, and either emit a session JWT directly or
   * return a short-lived challenge token when the user has 2FA on.
   *
   * The challenge token is itself an RS256 JWT but with a different
   * `iss` so the JwtGuard can never accept it as a session credential.
   */
  async loginWithGoogleIdToken(
    idToken: string,
    ctx?: LoginContext,
  ): Promise<LoginResponse | OAuthLoginPending> {
    if (this.clientId.length === 0) {
      throw new ForbiddenException('Google sign-in is not configured');
    }

    const payload = await this.verifyIdToken(idToken);
    const email = payload.email.toLowerCase();

    // IP / email throttling — same buckets as credentials login so an
    // attacker can't spam OAuth attempts to bypass the password lockout.
    await this.throttler.assertNotThrottled(ctx?.ip ?? null, email);

    const user = await this.findOrBootstrapUser(email, payload.name, ctx);

    if (!user) {
      // Email is not whitelisted (no row in user table, no owner match).
      // Don't audit — this is the equivalent of "wrong email" on
      // credentials login and the throttler already counted it.
      await this.throttler.recordFailure(email);
      this.logger.warn(`Google sign-in rejected for non-authorized email`);
      throw new UnauthorizedException('Email is not authorized to sign in');
    }

    if (this.auth.hasTwoFactor(user)) {
      // Mint a short-lived challenge token. The frontend redirects the
      // user to a TOTP page that calls completeChallenge() with this.
      const challenge_token = this.signChallenge(user);
      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'login',
        entity: 'auth',
        entityId: user.id,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        after: { source: 'oauth_google', stage: 'awaiting_2fa' },
      });
      return { status: 'requires_2fa', challenge_token, email: user.email };
    }

    return this.auth.issueSessionAfterAuth(user, ctx, 'oauth_google');
  }

  /**
   * Phase 2: redeem the challenge token + a TOTP (or recovery code) for
   * a real session JWT. Mirrors the 2FA gate of the credentials login.
   */
  async completeChallenge(
    challengeToken: string,
    totp: string | undefined,
    recoveryCode: string | undefined,
    ctx?: LoginContext,
  ): Promise<LoginResponse> {
    let payload: ChallengePayload;
    try {
      payload = this.jwt.verify<ChallengePayload>(challengeToken, {
        algorithms: ['RS256'],
        issuer: CHALLENGE_ISSUER,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantId: true,
        email: true,
        name: true,
        role: true,
        totpSecret: { select: { secretEncrypted: true, verifiedAt: true } },
      },
    });
    if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
      throw new UnauthorizedException('Challenge no longer valid');
    }

    await this.throttler.assertNotThrottled(ctx?.ip ?? null, user.email.toLowerCase());

    if (!totp && !recoveryCode) {
      throw new HttpException(
        { error: '2fa_required', message: '2FA code required' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.auth.checkTwoFactor(user, ctx, {
      ...(totp ? { totp } : {}),
      ...(recoveryCode ? { recoveryCode } : {}),
    });
    if (!result.ok) {
      throw new HttpException(
        { error: '2fa_required', message: 'Invalid 2FA code' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.auth.issueSessionAfterAuth(user, ctx, 'oauth_google');
  }

  // -------------------------------------------------------------------

  private async verifyIdToken(idToken: string): Promise<{
    email: string;
    name: string;
    sub: string;
  }> {
    let ticket;
    try {
      ticket = await this.google.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
    } catch (err) {
      this.logger.warn({ err }, 'Google id_token verification failed');
      throw new UnauthorizedException('Invalid Google credential');
    }
    const claims = ticket.getPayload();
    if (!claims) throw new UnauthorizedException('Invalid Google credential');
    if (claims.email_verified !== true) {
      // Refuse unverified Google accounts — otherwise an attacker
      // could spin up a Google Workspace and "verify" any address.
      throw new UnauthorizedException('Google email is not verified');
    }
    if (!claims.email || !claims.sub) {
      throw new UnauthorizedException('Google credential is missing required claims');
    }
    return {
      email: claims.email,
      name: claims.name ?? claims.email,
      sub: claims.sub,
    };
  }

  /**
   * Look up the user by email. If the email matches OWNER_EMAIL and no
   * row exists yet, bootstrap a super_admin. If a legacy `admin@*` row
   * exists with no Google-aligned email, migrate it to OWNER_EMAIL so
   * audit history follows the actual owner.
   */
  private async findOrBootstrapUser(
    email: string,
    name: string,
    _ctx?: LoginContext,
  ): Promise<AuthUserRow | null> {
    const lowered = email.toLowerCase();
    const direct = await this.prisma.user.findUnique({
      where: { email: lowered },
      select: this.userSelect(),
    });
    if (direct) return direct as AuthUserRow;

    if (this.ownerEmail.length === 0 || lowered !== this.ownerEmail) {
      return null;
    }

    // Bootstrap path. Resolve the default tenant; create one if missing.
    const tenant = await this.prisma.tenant.upsert({
      where: { slug: this.defaultTenantSlug },
      update: {},
      create: {
        slug: this.defaultTenantSlug,
        name: this.defaultTenantSlug,
      },
      select: { id: true },
    });

    // Migration: an existing seed user (typically `admin@cdp.local`,
    // role=admin) — migrate that single row to the owner's real email
    // and promote to super_admin, so existing audit logs / sessions
    // stay linked. Match either `admin` or `super_admin` because
    // different seed flavors use different defaults.
    const seedRow = await this.prisma.user.findFirst({
      where: {
        role: { in: ['admin', 'super_admin'] },
        tenantId: tenant.id,
      },
      orderBy: { createdAt: 'asc' },
      select: this.userSelect(),
    });

    if (seedRow) {
      const updated = await this.prisma.user.update({
        where: { id: seedRow.id },
        data: {
          email: lowered,
          name: name || seedRow.name,
          role: 'super_admin',
        },
        select: this.userSelect(),
      });
      this.logger.log(`Bootstrapped owner by migrating seed row ${seedRow.id} to ${lowered}`);
      await this.audit.log({
        tenantId: updated.tenantId,
        userId: updated.id,
        action: 'update',
        entity: 'user',
        entityId: updated.id,
        before: { email: seedRow.email, role: seedRow.role },
        after: { email: lowered, role: 'super_admin', reason: 'owner_bootstrap_migration' },
      });
      return updated as AuthUserRow;
    }

    const created = await this.prisma.user.create({
      data: {
        email: lowered,
        name: name || lowered,
        role: 'super_admin',
        tenantId: tenant.id,
        // Google-only — no password set. The user can add one later
        // via the standard password-reset flow if they want.
        passwordHash: null,
      },
      select: this.userSelect(),
    });
    this.logger.log(`Bootstrapped owner ${lowered} as super_admin`);
    await this.audit.log({
      tenantId: created.tenantId,
      userId: created.id,
      action: 'create',
      entity: 'user',
      entityId: created.id,
      after: { email: lowered, role: 'super_admin', source: 'owner_bootstrap' },
    });
    return created as AuthUserRow;
  }

  private signChallenge(user: AuthUserRow): string {
    const payload: ChallengePayload = {
      sub: user.id,
      email: user.email,
    };
    return this.jwt.sign(payload, {
      algorithm: 'RS256',
      issuer: CHALLENGE_ISSUER,
      expiresIn: CHALLENGE_TTL_SECONDS,
    });
  }

  private userSelect() {
    return {
      id: true,
      tenantId: true,
      email: true,
      name: true,
      role: true,
      totpSecret: { select: { secretEncrypted: true, verifiedAt: true } },
    } as const;
  }
}
