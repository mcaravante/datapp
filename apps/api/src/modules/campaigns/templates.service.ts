import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { EmailTemplate, Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';

const SUMMARY_SELECT = {
  id: true,
  channel: true,
  slug: true,
  name: true,
  subject: true,
  format: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.EmailTemplateSelect;

type SummaryRow = Prisma.EmailTemplateGetPayload<{ select: typeof SUMMARY_SELECT }>;
import { TemplateRendererService } from '../email/template-renderer.service';
import type {
  CreateEmailTemplateBody,
  EmailTemplateDetail,
  EmailTemplatePreviewResponse,
  EmailTemplateSummary,
  UpdateEmailTemplateBody,
} from './dto/templates.dto';

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TemplateRendererService,
  ) {}

  async list(tenantId: string): Promise<EmailTemplateSummary[]> {
    const rows = await this.prisma.emailTemplate.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      select: SUMMARY_SELECT,
    });
    return rows.map(this.toSummary);
  }

  async get(tenantId: string, id: string): Promise<EmailTemplateDetail> {
    const row = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!row || row.tenantId !== tenantId) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return this.toDetail(row);
  }

  async create(tenantId: string, body: CreateEmailTemplateBody): Promise<EmailTemplateDetail> {
    try {
      const row = await this.prisma.emailTemplate.create({
        data: {
          tenantId,
          channel: body.channel,
          slug: body.slug,
          name: body.name,
          subject: body.subject,
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText ?? null,
          variables: (body.variables ?? {}) as Prisma.InputJsonValue,
          format: body.format,
          isActive: body.isActive,
        },
      });
      this.logger.log(`Created template ${row.slug} (${row.id}) for tenant ${tenantId}`);
      return this.toDetail(row);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Template with slug "${body.slug}" already exists`);
      }
      throw err;
    }
  }

  async update(
    tenantId: string,
    id: string,
    body: UpdateEmailTemplateBody,
  ): Promise<EmailTemplateDetail> {
    const existing = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    const data: Prisma.EmailTemplateUpdateInput = {};
    if (body.channel !== undefined) data.channel = body.channel;
    if (body.name !== undefined) data.name = body.name;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml;
    if (body.bodyText !== undefined) data.bodyText = body.bodyText;
    if (body.variables !== undefined) {
      data.variables = (body.variables ?? {}) as Prisma.InputJsonValue;
    }
    if (body.format !== undefined) data.format = body.format;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const row = await this.prisma.emailTemplate.update({ where: { id }, data });
    return this.toDetail(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.emailTemplate.findUnique({
      where: { id },
      include: { _count: { select: { stages: true } } },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    if (existing._count.stages > 0) {
      throw new ConflictException(
        `Template is used by ${existing._count.stages.toString()} campaign stages — archive those first`,
      );
    }
    await this.prisma.emailTemplate.delete({ where: { id } });
  }

  async preview(
    tenantId: string,
    id: string,
    variables: Record<string, unknown>,
  ): Promise<EmailTemplatePreviewResponse> {
    const row = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!row || row.tenantId !== tenantId) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    const rendered = await this.renderer.render(row, variables);
    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text ?? null,
    };
  }

  private toSummary = (row: SummaryRow): EmailTemplateSummary => ({
    id: row.id,
    channel: row.channel,
    slug: row.slug,
    name: row.name,
    subject: row.subject,
    format: row.format as 'mjml' | 'html',
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  });

  private toDetail = (row: EmailTemplate): EmailTemplateDetail => ({
    id: row.id,
    channel: row.channel,
    slug: row.slug,
    name: row.name,
    subject: row.subject,
    body_html: row.bodyHtml,
    body_text: row.bodyText,
    variables: row.variables as Record<string, unknown>,
    format: row.format as 'mjml' | 'html',
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  });
}
