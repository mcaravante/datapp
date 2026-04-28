import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { csvFilename, toCsv } from '../../lib/csv';
import {
  CustomersService,
  type CustomerDetail,
  type CustomerListPage,
  type CustomerProductsResponse,
} from './customers.service';
import { ListCustomersQuerySchema, type ListCustomersQuery } from './dto/list-customers.query';
import { GdprService, type GdprEraseResult, type GdprExportPayload } from './gdpr.service';

@Controller({ path: 'admin/customers', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly gdpr: GdprService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListCustomersQuerySchema)) query: ListCustomersQuery,
  ): Promise<CustomerListPage> {
    return this.customers.list(this.tenantOrThrow(user), query);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListCustomersQuerySchema)) query: ListCustomersQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const tenantId = this.tenantOrThrow(user);
    const { headers, rows } = await this.customers.exportRows(tenantId, query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('customers')}"`,
    );
    return toCsv(headers, rows);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CustomerDetail> {
    return this.customers.get(this.tenantOrThrow(user), id);
  }

  @Get(':id/products')
  async products(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CustomerProductsResponse> {
    return this.customers.products(this.tenantOrThrow(user), id);
  }

  @Get(':id/gdpr/export')
  async gdprExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GdprExportPayload> {
    const tenantId = this.tenantOrThrow(user);
    const payload = await this.gdpr.export(tenantId, id, {
      id: user.id,
      ip: extractIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="customer-${id}-export.json"`,
    );
    return payload;
  }

  @Post(':id/gdpr/erase')
  @HttpCode(HttpStatus.OK)
  async gdprErase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<GdprEraseResult> {
    const tenantId = this.tenantOrThrow(user);
    return this.gdpr.erase(tenantId, id, {
      id: user.id,
      ip: extractIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  /**
   * Admin endpoints are tenant-scoped: super_admins must impersonate a
   * tenant via a header (Iteration 3) before they can hit them.
   */
  private tenantOrThrow(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException(
        'super_admin must impersonate a tenant for tenant-scoped endpoints',
      );
    }
    return user.tenantId;
  }
}

function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}
