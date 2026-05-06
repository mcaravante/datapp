import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { TenantService, type TenantSettings } from './tenant.service';

const UpdateAllowedOriginsSchema = z.object({
  allowed_origins: z.array(z.string().min(1).max(255)).max(50),
});
type UpdateAllowedOriginsBody = z.infer<typeof UpdateAllowedOriginsSchema>;

@Controller({ path: 'admin/tenant', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:tenant')
export class TenantAdminController {
  constructor(private readonly tenant: TenantService) {}

  @Get('settings')
  async getSettings(@CurrentUser() user: AuthenticatedUser): Promise<TenantSettings> {
    return this.tenant.getSettings(this.tenantOrThrow(user));
  }

  @Put('settings/allowed-origins')
  async updateAllowedOrigins(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateAllowedOriginsSchema))
    body: UpdateAllowedOriginsBody,
  ): Promise<TenantSettings> {
    return this.tenant.updateAllowedOrigins(
      this.tenantOrThrow(user),
      body.allowed_origins,
    );
  }

  private tenantOrThrow(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException(
        'super_admin must impersonate a tenant for tenant-scoped endpoints',
      );
    }
    return user.tenantId;
  }
}
