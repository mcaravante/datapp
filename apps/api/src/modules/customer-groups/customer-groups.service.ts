import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import { MagentoStoreService } from '../magento/magento-store.service';
import { MagentoClientFactory } from '../magento/magento-client.factory';

export interface CustomerGroupSummary {
  id: string;
  magento_group_id: number;
  name: string;
  tax_class_id: number | null;
  tax_class_name: string | null;
  member_count: number;
  synced_at: string;
  updated_at: string;
}

export interface CustomerGroupSyncReport {
  /** Magento groups read by the sync. */
  scanned: number;
  /** Rows inserted/updated in `customer_group`. */
  upserted: number;
  /** `customer_profile` rows whose `customer_group_id` was filled in. */
  profileLinks: number;
  durationMs: number;
}

/**
 * Mirrors Magento's customer groups into the CDP and keeps
 * `customer_profile.customer_group_id` aligned with the existing free-form
 * `customer_group` string column. The string column stays as a denormalized
 * cache so analytics queries that already filter by name keep working.
 */
@Injectable()
export class CustomerGroupsService {
  private readonly logger = new Logger(CustomerGroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: MagentoStoreService,
    private readonly factory: MagentoClientFactory,
  ) {}

  /**
   * Pulls the full list of groups from Magento and upserts them by
   * `(tenantId, magentoGroupId)`. After the upsert, runs a single
   * `UPDATE … FROM` that links every `customer_profile` whose name
   * matches a known group. Idempotent — safe to re-run.
   */
  async syncForTenant(tenantId: string): Promise<CustomerGroupSyncReport> {
    const startedAt = Date.now();
    const store = await this.stores.findFirstByTenant(tenantId);
    const client = this.factory.forStore(store);
    const groups = await client.customerGroups.listAll();

    let upserted = 0;
    for (const g of groups) {
      await this.prisma.customerGroup.upsert({
        where: { tenantId_magentoGroupId: { tenantId, magentoGroupId: g.id } },
        create: {
          tenantId,
          magentoGroupId: g.id,
          name: g.code,
          taxClassId: g.tax_class_id ?? null,
          taxClassName: g.tax_class_name ?? null,
        },
        update: {
          name: g.code,
          taxClassId: g.tax_class_id ?? null,
          taxClassName: g.tax_class_name ?? null,
          syncedAt: new Date(),
        },
        select: { id: true },
      });
      upserted += 1;
    }

    const profileLinks = await this.linkProfilesByName(tenantId);

    const report: CustomerGroupSyncReport = {
      scanned: groups.length,
      upserted,
      profileLinks,
      durationMs: Date.now() - startedAt,
    };
    this.logger.log(
      `customer-groups sync tenant=${tenantId} scanned=${report.scanned.toString()} upserted=${report.upserted.toString()} profileLinks=${report.profileLinks.toString()} durationMs=${report.durationMs.toString()}`,
    );
    return report;
  }

  async listForTenant(tenantId: string): Promise<CustomerGroupSummary[]> {
    const rows = await this.prisma.customerGroup.findMany({
      where: { tenantId },
      orderBy: { magentoGroupId: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return rows.map((g) => ({
      id: g.id,
      magento_group_id: g.magentoGroupId,
      name: g.name,
      tax_class_id: g.taxClassId,
      tax_class_name: g.taxClassName,
      member_count: g._count.members,
      synced_at: g.syncedAt.toISOString(),
      updated_at: g.updatedAt.toISOString(),
    }));
  }

  /**
   * Single-shot link of every `customer_profile` whose `customer_group`
   * string matches a row in `customer_group`. Only touches rows that
   * are still NULL on the FK, so re-runs are cheap no-ops. The customer
   * ingest path calls this after each batch so the FK doesn't lag the
   * string for newly upserted profiles.
   */
  async linkProfilesByName(tenantId: string): Promise<number> {
    const result = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "customer_profile" cp
      SET "customer_group_id" = cg."id"
      FROM "customer_group" cg
      WHERE cp."tenant_id" = ${tenantId}::uuid
        AND cg."tenant_id" = ${tenantId}::uuid
        AND cp."customer_group_id" IS NULL
        AND cp."customer_group" IS NOT NULL
        AND cp."customer_group" = cg."name"
    `);
    return Number(result);
  }

  async listMembers(
    tenantId: string,
    groupId: string,
    page: number,
    limit: number,
  ): Promise<{
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
    data: {
      id: string;
      magento_customer_id: string | null;
      email: string;
      first_name: string | null;
      last_name: string | null;
      magento_created_at: string | null;
    }[];
  }> {
    // Defensive: validate the group belongs to the caller's tenant.
    await this.findById(tenantId, groupId);
    const where: Prisma.CustomerProfileWhereInput = {
      tenantId,
      customerGroupId: groupId,
    };
    const [rows, totalCount] = await Promise.all([
      this.prisma.customerProfile.findMany({
        where,
        orderBy: { magentoCreatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          magentoCustomerId: true,
          email: true,
          firstName: true,
          lastName: true,
          magentoCreatedAt: true,
        },
      }),
      this.prisma.customerProfile.count({ where }),
    ]);
    return {
      page,
      limit,
      total_count: totalCount,
      total_pages: Math.max(1, Math.ceil(totalCount / limit)),
      data: rows.map((r) => ({
        id: r.id,
        magento_customer_id: r.magentoCustomerId,
        email: r.email,
        first_name: r.firstName,
        last_name: r.lastName,
        magento_created_at: r.magentoCreatedAt?.toISOString() ?? null,
      })),
    };
  }

  async findById(tenantId: string, id: string): Promise<CustomerGroupSummary> {
    const g = await this.prisma.customerGroup.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { members: true } } },
    });
    if (!g) throw new NotFoundException(`customer_group ${id} not found`);
    return {
      id: g.id,
      magento_group_id: g.magentoGroupId,
      name: g.name,
      tax_class_id: g.taxClassId,
      tax_class_name: g.taxClassName,
      member_count: g._count.members,
      synced_at: g.syncedAt.toISOString(),
      updated_at: g.updatedAt.toISOString(),
    };
  }

  /**
   * Resolves a Magento group code to the local CustomerGroup uuid. Used
   * by the customer ingest path to link new profiles immediately. Lazy
   * upsert: if the code is unknown, fetches Magento once, caches the
   * row, and returns its id. Returns null if Magento doesn't have a
   * matching group either (defensive — shouldn't happen in practice).
   */
  async resolveByName(tenantId: string, name: string | null): Promise<string | null> {
    if (!name) return null;
    const existing = await this.prisma.customerGroup.findFirst({
      where: { tenantId, name },
      select: { id: true },
    });
    if (existing) return existing.id;
    // Cold path: an unknown name showed up before the daily sync. Pull
    // the full list and try again. Cheap (one HTTP, ≤ ~14 rows).
    await this.syncForTenant(tenantId);
    const refreshed = await this.prisma.customerGroup.findFirst({
      where: { tenantId, name },
      select: { id: true },
    });
    return refreshed?.id ?? null;
  }
}
