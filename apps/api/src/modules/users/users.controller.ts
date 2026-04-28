import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { UsersService } from './users.service';
import type { UserSummary } from './users.service';
import {
  CreateUserSchema,
  ListUsersQuerySchema,
  UpdateUserSchema,
} from './dto/users.dto';
import type { CreateUserBody, ListUsersQuery, UpdateUserBody } from './dto/users.dto';

@Controller({ path: 'admin/users', version: '1' })
@UseGuards(JwtGuard, RolesGuard)
@Roles('super_admin', 'admin')
@ApiBearerAuth()
@ApiTags('admin:users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<{ data: UserSummary[] }> {
    return { data: await this.users.list(this.tenantOrThrow(user), query) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserBody,
    @Req() req: Request,
  ): Promise<UserSummary> {
    return this.users.create(
      this.tenantOrThrow(user),
      { id: user.id, ip: extractIp(req), userAgent: req.headers['user-agent'] ?? null },
      body,
    );
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserSummary> {
    return this.users.get(this.tenantOrThrow(user), id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUserBody,
    @Req() req: Request,
  ): Promise<UserSummary> {
    return this.users.update(
      this.tenantOrThrow(user),
      { id: user.id, ip: extractIp(req), userAgent: req.headers['user-agent'] ?? null },
      id,
      body,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.delete(
      this.tenantOrThrow(user),
      { id: user.id, ip: extractIp(req), userAgent: req.headers['user-agent'] ?? null },
      id,
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

function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}
