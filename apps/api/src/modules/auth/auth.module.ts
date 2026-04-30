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
        // Keys are PEM-encoded with literal `\n` escapes in env. Convert.
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

function pem(raw: string): string {
  return raw.replace(/\\n/g, '\n');
}
