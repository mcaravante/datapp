import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import { fetchBlueHistory, type BlueRate } from './bluelytics.client';

@Injectable()
export class CurrencyRatesService {
  private readonly logger = new Logger(CurrencyRatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pull the full Bluelytics history and upsert each row. Idempotent —
   * safe to re-run; only changed days touch the database.
   */
  async backfillBlue(): Promise<{ scanned: number; upserted: number }> {
    const rates = await fetchBlueHistory();
    return this.upsertMany(rates);
  }

  /**
   * Refresh the last few days. Cheap (1 HTTP + ≤ 7 upserts) and the
   * recommended way to stay current. Run from a daily BullMQ cron.
   */
  async refreshDaily(days = 7): Promise<{ scanned: number; upserted: number }> {
    const rates = await fetchBlueHistory(days);
    return this.upsertMany(rates);
  }

  private async upsertMany(rates: BlueRate[]): Promise<{ scanned: number; upserted: number }> {
    let upserted = 0;
    for (const r of rates) {
      const buy = new Prisma.Decimal(r.buy);
      const sell = new Prisma.Decimal(r.sell);
      const avg = buy.plus(sell).div(2);
      await this.prisma.currencyRate.upsert({
        where: { date: r.date },
        create: {
          date: r.date,
          source: 'bluelytics',
          blueBuy: buy,
          blueSell: sell,
          blueAvg: avg,
        },
        update: { blueBuy: buy, blueSell: sell, blueAvg: avg, fetchedAt: new Date() },
      });
      upserted += 1;
    }
    this.logger.log(`Bluelytics upsert: scanned=${rates.length} upserted=${upserted}`);
    return { scanned: rates.length, upserted };
  }
}
