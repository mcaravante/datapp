import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

/** A magento_store resolved + decrypted, ready for HMAC verification. */
export interface ResolvedMagentoStore {
  id: string;
  tenantId: string;
  name: string;
  baseUrl: string;
  hmacSecret: string;
  adminToken: string;
  currencyCode: string;
  defaultCountry: string;
}

@Injectable()
export class MagentoStoreService {
  private readonly logger = new Logger(MagentoStoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async findByTenantAndName(tenantId: string, name: string): Promise<ResolvedMagentoStore> {
    const store = await this.prisma.magentoStore.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
    if (!store || !store.isActive) {
      this.logger.debug(`Magento store not found or inactive: ${tenantId}/${name}`);
      throw new NotFoundException(`Magento store '${name}' not found for tenant`);
    }
    return this.toResolved(store);
  }

  /**
   * First active store for the tenant. Phase 1 has exactly one store
   * per tenant; once that changes the caller will need to pass a
   * specific name or id.
   */
  async findFirstByTenant(tenantId: string): Promise<ResolvedMagentoStore> {
    const store = await this.prisma.magentoStore.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!store) {
      throw new NotFoundException(`No active Magento store found for tenant ${tenantId}`);
    }
    return this.toResolved(store);
  }

  async findById(id: string): Promise<ResolvedMagentoStore> {
    const store = await this.prisma.magentoStore.findUnique({ where: { id } });
    if (!store || !store.isActive) {
      this.logger.debug(`Magento store not found or inactive: id=${id}`);
      throw new NotFoundException(`Magento store ${id} not found or inactive`);
    }
    return this.toResolved(store);
  }

  private toResolved(store: {
    id: string;
    tenantId: string;
    name: string;
    baseUrl: string;
    hmacSecretEncrypted: Uint8Array;
    adminTokenEncrypted: Uint8Array;
    currencyCode: string;
    defaultCountry: string;
  }): ResolvedMagentoStore {
    return {
      id: store.id,
      tenantId: store.tenantId,
      name: store.name,
      baseUrl: store.baseUrl,
      hmacSecret: this.crypto.decrypt(Buffer.from(store.hmacSecretEncrypted)),
      adminToken: this.crypto.decrypt(Buffer.from(store.adminTokenEncrypted)),
      currencyCode: store.currencyCode,
      defaultCountry: store.defaultCountry,
    };
  }
}
