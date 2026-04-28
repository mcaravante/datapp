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
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { SegmentsService } from './segments.service';
import type {
  SegmentMembersPage,
  SegmentSummary,
} from './segments.service';
import {
  CreateSegmentSchema,
  ListSegmentMembersQuerySchema,
} from './dto/segment-definition';
import type {
  CreateSegmentBody,
  ListSegmentMembersQuery,
} from './dto/segment-definition';

@Controller({ path: 'admin/segments', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:segments')
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: SegmentSummary[] }> {
    return { data: await this.segments.list(this.tenantOrThrow(user)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateSegmentSchema)) body: CreateSegmentBody,
  ): Promise<SegmentSummary> {
    return this.segments.create(this.tenantOrThrow(user), user.id, body);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SegmentSummary> {
    return this.segments.get(this.tenantOrThrow(user), id);
  }

  @Get(':id/members')
  async listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(ListSegmentMembersQuerySchema)) query: ListSegmentMembersQuery,
  ): Promise<SegmentMembersPage> {
    return this.segments.listMembers(this.tenantOrThrow(user), id, query);
  }

  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SegmentSummary> {
    return this.segments.refresh(this.tenantOrThrow(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.segments.delete(this.tenantOrThrow(user), id);
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
