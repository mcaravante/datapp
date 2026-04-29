import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@cdp/db';
import type { AuditAction } from '@cdp/db';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { PrismaService } from '../../db/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';

const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'export',
  'erase',
  'login_failed',
  'account_locked',
  'password_reset_requested',
  'password_reset_completed',
  'session_revoked',
  'two_factor_enrolled',
  'two_factor_disabled',
  'two_factor_admin_reset',
  'recovery_codes_generated',
  'recovery_code_used',
] as const;

const ListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.enum(AUDIT_ACTIONS).optional(),
  user_id: z.string().uuid().optional(),
  entity: z.string().max(64).optional(),
});
type ListQuery = z.infer<typeof ListQuerySchema>;

interface AuditRow {
  id: string;
  at: string;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  user: { id: string; email: string; name: string } | null;
  ip: string | null;
  user_agent: string | null;
  after: unknown;
  before: unknown;
}

@Controller({ path: 'admin/audit', version: '1' })
@UseGuards(JwtGuard, RolesGuard)
@Roles('super_admin', 'admin')
@ApiBearerAuth()
@ApiTags('admin:audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQuery,
  ): Promise<{ data: AuditRow[]; next_cursor: string | null }> {
    const tenantId = user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'super_admin must impersonate a tenant for tenant-scoped endpoints',
      );
    }

    const where: Prisma.AuditLogWhereInput = { tenantId };
    if (query.action) where.action = query.action;
    if (query.user_id) where.userId = query.user_id;
    if (query.entity) where.entity = query.entity;

    // uuid7 is time-ordered; pagination by `id < cursor` keeps a cheap
    // descending scan on the (tenantId, at desc) index.
    if (query.cursor) where.id = { lt: query.cursor };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const slice = hasMore ? rows.slice(0, query.limit) : rows;
    const next = hasMore ? (slice[slice.length - 1]?.id ?? null) : null;

    return {
      data: slice.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        action: r.action,
        entity: r.entity,
        entity_id: r.entityId,
        user: r.user ? { id: r.user.id, email: r.user.email, name: r.user.name } : null,
        ip: r.ip,
        user_agent: r.userAgent,
        after: r.after,
        before: r.before,
      })),
      next_cursor: next,
    };
  }
}
