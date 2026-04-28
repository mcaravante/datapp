import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { JwtGuard } from './jwt.guard';
import { RolesGuard } from './roles.decorator';

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
        signOptions: { algorithm: 'RS256', issuer: 'cdp-api' },
        verifyOptions: { algorithms: ['RS256'], issuer: 'cdp-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService, JwtGuard, RolesGuard],
  exports: [AuthService, TwoFactorService, JwtGuard, RolesGuard],
})
export class AuthModule {}

function pem(raw: string): string {
  return raw.replace(/\\n/g, '\n');
}
