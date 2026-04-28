import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { csvFilename, toCsv } from '../../lib/csv';
import { AnalyticsRangeSchema, type AnalyticsRange } from './dto/range.dto';
import {
  TopProductsQuerySchema,
  type TopProductsQuery,
  type TopProductsResponse,
} from './dto/top-products.dto';
import { GeoQuerySchema, type GeoQuery, type GeoResponse } from './dto/geo.dto';
import { TimingQuerySchema, type TimingQuery, type TimingResponse } from './dto/timing.dto';
import { CohortsQuerySchema, type CohortsQuery, type CohortsResponse } from './dto/cohorts.dto';
import {
  ProductAffinityQuerySchema,
  type ProductAffinityQuery,
  type ProductAffinityResponse,
} from './dto/product-affinity.dto';
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

  @Get('geo')
  async geo(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(GeoQuerySchema)) query: GeoQuery,
  ): Promise<GeoResponse> {
    return this.analytics.geo(this.tenantOrThrow(user), query);
  }

  @Get('timing')
  async timing(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TimingQuerySchema)) query: TimingQuery,
  ): Promise<TimingResponse> {
    return this.analytics.timing(this.tenantOrThrow(user), query);
  }

  @Get('cohorts')
  async cohorts(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(CohortsQuerySchema)) query: CohortsQuery,
  ): Promise<CohortsResponse> {
    return this.analytics.cohorts(this.tenantOrThrow(user), query);
  }

  @Get('top-products/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async topProductsCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TopProductsQuerySchema)) query: TopProductsQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const tenantId = this.tenantOrThrow(user);
    const { headers, rows } = await this.analytics.topProductsExport(tenantId, query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('top-products')}"`,
    );
    return toCsv(headers, rows);
  }

  @Get('geo/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async geoCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(GeoQuerySchema)) query: GeoQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const tenantId = this.tenantOrThrow(user);
    const { headers, rows } = await this.analytics.geoExport(tenantId, query);
    res.setHeader('Content-Disposition', `attachment; filename="${csvFilename('regions')}"`);
    return toCsv(headers, rows);
  }

  @Get('product-affinity')
  async productAffinity(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ProductAffinityQuerySchema)) query: ProductAffinityQuery,
  ): Promise<ProductAffinityResponse> {
    return this.analytics.productAffinity(this.tenantOrThrow(user), query);
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
