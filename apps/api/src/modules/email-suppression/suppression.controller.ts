import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { SuppressionReason } from '@datapp/db';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../../db/prisma.service';
import { EmailSuppressionService } from './suppression.service';

const REASON_VALUES: readonly SuppressionReason[] = [
  'manual',
  'hard_bounce',
  'spam_complaint',
  'unsubscribed',
  'invalid_address',
  'test_allowlist',
];

const ListQuerySchema = z.object({
  reason: z.enum(REASON_VALUES as [SuppressionReason, ...SuppressionReason[]]).optional(),
  q: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const CreateSchema = z.object({
  email: z.string().email().max(254),
  reason: z
    .enum(['manual', 'unsubscribed', 'invalid_address'] as const)
    .default('manual'),
  notes: z.string().max(500).optional(),
});

interface SuppressionRow {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: string | null;
  notes: string | null;
  created_at: string;
}

@Controller({ path: 'admin/email-suppressions', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:email-suppressions')
export class EmailSuppressionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppression: EmailSuppressionService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>,
  ): Promise<{ data: SuppressionRow[]; total: number }> {
    const tenantId = this.tenantOrThrow(user);

    const where = {
      tenantId,
      ...(query.reason ? { reason: query.reason } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q.toLowerCase() } },
              { notes: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.emailSuppression.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      this.prisma.emailSuppression.count({ where }),
    ]);

    return {
      total,
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        reason: r.reason,
        source: r.source,
        notes: r.notes,
        created_at: r.createdAt.toISOString(),
      })),
    };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateSchema)) body: z.infer<typeof CreateSchema>,
  ): Promise<SuppressionRow> {
    const tenantId = this.tenantOrThrow(user);
    const email = body.email.trim().toLowerCase();
    const emailHash = EmailSuppressionService.hashEmail(email);

    // Idempotent — if already suppressed, return the existing row.
    const row = await this.prisma.emailSuppression.upsert({
      where: { tenantId_emailHash: { tenantId, emailHash } },
      create: {
        tenantId,
        email,
        emailHash,
        reason: body.reason,
        source: 'admin.ui',
        notes: body.notes ?? `Manually added by ${user.email}`,
      },
      update: {},
    });

    return {
      id: row.id,
      email: row.email,
      reason: row.reason,
      source: row.source,
      notes: row.notes,
      created_at: row.createdAt.toISOString(),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const tenantId = this.tenantOrThrow(user);
    const row = await this.prisma.emailSuppression.findUnique({ where: { id } });
    if (!row || row.tenantId !== tenantId) {
      throw new NotFoundException(`Suppression ${id} not found`);
    }
    await this.prisma.emailSuppression.delete({ where: { id } });

    // If this was an unsubscribe, also flip the customer profile back
    // to subscribed=false → null reason. We DO NOT auto-resubscribe;
    // the operator has to explicitly do that on the customer page.
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
