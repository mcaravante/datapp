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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { CampaignsService } from './campaigns.service';
import {
  CreateEmailCampaignSchema,
  ReplaceStagesSchema,
  UpdateEmailCampaignSchema,
} from './dto/campaigns.dto';
import type {
  CreateEmailCampaignBody,
  EmailCampaignDetail,
  EmailCampaignSummary,
  ReplaceStagesBody,
  UpdateEmailCampaignBody,
} from './dto/campaigns.dto';

@Controller({ path: 'admin/email-campaigns', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:email-campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: EmailCampaignSummary[] }> {
    return { data: await this.campaigns.list(this.tenantOrThrow(user)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEmailCampaignSchema)) body: CreateEmailCampaignBody,
  ): Promise<EmailCampaignDetail> {
    return this.campaigns.create(this.tenantOrThrow(user), body);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EmailCampaignDetail> {
    return this.campaigns.get(this.tenantOrThrow(user), id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateEmailCampaignSchema)) body: UpdateEmailCampaignBody,
  ): Promise<EmailCampaignDetail> {
    return this.campaigns.update(this.tenantOrThrow(user), id, body);
  }

  @Put(':id/stages')
  async replaceStages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReplaceStagesSchema)) body: ReplaceStagesBody,
  ): Promise<EmailCampaignDetail> {
    return this.campaigns.replaceStages(this.tenantOrThrow(user), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.campaigns.remove(this.tenantOrThrow(user), id);
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
