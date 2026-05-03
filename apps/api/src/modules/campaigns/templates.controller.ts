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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { EmailTemplatesService } from './templates.service';
import {
  CreateEmailTemplateSchema,
  PreviewEmailTemplateSchema,
  UpdateEmailTemplateSchema,
} from './dto/templates.dto';
import type {
  CreateEmailTemplateBody,
  EmailTemplateDetail,
  EmailTemplatePreviewResponse,
  EmailTemplateSummary,
  PreviewEmailTemplateBody,
  UpdateEmailTemplateBody,
} from './dto/templates.dto';

@Controller({ path: 'admin/email-templates', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:email-templates')
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: EmailTemplateSummary[] }> {
    return { data: await this.templates.list(this.tenantOrThrow(user)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEmailTemplateSchema)) body: CreateEmailTemplateBody,
  ): Promise<EmailTemplateDetail> {
    return this.templates.create(this.tenantOrThrow(user), body);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EmailTemplateDetail> {
    return this.templates.get(this.tenantOrThrow(user), id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateEmailTemplateSchema)) body: UpdateEmailTemplateBody,
  ): Promise<EmailTemplateDetail> {
    return this.templates.update(this.tenantOrThrow(user), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.templates.remove(this.tenantOrThrow(user), id);
  }

  @Post(':id/preview')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(PreviewEmailTemplateSchema)) body: PreviewEmailTemplateBody,
  ): Promise<EmailTemplatePreviewResponse> {
    return this.templates.preview(this.tenantOrThrow(user), id, body.variables);
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
