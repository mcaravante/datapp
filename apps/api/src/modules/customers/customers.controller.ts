import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { CustomersService, type CustomerDetail, type CustomerListPage } from './customers.service';
import { ListCustomersQuerySchema, type ListCustomersQuery } from './dto/list-customers.query';

@Controller({ path: 'admin/customers', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListCustomersQuerySchema)) query: ListCustomersQuery,
  ): Promise<CustomerListPage> {
    return this.customers.list(this.tenantOrThrow(user), query);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CustomerDetail> {
    return this.customers.get(this.tenantOrThrow(user), id);
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
