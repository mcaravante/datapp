import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@datapp/db';
import type { EmailCampaignStatus } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type {
  CreateEmailCampaignBody,
  EmailCampaignDetail,
  EmailCampaignStageDto,
  EmailCampaignSummary,
  ReplaceStagesBody,
  StageInput,
  UpdateEmailCampaignBody,
} from './dto/campaigns.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<EmailCampaignSummary[]> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const campaigns = await this.prisma.emailCampaign.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        trigger: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { stages: true } },
      },
    });

    if (campaigns.length === 0) return [];

    const ids = campaigns.map((c) => c.id);
    const sendCounts = await this.prisma.emailSend.groupBy({
      by: ['campaignId'],
      where: { tenantId, campaignId: { in: ids }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const sendCountByCampaign = new Map<string, number>();
    for (const row of sendCounts) {
      sendCountByCampaign.set(row.campaignId, row._count._all);
    }

    return campaigns.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      trigger: c.trigger,
      status: c.status,
      stage_count: c._count.stages,
      send_count_30d: sendCountByCampaign.get(c.id) ?? 0,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
    }));
  }

  async get(tenantId: string, id: string): Promise<EmailCampaignDetail> {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: { template: { select: { slug: true, name: true } } },
        },
        _count: { select: { stages: true } },
      },
    });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sendCount = await this.prisma.emailSend.count({
      where: { tenantId, campaignId: id, createdAt: { gte: since } },
    });

    return {
      id: campaign.id,
      slug: campaign.slug,
      name: campaign.name,
      trigger: campaign.trigger,
      status: campaign.status,
      stage_count: campaign._count.stages,
      send_count_30d: sendCount,
      from_email: campaign.fromEmail,
      reply_to_email: campaign.replyToEmail,
      archived_at: campaign.archivedAt?.toISOString() ?? null,
      created_at: campaign.createdAt.toISOString(),
      updated_at: campaign.updatedAt.toISOString(),
      stages: campaign.stages.map(this.toStageDto),
    };
  }

  async create(tenantId: string, body: CreateEmailCampaignBody): Promise<EmailCampaignDetail> {
    await this.assertTemplatesBelongToTenant(
      tenantId,
      body.stages.map((s) => s.templateId),
    );

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.emailCampaign.create({
          data: {
            tenantId,
            slug: body.slug,
            name: body.name,
            trigger: body.trigger,
            status: body.status,
            fromEmail: body.fromEmail ?? null,
            replyToEmail: body.replyToEmail ?? null,
          },
        });
        if (body.stages.length > 0) {
          await tx.emailCampaignStage.createMany({
            data: body.stages.map((s) => this.stageInputToCreate(tenantId, campaign.id, s)),
          });
        }
        return campaign;
      });
      this.logger.log(`Created campaign ${created.slug} (${created.id})`);
      return this.get(tenantId, created.id);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Campaign with slug "${body.slug}" already exists`);
      }
      throw err;
    }
  }

  async update(
    tenantId: string,
    id: string,
    body: UpdateEmailCampaignBody,
  ): Promise<EmailCampaignDetail> {
    const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const data: Prisma.EmailCampaignUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.trigger !== undefined) data.trigger = body.trigger;
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === 'archived' && existing.status !== 'archived') {
        data.archivedAt = new Date();
      } else if (body.status !== 'archived' && existing.status === 'archived') {
        data.archivedAt = null;
      }
    }
    if (body.fromEmail !== undefined) data.fromEmail = body.fromEmail;
    if (body.replyToEmail !== undefined) data.replyToEmail = body.replyToEmail;

    await this.prisma.emailCampaign.update({ where: { id }, data });
    return this.get(tenantId, id);
  }

  async replaceStages(
    tenantId: string,
    campaignId: string,
    body: ReplaceStagesBody,
  ): Promise<EmailCampaignDetail> {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const positions = body.stages.map((s) => s.position);
    const unique = new Set(positions);
    if (unique.size !== positions.length) {
      throw new BadRequestException('Stage positions must be unique within a campaign');
    }

    await this.assertTemplatesBelongToTenant(
      tenantId,
      body.stages.map((s) => s.templateId),
    );

    await this.prisma.$transaction(async (tx) => {
      // Wipe + recreate is the simplest correct approach for a small
      // number of stages (max 10). Existing `magentoSalesRuleId` values
      // are lost — acceptable: operator should archive the old campaign
      // when changing stage structure to clean up Magento rules.
      await tx.emailCampaignStage.deleteMany({ where: { campaignId } });
      if (body.stages.length > 0) {
        await tx.emailCampaignStage.createMany({
          data: body.stages.map((s) => this.stageInputToCreate(tenantId, campaignId, s)),
        });
      }
    });

    return this.get(tenantId, campaignId);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    if (existing.status !== 'archived' && existing.status !== 'draft') {
      throw new ConflictException(
        `Cannot delete campaign in status=${existing.status}; archive it first`,
      );
    }
    await this.prisma.emailCampaign.delete({ where: { id } });
  }

  /** Lightweight setter for status changes from the admin UI. */
  async setStatus(
    tenantId: string,
    id: string,
    status: EmailCampaignStatus,
  ): Promise<EmailCampaignDetail> {
    return this.update(tenantId, id, { status });
  }

  private async assertTemplatesBelongToTenant(
    tenantId: string,
    templateIds: string[],
  ): Promise<void> {
    if (templateIds.length === 0) return;
    const unique = Array.from(new Set(templateIds));
    const found = await this.prisma.emailTemplate.findMany({
      where: { id: { in: unique }, tenantId },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((t) => t.id));
      const missing = unique.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Template(s) not found in tenant: ${missing.join(', ')}`,
      );
    }
  }

  private stageInputToCreate(
    tenantId: string,
    campaignId: string,
    s: StageInput,
  ): Prisma.EmailCampaignStageCreateManyInput {
    return {
      tenantId,
      campaignId,
      templateId: s.templateId,
      position: s.position,
      delayHours: s.delayHours,
      couponMode: s.couponMode,
      couponStaticCode: s.couponStaticCode ?? null,
      couponDiscount: s.couponDiscount != null ? new Prisma.Decimal(s.couponDiscount) : null,
      couponDiscountType: s.couponDiscountType ?? null,
      couponTtlHours: s.couponTtlHours ?? null,
      isActive: s.isActive,
    };
  }

  private toStageDto = (
    stage: Prisma.EmailCampaignStageGetPayload<{
      include: { template: { select: { slug: true; name: true } } };
    }>,
  ): EmailCampaignStageDto => ({
    id: stage.id,
    position: stage.position,
    delay_hours: stage.delayHours,
    template_id: stage.templateId,
    template_slug: stage.template.slug,
    template_name: stage.template.name,
    coupon_mode: stage.couponMode,
    coupon_static_code: stage.couponStaticCode,
    magento_sales_rule_id: stage.magentoSalesRuleId,
    coupon_discount: stage.couponDiscount?.toString() ?? null,
    coupon_discount_type: stage.couponDiscountType as 'percent' | 'fixed' | null,
    coupon_ttl_hours: stage.couponTtlHours,
    is_active: stage.isActive,
  });
}
