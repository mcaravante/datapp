import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
import { OrdersService } from './orders.service';
import type { OrderDetail, OrderListPage } from './orders.service';
import { ListOrdersQuerySchema } from './dto/list-orders.query';
import type { ListOrdersQuery } from './dto/list-orders.query';

@Controller({ path: 'admin/orders', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListOrdersQuerySchema)) query: ListOrdersQuery,
  ): Promise<OrderListPage> {
    return this.orders.list(this.tenantOrThrow(user), query);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListOrdersQuerySchema)) query: ListOrdersQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const tenantId = this.tenantOrThrow(user);
    const { headers, rows } = await this.orders.exportRows(tenantId, query);
    res.setHeader('Content-Disposition', `attachment; filename="${csvFilename('orders')}"`);
    return toCsv(headers, rows);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OrderDetail> {
    return this.orders.get(this.tenantOrThrow(user), id);
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
