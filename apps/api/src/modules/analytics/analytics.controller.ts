import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CouponsQuerySchema, type CouponsQuery, type CouponsResponse } from './dto/coupons.dto';
import {
  RevenueTimeseriesQuerySchema,
  type RevenueTimeseriesQuery,
  type RevenueTimeseriesResponse,
} from './dto/revenue-timeseries.dto';
import {
  AovHistogramQuerySchema,
  type AovHistogramQuery,
  type AovHistogramResponse,
} from './dto/aov-histogram.dto';
import {
  YearlyRevenueQuerySchema,
  type YearlyRevenueQuery,
  type YearlyRevenueResponse,
} from './dto/yearly-revenue.dto';
import {
  BreakdownQuerySchema,
  type BreakdownQuery,
  type BreakdownResponse,
} from './dto/breakdown.dto';
import { AddExcludedEmailSchema, type AddExcludedEmailDto } from './dto/excluded-email.dto';
import {
  UpsertMethodLabelSchema,
  type UpsertMethodLabelDto,
} from './dto/method-label.dto';
import { AnalyticsService, type KpisResponse } from './analytics.service';
import { ExcludedEmailsService, type ExcludedEmailRow } from './excluded-emails.service';
import { MethodLabelsService, type MethodLabelRow } from './method-labels.service';

@Controller({ path: 'admin/analytics', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly excludedEmails: ExcludedEmailsService,
    private readonly methodLabels: MethodLabelsService,
  ) {}

  @Get('method-labels')
  async listMethodLabels(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: MethodLabelRow[] }> {
    return this.methodLabels.list(this.tenantOrThrow(user));
  }

  @Post('method-labels')
  async upsertMethodLabel(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpsertMethodLabelSchema)) body: UpsertMethodLabelDto,
  ): Promise<MethodLabelRow> {
    return this.methodLabels.upsert(
      this.tenantOrThrow(user),
      body.kind,
      body.code,
      body.title,
      body.mergeIntoCode ?? null,
    );
  }

  @Delete('method-labels/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMethodLabel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.methodLabels.remove(this.tenantOrThrow(user), id);
  }

  @Get('excluded-emails')
  async listExcluded(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: ExcludedEmailRow[] }> {
    return this.excludedEmails.list(this.tenantOrThrow(user));
  }

  @Post('excluded-emails')
  async addExcluded(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(AddExcludedEmailSchema)) body: AddExcludedEmailDto,
  ): Promise<ExcludedEmailRow> {
    return this.excludedEmails.add(
      this.tenantOrThrow(user),
      user.id,
      body.email,
      body.reason ?? null,
    );
  }

  @Delete('excluded-emails/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeExcluded(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.excludedEmails.remove(this.tenantOrThrow(user), id);
  }

  @Get('kpis')
  async kpis(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsRangeSchema)) query: AnalyticsRange,
  ): Promise<KpisResponse> {
    return this.analytics.kpis(this.tenantOrThrow(user), query);
  }

  @Get('revenue-timeseries')
  async revenueTimeseries(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(RevenueTimeseriesQuerySchema)) query: RevenueTimeseriesQuery,
  ): Promise<RevenueTimeseriesResponse> {
    return this.analytics.revenueTimeseries(this.tenantOrThrow(user), query);
  }

  @Get('aov-histogram')
  async aovHistogram(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AovHistogramQuerySchema)) query: AovHistogramQuery,
  ): Promise<AovHistogramResponse> {
    return this.analytics.aovHistogram(this.tenantOrThrow(user), query);
  }

  @Get('yearly-revenue')
  async yearlyRevenue(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(YearlyRevenueQuerySchema)) query: YearlyRevenueQuery,
  ): Promise<YearlyRevenueResponse> {
    return this.analytics.yearlyRevenue(this.tenantOrThrow(user), query.currency);
  }

  @Get('breakdown')
  async breakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(BreakdownQuerySchema)) query: BreakdownQuery,
  ): Promise<BreakdownResponse> {
    return this.analytics.breakdown(this.tenantOrThrow(user), query);
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

  @Get('coupons')
  async coupons(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(CouponsQuerySchema)) query: CouponsQuery,
  ): Promise<CouponsResponse> {
    return this.analytics.coupons(this.tenantOrThrow(user), query);
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
