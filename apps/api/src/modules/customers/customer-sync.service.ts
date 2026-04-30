import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import type { MagentoCustomer } from '@datapp/magento-client';
import { PrismaService } from '../../db/prisma.service';
import { RegionResolverService } from '../geo/region-resolver.service';
import { mapCustomer, type MappedAddress, type MappedCustomer } from './customer-mapper';

export interface SyncContext {
  tenantId: string;
  defaultCountry: string;
}

@Injectable()
export class CustomerSyncService {
  private readonly logger = new Logger(CustomerSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly regions: RegionResolverService,
  ) {}

  /**
   * Idempotent upsert of one Magento customer. Replaces the customer's
   * addresses (Magento is the source of truth — no merging). Logs any
   * unmatched regions to `geo_unmatched`.
   */
  async upsert(ctx: SyncContext, raw: MagentoCustomer): Promise<{ id: string; created: boolean }> {
    const m = mapCustomer(raw, this.regions, ctx.defaultCountry);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerProfile.findUnique({
        where: {
          tenantId_magentoCustomerId: {
            tenantId: ctx.tenantId,
            magentoCustomerId: m.magentoCustomerId,
          },
        },
        select: { id: true },
      });

      const profile = existing
        ? await tx.customerProfile.update({
            where: { id: existing.id },
            data: profileUpdateData(m),
            select: { id: true },
          })
        : await tx.customerProfile.create({
            data: profileCreateData(m, ctx.tenantId),
            select: { id: true },
          });

      // Replace addresses wholesale — Magento is canonical.
      await tx.customerAddress.deleteMany({ where: { customerProfileId: profile.id } });
      if (m.addresses.length > 0) {
        await tx.customerAddress.createMany({
          data: m.addresses.map((a) => addressCreateData(a, profile.id, ctx.tenantId)),
        });
      }

      // Geo unmatched audit. We can't use a Prisma `upsert` with the composite
      // unique because the key includes nullable columns and Postgres' default
      // NULLS DISTINCT semantics make NULL values not collide. Find-then-
      // update/create keeps semantics simple at the cost of an extra round-trip
      // per unmatched address (rare in practice).
      for (const u of m.unmatchedRegions) {
        const found = await tx.geoUnmatched.findFirst({
          where: {
            tenantId: ctx.tenantId,
            regionRaw: u.regionRaw,
            cityRaw: u.cityRaw,
            postalCode: u.postalCode,
          },
          select: { id: true },
        });
        if (found) {
          await tx.geoUnmatched.update({
            where: { id: found.id },
            data: { occurrences: { increment: 1 }, lastSeenAt: new Date() },
          });
        } else {
          await tx.geoUnmatched.create({
            data: {
              tenantId: ctx.tenantId,
              regionRaw: u.regionRaw,
              cityRaw: u.cityRaw,
              postalCode: u.postalCode,
            },
          });
        }
      }

      return { id: profile.id, created: !existing };
    });
  }
}

function profileCreateData(
  m: MappedCustomer,
  tenantId: string,
): Prisma.CustomerProfileUncheckedCreateInput {
  return {
    tenantId,
    magentoCustomerId: m.magentoCustomerId,
    email: m.email,
    emailHash: m.emailHash,
    firstName: m.firstName,
    lastName: m.lastName,
    phone: m.phone,
    dob: m.dob,
    gender: m.gender,
    customerGroup: m.customerGroup,
    magentoCreatedAt: m.magentoCreatedAt,
    magentoUpdatedAt: m.magentoUpdatedAt,
    attributes: m.attributes as Prisma.InputJsonValue,
  };
}

function profileUpdateData(m: MappedCustomer): Prisma.CustomerProfileUncheckedUpdateInput {
  return {
    magentoCustomerId: m.magentoCustomerId,
    email: m.email,
    emailHash: m.emailHash,
    firstName: m.firstName,
    lastName: m.lastName,
    phone: m.phone,
    dob: m.dob,
    gender: m.gender,
    customerGroup: m.customerGroup,
    magentoCreatedAt: m.magentoCreatedAt,
    magentoUpdatedAt: m.magentoUpdatedAt,
    attributes: m.attributes as Prisma.InputJsonValue,
  };
}

function addressCreateData(
  a: MappedAddress,
  customerProfileId: string,
  tenantId: string,
): Prisma.CustomerAddressCreateManyInput {
  return {
    tenantId,
    customerProfileId,
    type: a.type,
    isDefaultBilling: a.isDefaultBilling,
    isDefaultShipping: a.isDefaultShipping,
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    regionId: a.regionId,
    regionRaw: a.regionRaw,
    postalCode: a.postalCode,
    countryCode: a.countryCode,
    phone: a.phone,
  };
}
