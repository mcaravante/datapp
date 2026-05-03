import { Global, Module, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { CurrencyRatesService } from './currency-rates.service';

/**
 * Daily refresh of the Bluelytics quote. Runs once on app boot so a
 * brand-new deploy doesn't have to wait until tomorrow for fresh data,
 * and then on a 24h timer. Failures are logged but don't crash the
 * process — analytics still works on the previously-cached rates.
 */
@Global()
@Module({
  providers: [CurrencyRatesService, Logger],
  exports: [CurrencyRatesService],
})
export class CurrencyRatesModule implements OnModuleInit {
  private readonly REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly rates: CurrencyRatesService,
    private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    this.scheduleNext(0); // first run immediately, then every 24h
  }

  private scheduleNext(initialDelayMs: number): void {
    this.timer = setTimeout(() => {
      void this.tick();
    }, initialDelayMs);
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.rates.refreshDaily(7);
      this.logger.log(
        `currency-rates daily refresh: scanned=${result.scanned} upserted=${result.upserted}`,
      );
    } catch (err) {
      this.logger.warn(
        `currency-rates daily refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.timer = setTimeout(() => void this.tick(), this.REFRESH_INTERVAL_MS);
    }
  }
}
