import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { AnalyticsRangeSchema, type AnalyticsRange } from './dto/range.dto';
import {
  TopProductsQuerySchema,
  type TopProductsQuery,
  type TopProductsResponse,
} from './dto/top-products.dto';
import { AnalyticsService, type KpisResponse } from './analytics.service';

@Controller({ path: 'admin/analytics', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('kpis')
  async kpis(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsRangeSchema)) query: AnalyticsRange,
  ): Promise<KpisResponse> {
    return this.analytics.kpis(this.tenantOrThrow(user), query);
  }

  @Get('top-products')
  async topProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TopProductsQuerySchema)) query: TopProductsQuery,
  ): Promise<TopProductsResponse> {
    return this.analytics.topProducts(this.tenantOrThrow(user), query);
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
