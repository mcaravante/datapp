import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { CurrencyRatesService } from '../modules/currency-rates/currency-rates.service';

/**
 * One-shot import of the entire Bluelytics history. Idempotent — safe
 * to re-run after migration. Daily updates happen automatically via
 * `CurrencyRatesModule.onModuleInit`.
 *
 * Usage: pnpm --filter @datapp/api cli rates:blue:backfill
 */
export async function runBackfillBlueRates(
  app: INestApplicationContext,
): Promise<number> {
  const logger = new Logger('rates:blue:backfill');
  const rates = app.get(CurrencyRatesService);
  logger.log('Pulling full Bluelytics evolution …');
  const result = await rates.backfillBlue();
  logger.log(`Done. scanned=${result.scanned} upserted=${result.upserted}`);
  return 0;
}
