import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import {
  CustomerGroupsService,
  type CustomerGroupSummary,
  type CustomerGroupSyncReport,
} from './customer-groups.service';

const ListMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>;

@Controller({ path: 'admin/customer-groups', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:customer-groups')
export class CustomerGroupsController {
  constructor(private readonly groups: CustomerGroupsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: CustomerGroupSummary[] }> {
    const data = await this.groups.listForTenant(this.tenantOrThrow(user));
    return { data };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CustomerGroupSummary> {
    return this.groups.findById(this.tenantOrThrow(user), id);
  }

  @Get(':id/members')
  async members(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(ListMembersQuerySchema)) query: ListMembersQuery,
  ): ReturnType<CustomerGroupsService['listMembers']> {
    return this.groups.listMembers(this.tenantOrThrow(user), id, query.page, query.limit);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerGroupSyncReport> {
    return this.groups.syncForTenant(this.tenantOrThrow(user));
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
