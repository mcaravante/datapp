import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type RfmSegmentLabel } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import { scoreRfm, type RfmScored } from './rfm-scoring';

const FREQ_MONETARY_WINDOW_DAYS = 365;

export interface RfmRunResult {
  tenantId: string;
  customers: number;
  bySegment: Record<string, number>;
  /** Calendar month the snapshot in `rfm_score_history` is keyed by (UTC). */
  snapshotMonth: Date;
  elapsedMs: number;
}

interface AggregateRow {
  customer_profile_id: string;
  recency_days: number;
  frequency: number;
  monetary: Prisma.Decimal;
}

@Injectable()
export class RfmService {
  private readonly logger = new Logger(RfmService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Score every customer in the tenant who has at least one historical
   * order, replace the `rfm_score` snapshot wholesale, and append a row
   * to `rfm_score_history` keyed by the current calendar month.
   *
   * Idempotent within a calendar month: the history row is upserted on
   * (tenantId, customerProfileId, snapshotMonth).
   */
  async run(tenantId: string, now: Date = new Date()): Promise<RfmRunResult> {
    const startedAt = Date.now();
    const snapshotMonth = startOfMonthUtc(now);
    const windowStart = new Date(now.getTime() - FREQ_MONETARY_WINDOW_DAYS * 86_400_000);

    const aggregates = await this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      SELECT
        customer_profile_id,
        EXTRACT(EPOCH FROM (${now} - MAX(placed_at))) / 86400 AS recency_days,
        COUNT(*) FILTER (WHERE placed_at >= ${windowStart})::int AS frequency,
        COALESCE(SUM(real_revenue) FILTER (WHERE placed_at >= ${windowStart}), 0)::numeric(20,4) AS monetary
      FROM "order"
      WHERE tenant_id = ${tenantId}::uuid
        AND customer_profile_id IS NOT NULL
      GROUP BY customer_profile_id
    `);

    if (aggregates.length === 0) {
      this.logger.log(`RFM run skipped (tenant=${tenantId}): no customers with orders`);
      return {
        tenantId,
        customers: 0,
        bySegment: {},
        snapshotMonth,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const scored = scoreRfm(
      aggregates.map((a) => ({
        customerProfileId: a.customer_profile_id,
        recencyDays: Math.max(0, Math.round(a.recency_days)),
        frequency: a.frequency,
        monetary: Number(a.monetary),
      })),
    );

    const bySegment: Record<string, number> = {};
    for (const s of scored) bySegment[s.segment] = (bySegment[s.segment] ?? 0) + 1;

    await this.prisma.$transaction(async (tx) => {
      // Wholesale replace the headline snapshot.
      await tx.rfmScore.deleteMany({ where: { tenantId } });
      const calculatedAt = now;
      await tx.rfmScore.createMany({
        data: scored.map((s) => buildRow(tenantId, s, calculatedAt)),
      });

      // History: append once per calendar month, idempotent on
      // (tenant, customer, month).
      await tx.rfmScoreHistory.deleteMany({
        where: { tenantId, snapshotMonth },
      });
      await tx.rfmScoreHistory.createMany({
        data: scored.map((s) => ({
          ...buildRow(tenantId, s, calculatedAt),
          snapshotMonth,
        })),
      });
    });

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `RFM run finished (tenant=${tenantId}): ${scored.length.toString()} customers in ${elapsedMs.toString()}ms`,
    );
    return { tenantId, customers: scored.length, bySegment, snapshotMonth, elapsedMs };
  }

  /** Read the current segment + scores for a customer (or null). */
  async forCustomer(
    tenantId: string,
    customerProfileId: string,
  ): Promise<{
    segment: RfmSegmentLabel;
    recencyDays: number;
    frequency: number;
    monetary: string;
    recencyScore: number;
    frequencyScore: number;
    monetaryScore: number;
    calculatedAt: string;
  } | null> {
    const row = await this.prisma.rfmScore.findUnique({
      where: { customerProfileId },
      select: {
        segment: true,
        recencyDays: true,
        frequency: true,
        monetary: true,
        recencyScore: true,
        frequencyScore: true,
        monetaryScore: true,
        calculatedAt: true,
        tenantId: true,
      },
    });
    if (!row || row.tenantId !== tenantId) return null;
    return {
      segment: row.segment,
      recencyDays: row.recencyDays,
      frequency: row.frequency,
      monetary: row.monetary.toString(),
      recencyScore: row.recencyScore,
      frequencyScore: row.frequencyScore,
      monetaryScore: row.monetaryScore,
      calculatedAt: row.calculatedAt.toISOString(),
    };
  }

  /** Segment counts across the tenant. */
  async segmentBreakdown(tenantId: string): Promise<Record<RfmSegmentLabel | string, number>> {
    const grouped = await this.prisma.rfmScore.groupBy({
      by: ['segment'],
      where: { tenantId },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) out[g.segment] = g._count._all;
    return out;
  }
}

function buildRow(
  tenantId: string,
  s: RfmScored,
  calculatedAt: Date,
): Prisma.RfmScoreUncheckedCreateInput {
  return {
    tenantId,
    customerProfileId: s.customerProfileId,
    recencyDays: s.recencyDays,
    frequency: s.frequency,
    monetary: s.monetary.toString(),
    recencyScore: s.recencyScore,
    frequencyScore: s.frequencyScore,
    monetaryScore: s.monetaryScore,
    segment: s.segment,
    calculatedAt,
  };
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
