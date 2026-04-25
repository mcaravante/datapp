import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a tenant by its URL/header slug. Throws 404 if absent. */
  async findBySlug(slug: string): Promise<ResolvedTenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) {
      this.logger.debug(`Tenant slug not found: ${slug}`);
      throw new NotFoundException(`Tenant '${slug}' not found`);
    }
    return tenant;
  }
}
