import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type {
  CreateSegmentBody,
  ListSegmentMembersQuery,
  SegmentDefinition,
} from './dto/segment-definition';

export interface SegmentSummary {
  id: string;
  name: string;
  description: string | null;
  definition: SegmentDefinition;
  type: string;
  member_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentMemberRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  customer_group: string | null;
  added_at: string;
}

export interface SegmentMembersPage {
  data: SegmentMemberRow[];
  next_cursor: string | null;
}

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<SegmentSummary[]> {
    const rows = await this.prisma.customerSegment.findMany({
      where: { tenantId },
      orderBy: [{ updatedAt: 'desc' }],
      include: { _count: { select: { members: true } }, createdBy: { select: { name: true } } },
    });
    return rows.map((r) => toSummary(r));
  }

  async get(tenantId: string, id: string): Promise<SegmentSummary> {
    const row = await this.prisma.customerSegment.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { members: true } }, createdBy: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException(`Segment ${id} not found`);
    return toSummary(row);
  }

  /**
   * Create a static segment and snapshot its current membership in a
   * single transaction. Re-using a name within the tenant returns 409.
   */
  async create(
    tenantId: string,
    actorId: string,
    body: CreateSegmentBody,
  ): Promise<SegmentSummary> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerSegment.findUnique({
        where: { tenantId_name: { tenantId, name: body.name } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(`Segment "${body.name}" already exists`);
      }

      const segment = await tx.customerSegment.create({
        data: {
          tenantId,
          name: body.name,
          description: body.description ?? null,
          definition: body.definition as unknown as Prisma.InputJsonValue,
          type: 'static',
          createdById: actorId,
        },
      });

      const memberIds = await this.matchCustomerIds(tx, tenantId, body.definition);
      if (memberIds.length > 0) {
        await tx.customerSegmentMember.createMany({
          data: memberIds.map((cid) => ({ segmentId: segment.id, customerProfileId: cid })),
          skipDuplicates: true,
        });
      }

      const fresh = await tx.customerSegment.findUniqueOrThrow({
        where: { id: segment.id },
        include: {
          _count: { select: { members: true } },
          createdBy: { select: { name: true } },
        },
      });
      return toSummary(fresh);
    });
  }

  /**
   * Recompute membership against the stored `definition`. Replaces all
   * existing rows. Stale members get dropped, new matches get added.
   */
  async refresh(tenantId: string, id: string): Promise<SegmentSummary> {
    return this.prisma.$transaction(async (tx) => {
      const segment = await tx.customerSegment.findFirst({
        where: { id, tenantId },
      });
      if (!segment) throw new NotFoundException(`Segment ${id} not found`);

      const definition = segment.definition as SegmentDefinition;
      const memberIds = await this.matchCustomerIds(tx, tenantId, definition);

      await tx.customerSegmentMember.deleteMany({ where: { segmentId: id } });
      if (memberIds.length > 0) {
        await tx.customerSegmentMember.createMany({
          data: memberIds.map((cid) => ({ segmentId: id, customerProfileId: cid })),
          skipDuplicates: true,
        });
      }
      // Bump updatedAt so the UI shows when the snapshot last refreshed.
      await tx.customerSegment.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      const fresh = await tx.customerSegment.findUniqueOrThrow({
        where: { id },
        include: {
          _count: { select: { members: true } },
          createdBy: { select: { name: true } },
        },
      });
      return toSummary(fresh);
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.customerSegment.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`Segment ${id} not found`);
    await this.prisma.customerSegment.delete({ where: { id } });
  }

  async listMembers(
    tenantId: string,
    id: string,
    query: ListSegmentMembersQuery,
  ): Promise<SegmentMembersPage> {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!segment) throw new NotFoundException(`Segment ${id} not found`);

    const cursor = query.cursor ? decodeMemberCursor(query.cursor) : null;
    const where: Prisma.CustomerSegmentMemberWhereInput = { segmentId: id };
    if (cursor) {
      where.OR = [
        { addedAt: { lt: cursor.addedAt } },
        { addedAt: cursor.addedAt, customerProfileId: { lt: cursor.customerProfileId } },
      ];
    }

    const rows = await this.prisma.customerSegmentMember.findMany({
      where,
      orderBy: [{ addedAt: 'desc' }, { customerProfileId: 'desc' }],
      take: query.limit + 1,
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            customerGroup: true,
          },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeMemberCursor(last.addedAt, last.customerProfileId) : null;

    return {
      data: page.map((r) => ({
        id: r.customer.id,
        email: r.customer.email,
        first_name: r.customer.firstName,
        last_name: r.customer.lastName,
        customer_group: r.customer.customerGroup,
        added_at: r.addedAt.toISOString(),
      })),
      next_cursor: nextCursor,
    };
  }

  /**
   * Apply the segment definition to the customer table and return the
   * matching customer ids. Runs as a single SELECT — joins to RFM only
   * when the filter requires it. `tx` lets us reuse the same Prisma
   * transaction client when the caller is inside one.
   */
  private async matchCustomerIds(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    def: SegmentDefinition,
  ): Promise<string[]> {
    const where: Prisma.CustomerProfileWhereInput = { tenantId };

    if (def.q) {
      where.OR = [
        { email: { contains: def.q, mode: 'insensitive' } },
        { firstName: { contains: def.q, mode: 'insensitive' } },
        { lastName: { contains: def.q, mode: 'insensitive' } },
      ];
    }
    if (def.region_id && def.region_id.length > 0) {
      where.addresses = { some: { regionId: { in: def.region_id } } };
    }
    if (def.customer_group !== undefined) {
      where.customerGroup = def.customer_group;
    }
    if (def.rfm_segment && def.rfm_segment.length > 0) {
      where.rfmScore = { is: { segment: { in: def.rfm_segment } } };
    }

    const rows = await tx.customerProfile.findMany({
      where,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

type SegmentRow = Prisma.CustomerSegmentGetPayload<{
  include: { _count: { select: { members: true } }; createdBy: { select: { name: true } } };
}>;

function toSummary(row: SegmentRow): SegmentSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    definition: (row.definition as SegmentDefinition) ?? {},
    type: row.type,
    member_count: row._count.members,
    created_by: row.createdBy?.name ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function encodeMemberCursor(addedAt: Date, customerProfileId: string): string {
  return Buffer.from(`${addedAt.toISOString()}|${customerProfileId}`, 'utf8').toString('base64url');
}

function decodeMemberCursor(
  raw: string,
): { addedAt: Date; customerProfileId: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    if (!iso || !id) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return { addedAt: date, customerProfileId: id };
  } catch {
    return null;
  }
}
