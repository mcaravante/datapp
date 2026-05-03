import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';

export type MethodKind = 'payment' | 'shipping';

export interface MethodLabelRow {
  id: string;
  kind: MethodKind;
  code: string;
  title: string;
  merge_into_code: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class MethodLabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All labels for a tenant. The list is small (typically < 20). */
  async list(tenantId: string): Promise<{ data: MethodLabelRow[] }> {
    const rows = await this.prisma.analyticsMethodLabel.findMany({
      where: { tenantId },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        kind: r.kind as MethodKind,
        code: r.code,
        title: r.title,
        merge_into_code: r.mergeIntoCode,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      })),
    };
  }

  async upsert(
    tenantId: string,
    kind: MethodKind,
    code: string,
    title: string,
    mergeIntoCode: string | null,
  ): Promise<MethodLabelRow> {
    const trimmedCode = code.trim();
    const trimmedTitle = title.trim();
    const trimmedMerge = mergeIntoCode?.trim() ?? null;
    if (trimmedMerge !== null && trimmedMerge === trimmedCode) {
      throw new ConflictException('A code cannot merge into itself');
    }
    try {
      const row = await this.prisma.analyticsMethodLabel.upsert({
        where: {
          tenantId_kind_code: { tenantId, kind, code: trimmedCode },
        },
        create: {
          tenantId,
          kind,
          code: trimmedCode,
          title: trimmedTitle,
          mergeIntoCode: trimmedMerge,
        },
        update: { title: trimmedTitle, mergeIntoCode: trimmedMerge },
      });
      return {
        id: row.id,
        kind: row.kind as MethodKind,
        code: row.code,
        title: row.title,
        merge_into_code: row.mergeIntoCode,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Label already exists for ${kind}:${trimmedCode}`);
      }
      throw err;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const result = await this.prisma.analyticsMethodLabel.deleteMany({
      where: { tenantId, id },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Method label ${id} not found`);
    }
  }
}
