import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMagentoClient, type MagentoClient } from '@cdp/magento-client';
import type { Env } from '../../config/env';
import type { ResolvedMagentoStore } from './magento-store.service';

/**
 * Builds a Magento REST client per resolved store. Each call returns a
 * fresh client (so per-store rate limit buckets stay isolated). For
 * code paths that hit the same store on every job, callers should
 * memoize the client themselves.
 */
@Injectable()
export class MagentoClientFactory {
  constructor(private readonly config: ConfigService<Env, true>) {}

  forStore(store: ResolvedMagentoStore): MagentoClient {
    return createMagentoClient({
      baseUrl: store.baseUrl,
      adminToken: store.adminToken,
      rateLimitRps: this.config.get<number>('MAGENTO_RATE_LIMIT_RPS', { infer: true }),
    });
  }
}
