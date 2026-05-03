import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { BrandingService, type BrandingDto, type UpdateBrandingInput } from './branding.service';

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const UpdateBrandingSchema = z.object({
  logoMediaAssetId: z.string().uuid().nullable().optional(),
  logoMaxWidthPx: z.number().int().min(40).max(600).optional(),
  primaryColor: z
    .string()
    .regex(HEX_COLOR, 'Hex color (e.g. #111 or #111111)')
    .nullable()
    .optional(),
  footerHtml: z.string().max(8_000).nullable().optional(),
  senderName: z.string().max(120).nullable().optional(),
  senderAddress: z.string().max(300).nullable().optional(),
  unsubscribeText: z.string().min(1).max(300).optional(),
});

@Controller({ path: 'admin/email-branding', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:email-branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser): Promise<BrandingDto> {
    return this.branding.getDto(this.tenantOrThrow(user));
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateBrandingSchema))
    body: UpdateBrandingInput,
  ): Promise<BrandingDto> {
    return this.branding.update(this.tenantOrThrow(user), body);
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
