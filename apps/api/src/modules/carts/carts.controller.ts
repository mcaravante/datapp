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
import { CartsService } from './carts.service';
import type { AbandonedCartRow, AbandonedCartsResponse } from './carts.service';
import { AbandonedCartsQuerySchema } from './dto/abandoned-carts.query';
import type { AbandonedCartsQuery } from './dto/abandoned-carts.query';

@Controller({ path: 'admin/carts', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:carts')
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Get('abandoned')
  async abandoned(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AbandonedCartsQuerySchema)) query: AbandonedCartsQuery,
  ): Promise<AbandonedCartsResponse> {
    return this.carts.listAbandoned(this.tenantOrThrow(user), query);
  }

  @Get('abandoned/:id')
  async abandonedDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AbandonedCartRow> {
    return this.carts.findById(this.tenantOrThrow(user), id);
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
