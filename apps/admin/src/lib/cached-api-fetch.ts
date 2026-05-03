import 'server-only';
import { unstable_cache } from 'next/cache';
import { auth } from '@/auth';
import { ApiError } from './api-client';
import { getServerEnv } from './env';

const DEFAULT_TTL_SECONDS = 900; // 15 minutes

/**
 * Tenant-scoped cached wrapper around `apiFetch` for expensive aggregation
 * endpoints (insights, geo, top-products, coupons).
 *
 * Tag scheme: every cached entry is tagged `tenant:<id>`, so the
 * "Refresh cache" button on /system can drop the entire tenant
 * namespace via `revalidateTag('tenant:<id>')`.
 *
 * The bearer token is captured by closure (NOT passed as an argument)
 * so the cache key stays stable across users of the same tenant —
 * otherwise every operator would hit a cold cache. Tokens expire faster
 * than the TTL and the closure is re-created on each call, so the
 * captured token is always current at the moment Next.js executes the
 * fetcher (which only happens on cache miss / revalidation).
 */
export async function cachedApiFetch<T>(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<T> {
  const session = await auth();
  if (!session?.accessToken || !session.user?.tenantId) {
    throw new ApiError(401, path, 'No session token');
  }
  const tenantId = session.user.tenantId;
  const accessToken = session.accessToken;
  const env = getServerEnv();

  const fetcher = unstable_cache(
    async (): Promise<T> => {
      const res = await fetch(`${env.APP_URL_API}${path}`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        cache: 'no-store',
      });
      const body = await res.text();
      if (!res.ok) throw new ApiError(res.status, path, body);
      return body.length === 0 ? (undefined as T) : (JSON.parse(body) as T);
    },
    ['api-fetch', tenantId, path],
    { revalidate: ttlSeconds, tags: [`tenant:${tenantId}`] },
  );

  return fetcher();
}
