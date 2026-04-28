import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthService } from './auth.service';
import { TwoFactorService, type EnrollmentResponse } from './two-factor.service';
import { CurrentUser } from './current-user.decorator';
import { JwtGuard } from './jwt.guard';
import { LoginRequestSchema, type LoginRequest, type LoginResponse } from './dto/login.dto';
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
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginRequestSchema))
  async login(@Body() body: LoginRequest): Promise<LoginResponse> {
    return this.auth.login(body.email, body.password, body.totp);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  logout(): void {
    // JWT statelessness: the client discards the token. Session-table
    // backed revocation lands in 2C-2B.
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
  }> {
    const has2fa = await this.twoFactor.isEnabled(user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant_id: user.tenantId,
      has_2fa: has2fa,
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

  /** Confirm enrollment by submitting a code from the authenticator. */
  @Post('2fa/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async verify2fa(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorVerifySchema)) body: TwoFactorVerifyBody,
  ): Promise<void> {
    await this.twoFactor.verify(user.id, body.code);
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
}
