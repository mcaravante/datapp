import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { QUEUES } from './queue.constants';

const STANDARD_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 14 * 24 * 60 * 60 },
};

/**
 * Global BullMQ module. Registers the connection (Redis URL from env)
 * and all queue names defined in {@link QUEUES}. Workers are registered
 * by feature modules via `@Processor(QUEUES.x)`.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          url: config.get<string>('REDIS_URL', { infer: true }),
        },
        defaultJobOptions: STANDARD_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(...Object.values(QUEUES).map((name) => ({ name }))),
  ],
  exports: [BullModule],
})
export class QueueModule {}
