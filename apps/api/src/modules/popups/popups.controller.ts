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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { PopupsService } from './popups.service';
import {
  CreatePopupSchema,
  UpdatePopupSchema,
  type CreatePopupBody,
  type PopupDetail,
  type PopupSummary,
  type SubmissionsPage,
  type UpdatePopupBody,
} from './dto/popups.dto';

const ListSubmissionsQuerySchema = z.object({
  form_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
type ListSubmissionsQuery = z.infer<typeof ListSubmissionsQuerySchema>;

@Controller({ path: 'admin/popups', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:popups')
export class PopupsAdminController {
  constructor(private readonly popups: PopupsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: PopupSummary[] }> {
    const data = await this.popups.listForTenant(this.tenantOrThrow(user));
    return { data };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePopupSchema)) body: CreatePopupBody,
  ): Promise<PopupDetail> {
    return this.popups.create(this.tenantOrThrow(user), body);
  }

  @Get('submissions')
  async submissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListSubmissionsQuerySchema)) query: ListSubmissionsQuery,
  ): Promise<SubmissionsPage> {
    return this.popups.listSubmissions(
      this.tenantOrThrow(user),
      query.page,
      query.limit,
      query.form_id,
    );
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PopupDetail> {
    return this.popups.findById(this.tenantOrThrow(user), id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePopupSchema)) body: UpdatePopupBody,
  ): Promise<PopupDetail> {
    return this.popups.update(this.tenantOrThrow(user), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.popups.archive(this.tenantOrThrow(user), id);
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
