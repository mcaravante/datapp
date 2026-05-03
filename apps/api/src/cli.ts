import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from './app.module';
import { runBootstrapMagentoStore } from './cli/bootstrap-magento-store';
import { runSyncCustomersInitial } from './cli/sync-customers-initial';
import { runSyncOrdersInitial } from './cli/sync-orders-initial';
import { runSyncCartsAbandoned } from './cli/sync-carts-abandoned';
import { runBackfillOrderRegion } from './cli/backfill-order-region';
import { runBackfillBlueRates } from './cli/backfill-blue-rates';
import { runCleanupGeoUnmatched } from './cli/cleanup-geo-unmatched';
import { runBackfillShippingMethod } from './cli/backfill-shipping-method';
import { runCreateAdmin } from './cli/create-admin';
import { runRfmCompute } from './cli/rfm-compute';
import { runEmailRecoveryE2e } from './cli/email-recovery-e2e';

type CliCommand = (app: INestApplicationContext, argv: string[]) => Promise<number>;

const COMMANDS: Readonly<Record<string, CliCommand>> = {
  'magento-store:bootstrap': runBootstrapMagentoStore,
  'sync:customers:initial': runSyncCustomersInitial,
  'sync:orders:initial': runSyncOrdersInitial,
  'sync:carts:abandoned': runSyncCartsAbandoned,
  'orders:backfill-region': runBackfillOrderRegion,
  'rates:blue:backfill': runBackfillBlueRates,
  'geo:unmatched:cleanup': runCleanupGeoUnmatched,
  'orders:backfill-shipping': runBackfillShippingMethod,
  'rfm:compute': runRfmCompute,
  'create-admin': runCreateAdmin,
  'email:e2e': runEmailRecoveryE2e,
};

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const rest = process.argv.slice(3);

  if (!cmd || !(cmd in COMMANDS)) {
    console.error('Usage: cli <command> [...args]');
    console.error(`Available commands:`);
    for (const name of Object.keys(COMMANDS)) console.error(`  - ${name}`);
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  let exitCode = 1;
  try {
    exitCode = await COMMANDS[cmd]!(app, rest);
  } catch (err) {
    console.error('CLI command threw:', err);
  } finally {
    await app.close();
  }
  process.exit(exitCode);
}

void main();
