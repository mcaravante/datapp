import { Injectable } from '@nestjs/common';
import { Prisma } from '@datapp/db';
import type { UserRole } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';

/**
 * Sections in the admin sidebar that can be gated by role. Keys must
 * stay in sync with `apps/admin/src/components/layout/sidebar.tsx`.
 */
export const SECTIONS = [
  'overview',
  'customers',
  'segments',
  'orders',
  'carts',
  'products',
  'coupons',
  'regions',
  'insights',
  'sync',
] as const;
export type SectionKey = (typeof SECTIONS)[number];

export const CONFIGURABLE_ROLES = ['analyst', 'viewer'] as const satisfies readonly UserRole[];
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

/** Default access defined inline so a fresh tenant gets sane defaults. */
const DEFAULT_ACCESS: Record<ConfigurableRole, Record<SectionKey, boolean>> = {
  analyst: {
    overview: true,
    customers: true,
    segments: true,
    orders: true,
    carts: true,
    products: true,
    coupons: true,
    regions: true,
    insights: true,
    sync: true,
  },
  viewer: {
    overview: true,
    customers: true,
    segments: false,
    orders: true,
    carts: false,
    products: true,
    coupons: false,
    regions: true,
    insights: true,
    sync: false,
  },
};

export type AccessMatrix = Record<ConfigurableRole, Record<SectionKey, boolean>>;

export interface PermissionsResponse {
  sections: readonly SectionKey[];
  configurable_roles: readonly ConfigurableRole[];
  access: AccessMatrix;
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Read the matrix for a tenant, falling back to defaults for missing rows. */
  async load(tenantId: string): Promise<AccessMatrix> {
    const rows = await this.prisma.roleSectionAccess.findMany({
      where: {
        tenantId,
        role: { in: CONFIGURABLE_ROLES as readonly UserRole[] as UserRole[] },
      },
    });
    const result = cloneDefaults();
    for (const row of rows) {
      if (!isConfigurableRole(row.role)) continue;
      if (!isSection(row.section)) continue;
      result[row.role][row.section] = row.allowed;
    }
    return result;
  }

  /** True/false for a specific (role, section). admin and super_admin always pass. */
  async isAllowed(tenantId: string, role: UserRole, section: string): Promise<boolean> {
    if (role === 'super_admin' || role === 'admin') return true;
    if (!isSection(section)) return false;
    if (!isConfigurableRole(role)) return false;
    const matrix = await this.load(tenantId);
    return matrix[role][section] === true;
  }

  /**
   * Replace the matrix for the given roles. Body is the desired full
   * matrix; we upsert each cell in a single transaction so partial
   * failures don't leave a half-applied policy.
   */
  async save(tenantId: string, matrix: AccessMatrix): Promise<AccessMatrix> {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const role of CONFIGURABLE_ROLES) {
      for (const section of SECTIONS) {
        const allowed = matrix[role]?.[section] ?? DEFAULT_ACCESS[role][section];
        ops.push(
          this.prisma.roleSectionAccess.upsert({
            where: { tenantId_role_section: { tenantId, role, section } },
            update: { allowed },
            create: { tenantId, role, section, allowed },
          }),
        );
      }
    }
    await this.prisma.$transaction(ops);
    return this.load(tenantId);
  }
}

function cloneDefaults(): AccessMatrix {
  return {
    analyst: { ...DEFAULT_ACCESS.analyst },
    viewer: { ...DEFAULT_ACCESS.viewer },
  };
}

function isSection(value: string): value is SectionKey {
  return (SECTIONS as readonly string[]).includes(value);
}

function isConfigurableRole(value: UserRole): value is ConfigurableRole {
  return (CONFIGURABLE_ROLES as readonly string[]).includes(value);
}
