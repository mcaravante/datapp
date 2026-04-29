import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Env } from '../../config/env';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { OAuthService, type OAuthLoginPending } from './oauth.service';
import { PasswordResetService } from './password-reset.service';
import { RecoveryCodeService } from './recovery-code.service';
import { SessionsService } from './sessions.service';
import { TwoFactorService, type EnrollmentResponse } from './two-factor.service';
import { CurrentUser } from './current-user.decorator';
import { JwtGuard } from './jwt.guard';
import { LoginRequestSchema, type LoginRequest, type LoginResponse } from './dto/login.dto';
import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  type ForgotPasswordBody,
  type ResetPasswordBody,
} from './dto/password-reset.dto';
import {
  GoogleOAuthSchema,
  OAuthChallengeSchema,
  type GoogleOAuthBody,
  type OAuthChallengeBody,
} from './dto/oauth.dto';
import type { AuthenticatedUser } from './types';

const TwoFactorVerifySchema = z.object({
  code: z.string().min(6).max(10),
});
type TwoFactorVerifyBody = z.infer<typeof TwoFactorVerifySchema>;

const TwoFactorDisableSchema = z.object({
  password: z.string().min(1).max(1024),
});
type TwoFactorDisableBody = z.infer<typeof TwoFactorDisableSchema>;

@Controller({ path: 'auth', version: '1' })
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
    private readonly passwordReset: PasswordResetService,
    private readonly recoveryCodes: RecoveryCodeService,
    private readonly oauth: OAuthService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginRequestSchema))
  async login(@Body() body: LoginRequest, @Req() req: Request): Promise<LoginResponse> {
    return this.auth.login(
      body.email,
      body.password,
      body.totp,
      {
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] ?? null,
      },
      body.recovery_code,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<void> {
    await this.sessions.revoke(user.sessionId);
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'session_revoked',
      entity: 'auth.session',
      entityId: user.sessionId ?? null,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      after: { reason: 'logout' },
    });
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    id: string;
    email: string;
    name: string;
    role: string;
    tenant_id: string | null;
    has_2fa: boolean;
    must_enable_2fa: boolean;
  }> {
    const has2fa = await this.twoFactor.isEnabled(user.id);
    const enforced = this.config.get('FEATURE_2FA_ENFORCED', { infer: true });
    const isPrivileged = user.role === 'super_admin' || user.role === 'admin';
    const mustEnable = enforced && isPrivileged && !has2fa;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant_id: user.tenantId,
      has_2fa: has2fa,
      must_enable_2fa: mustEnable,
    };
  }

  /**
   * Start 2FA enrollment for the active user. Returns the otpauth URL,
   * a QR data-URL, and the manual entry secret. The secret is staged
   * but not yet active until `verify` is called.
   */
  @Post('2fa/enroll')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async enroll2fa(@CurrentUser() user: AuthenticatedUser): Promise<EnrollmentResponse> {
    return this.twoFactor.enroll(user.id);
  }

  /**
   * Confirm enrollment by submitting a code from the authenticator.
   * Returns 10 single-use recovery codes — the only chance for the
   * user to see them. Anything not stored is unrecoverable.
   */
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async verify2fa(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorVerifySchema)) body: TwoFactorVerifyBody,
  ): Promise<{ recovery_codes: string[] }> {
    return this.twoFactor.verify(user.id, body.code);
  }

  /** Count of unused recovery codes — surfaced on the security panel. */
  @Get('2fa/recovery-codes/count')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async recoveryCodeCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ remaining: number }> {
    const remaining = await this.recoveryCodes.remaining(user.id);
    return { remaining };
  }

  /**
   * Re-issue a fresh batch of recovery codes. Requires the current
   * password (so a stolen session alone can't silently rotate them).
   * Old codes are wiped.
   */
  @Post('2fa/recovery-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async regenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorDisableSchema)) body: TwoFactorDisableBody,
  ): Promise<{ recovery_codes: string[] }> {
    const codes = await this.recoveryCodes.regenerate(user.id, body.password);
    return { recovery_codes: codes };
  }

  /**
   * Disable 2FA for the active user. Requires the current password
   * so a stolen session alone can't downgrade the account.
   */
  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async disable2fa(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorDisableSchema)) body: TwoFactorDisableBody,
  ): Promise<void> {
    await this.twoFactor.disable(user.id, body.password);
  }

  /**
   * Self-service password reset request. Always returns 204 — the body
   * never reveals whether the email is on file. Throttled per IP inside
   * PasswordResetService.
   */
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordBody,
    @Req() req: Request,
  ): Promise<void> {
    await this.passwordReset.requestReset(
      body.email,
      clientIp(req),
      req.headers['user-agent'] ?? null,
    );
  }

  /**
   * Consume the emailed token + apply the new password. Revokes every
   * existing session for the user inside the service.
   */
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordBody,
  ): Promise<void> {
    await this.passwordReset.resetPassword(body.token, body.password);
  }

  /**
   * Phase 1 of Google sign-in. Exchanges a verified Google id_token
   * for either a session JWT (no 2FA) or a 5-minute challenge token
   * that the caller redeems on `oauth/google/2fa` after collecting
   * the TOTP / recovery code.
   */
  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  async oauthGoogle(
    @Body(new ZodValidationPipe(GoogleOAuthSchema)) body: GoogleOAuthBody,
    @Req() req: Request,
  ): Promise<LoginResponse | OAuthLoginPending> {
    return this.oauth.loginWithGoogleIdToken(body.id_token, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  /** Phase 2 of Google sign-in — close the 2FA challenge. */
  @Post('oauth/google/2fa')
  @HttpCode(HttpStatus.OK)
  async oauthGoogleChallenge(
    @Body(new ZodValidationPipe(OAuthChallengeSchema)) body: OAuthChallengeBody,
    @Req() req: Request,
  ): Promise<LoginResponse> {
    return this.oauth.completeChallenge(body.challenge_token, body.totp, body.recovery_code, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}

function clientIp(req: Request): string | null {
  // Express respects `trust proxy`; we don't enable it (Cloudflare → app
  // is direct on the VPS). Read the standard headers defensively.
  const xff = req.headers['x-forwarded-for'];
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf.trim();
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0]?.trim() ?? null;
  return req.ip ?? req.socket.remoteAddress ?? null;
}
