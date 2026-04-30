import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { INGEST_REPLAY_WINDOW_SECONDS } from '@datapp/shared/ingest';
import { TenantService } from '../tenant/tenant.service';
import { MagentoStoreService } from '../magento/magento-store.service';
import { isTimestampFresh, verifyHmac } from './hmac';
import type { IngestRequest } from './types';

@Injectable()
export class HmacGuard implements CanActivate {
  private readonly logger = new Logger(HmacGuard.name);

  constructor(
    private readonly tenants: TenantService,
    private readonly stores: MagentoStoreService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<IngestRequest>();

    const tenantSlug = this.firstHeader(req, 'x-crm-tenant');
    const storeName = this.firstHeader(req, 'x-crm-store');
    const timestamp = this.firstHeader(req, 'x-crm-timestamp');
    const signature = this.firstHeader(req, 'x-crm-signature');
    const eventIdHeader = this.firstHeader(req, 'x-crm-event-id');

    if (!tenantSlug || !storeName || !timestamp || !signature || !eventIdHeader) {
      this.logger.debug('Missing one or more X-Crm-* headers');
      throw new UnauthorizedException();
    }

    if (!isTimestampFresh(timestamp, INGEST_REPLAY_WINDOW_SECONDS, Math.floor(Date.now() / 1000))) {
      this.logger.debug('Webhook timestamp outside replay window');
      throw new UnauthorizedException();
    }

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      this.logger.warn('Ingest request has no raw body — check rawBody:true on bootstrap');
      throw new UnauthorizedException();
    }

    let tenant;
    let store;
    try {
      tenant = await this.tenants.findBySlug(tenantSlug);
      store = await this.stores.findByTenantAndName(tenant.id, storeName);
    } catch {
      // Don't leak which of tenant/store doesn't exist; both → 401.
      throw new UnauthorizedException();
    }

    if (!verifyHmac(store.hmacSecret, timestamp, rawBody.toString('utf8'), signature)) {
      this.logger.debug(`HMAC mismatch for tenant=${tenantSlug} store=${storeName}`);
      throw new UnauthorizedException();
    }

    req.ingest = { tenant, store };
    return true;
  }

  private firstHeader(req: IngestRequest, name: string): string | undefined {
    const v = req.headers[name];
    if (Array.isArray(v)) return v[0];
    return v;
  }
}
