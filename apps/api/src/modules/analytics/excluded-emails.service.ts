import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';

export interface ExcludedEmailRow {
  id: string;
  email: string;
  reason: string | null;
  added_by: { id: string; email: string; name: string } | null;
  created_at: string;
}

const CACHE_TTL_MS = 60_000;

/**
 * Tenant-scoped email exclusion list. Reads are aggressively cached
 * because the list is consulted by every analytics query — TTL is one
 * minute, and the cache is busted explicitly on add/remove so the
 * operator never sees stale data after they edit the list. The cache
 * is also dropped on `Refresh cache` from /system because that
 * invalidation tag is per-tenant.
 */
@Injectable()
export class ExcludedEmailsService {
  private readonly logger = new Logger(ExcludedEmailsService.name);
  private readonly cache = new Map<string, { emails: string[]; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return the lowercased emails to exclude. Suitable for direct
   * inclusion in a SQL `NOT IN (…)` filter; an empty array means
   * "exclude nothing", which the analytics service handles cleanly.
   */
  async listEmails(tenantId: string): Promise<string[]> {
    const cached = this.cache.get(tenantId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.emails;
    const rows = await this.prisma.reportExcludedEmail.findMany({
      where: { tenantId },
      select: { email: true },
    });
    const emails = rows.map((r) => r.email.toLowerCase());
    this.cache.set(tenantId, { emails, expiresAt: now + CACHE_TTL_MS });
    return emails;
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  async list(tenantId: string): Promise<{ data: ExcludedEmailRow[] }> {
    const rows = await this.prisma.reportExcludedEmail.findMany({
      where: { tenantId },
      include: {
        addedBy: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        reason: r.reason,
        added_by: r.addedBy
          ? { id: r.addedBy.id, email: r.addedBy.email, name: r.addedBy.name }
          : null,
        created_at: r.createdAt.toISOString(),
      })),
    };
  }

  async add(
    tenantId: string,
    addedById: string,
    email: string,
    reason: string | null,
  ): Promise<ExcludedEmailRow> {
    const normalized = email.trim().toLowerCase();
    try {
      const row = await this.prisma.reportExcludedEmail.create({
        data: {
          tenantId,
          email: normalized,
          reason: reason?.trim() || null,
          addedById,
        },
        include: { addedBy: { select: { id: true, email: true, name: true } } },
      });
      this.invalidate(tenantId);
      return {
        id: row.id,
        email: row.email,
        reason: row.reason,
        added_by: row.addedBy
          ? { id: row.addedBy.id, email: row.addedBy.email, name: row.addedBy.name }
          : null,
        created_at: row.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Email already excluded: ${normalized}`);
      }
      throw err;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const result = await this.prisma.reportExcludedEmail.deleteMany({
      where: { tenantId, id },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Excluded email ${id} not found`);
    }
    this.invalidate(tenantId);
  }
}
