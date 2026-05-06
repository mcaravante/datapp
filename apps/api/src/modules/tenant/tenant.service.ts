import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
}

export interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  allowed_origins: string[];
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

  async getSettings(tenantId: string): Promise<TenantSettings> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, name: true, allowedOrigins: true },
    });
    if (!tenant) throw new NotFoundException(`Tenant '${tenantId}' not found`);
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      allowed_origins: tenant.allowedOrigins,
    };
  }

  /**
   * Replace the allow-listed origins for a tenant. Each input is
   * normalised to `${protocol}//${host}` (no trailing slash, no path)
   * via the URL parser, so user-supplied "https://shop.com/" and
   * "HTTPS://Shop.com" both collapse to "https://shop.com" and dedupe.
   * Empty strings and unparseable values raise BadRequest.
   */
  async updateAllowedOrigins(
    tenantId: string,
    origins: string[],
  ): Promise<TenantSettings> {
    const normalised = new Set<string>();
    for (const raw of origins) {
      const trimmed = raw.trim();
      if (trimmed === '') continue;
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        throw new BadRequestException(`Invalid origin: "${raw}"`);
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new BadRequestException(
          `Origin must be http(s): "${raw}"`,
        );
      }
      // canonical form — exactly what the browser sends in the Origin
      // header. lowercase scheme+host, no port if default, no trailing
      // slash, no path.
      const port =
        (parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')
          ? ''
          : parsed.port
            ? `:${parsed.port}`
            : '';
      normalised.add(`${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}`);
    }
    const list = [...normalised].sort();
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { allowedOrigins: list },
      select: { id: true, slug: true, name: true, allowedOrigins: true },
    });
    this.logger.log(
      `Tenant ${tenantId} allowedOrigins updated: ${list.length} entries`,
    );
    return {
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      allowed_origins: updated.allowedOrigins,
    };
  }
}
