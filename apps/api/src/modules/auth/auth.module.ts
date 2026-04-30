import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import IORedis from 'ioredis';
import type { Env } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_REDIS } from './auth.tokens';
import { LoginThrottlerService } from './login-throttler.service';
import { OAuthService } from './oauth.service';
import { PasswordResetService } from './password-reset.service';
import { RecoveryCodeService } from './recovery-code.service';
import { SessionsService } from './sessions.service';
import { TwoFactorService } from './two-factor.service';
import { JwtGuard } from './jwt.guard';
import { RolesGuard } from './roles.decorator';

/** Closes the dedicated Redis client on shutdown so the process exits cleanly. */
class AuthRedis extends IORedis implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await this.quit().catch(() => null);
  }
}

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // Accept three formats so the env var works with any deploy
        // platform's parser (Dokploy / Coolify / k8s secrets / .env):
        //   1. Plain multiline PEM (newlines preserved as-is).
        //   2. Single-line PEM with `\n` literal (legacy `.env` style).
        //   3. Base64-encoded PEM (single-line, no whitespace, no escape
        //      chars). Recommended for production deploys to avoid
        //      multi-line / escape interpretation pitfalls.
        privateKey: pem(config.get<string>('JWT_PRIVATE_KEY', { infer: true })),
        publicKey: pem(config.get<string>('JWT_PUBLIC_KEY', { infer: true })),
        signOptions: { algorithm: 'RS256', issuer: 'datapp-api' },
        verifyOptions: { algorithms: ['RS256'], issuer: 'datapp-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): IORedis =>
        new AuthRedis(config.get<string>('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: 3,
          enableAutoPipelining: true,
        }),
    },
    AuthService,
    SessionsService,
    LoginThrottlerService,
    PasswordResetService,
    RecoveryCodeService,
    OAuthService,
    TwoFactorService,
    JwtGuard,
    RolesGuard,
  ],
  exports: [
    AUTH_REDIS,
    AuthService,
    SessionsService,
    LoginThrottlerService,
    PasswordResetService,
    RecoveryCodeService,
    OAuthService,
    TwoFactorService,
    JwtGuard,
    RolesGuard,
  ],
})
export class AuthModule {}

/**
 * Normalize a PEM-encoded key value coming from env into the canonical
 * multi-line PEM string. Accepts three input shapes:
 *
 *   1. Multi-line PEM (already correct) — passed through.
 *   2. Single-line PEM with `\n` literals — `\n` chars get expanded
 *      back to real newlines.
 *   3. Base64-encoded PEM — decoded, then expected to be a multi-line
 *      PEM. This is the recommended shape for env vars in Dokploy /
 *      Coolify / any platform that mangles whitespace or escapes,
 *      because base64 has no whitespace or `\` characters.
 *
 * Detection is conservative: if the raw string contains the literal
 * "-----BEGIN" marker we treat it as PEM (cases 1 + 2); otherwise we
 * decode base64 first.
 */
function pem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return trimmed;
  if (trimmed.includes('-----BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  // Assume base64-encoded PEM. Strip whitespace just in case the env
  // platform inserted line wraps.
  const decoded = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) {
    throw new Error('JWT key env var does not look like a PEM or base64-encoded PEM');
  }
  return decoded;
}
