import 'server-only';
import { apiFetch, ApiError } from '@/lib/api-client';
import type {
  AccessMatrix,
  AdminRole,
  AdminSection,
  ConfigurableRole,
  PermissionsResponse,
} from '@/lib/types';

const FULL_ACCESS: Record<AdminSection, boolean> = {
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
};

/**
 * Section access for the active user. super_admin and admin always
 * see every section; analyst and viewer follow the persisted matrix.
 *
 * Falls back to the same defaults when the API can't be reached so
 * the admin shell still renders during a transient outage.
 */
export async function fetchSectionAccess(
  role: AdminRole,
): Promise<Record<AdminSection, boolean>> {
  if (role === 'super_admin' || role === 'admin') return { ...FULL_ACCESS };

  try {
    const data = await apiFetch<PermissionsResponse>('/v1/admin/permissions');
    const cfgRole = role as ConfigurableRole;
    return data.access[cfgRole] ?? { ...FULL_ACCESS };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      // Non-admin tokens can't read /v1/admin/permissions; the API gates
      // it to admin/super_admin. Use a fresh per-tenant fetch isn't
      // possible — fall back to the schema defaults baked into the
      // migration so the sidebar still hides the same things.
      return defaultsForRole(role);
    }
    return { ...FULL_ACCESS };
  }
}

function defaultsForRole(role: AdminRole): Record<AdminSection, boolean> {
  if (role === 'analyst') return { ...FULL_ACCESS };
  if (role === 'viewer') {
    return {
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
    };
  }
  return { ...FULL_ACCESS };
}

export function isSectionAllowed(
  access: Record<AdminSection, boolean>,
  section: AdminSection,
): boolean {
  return access[section] === true;
}

export type { AccessMatrix };
