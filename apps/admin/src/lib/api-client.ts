import 'server-only';
import { auth } from '@/auth';
import { getServerEnv } from './env';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`API ${status} ${path}: ${body.slice(0, 200)}`);
  }
}

/**
 * Server-side fetch wrapper. Pulls the access token from the Auth.js
 * session cookie and bolts it onto every request as `Authorization:
 * Bearer ...`. Use only from server components, route handlers, and
 * server actions.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = getServerEnv();
  const session = await auth();
  if (!session?.accessToken) {
    throw new ApiError(401, path, 'No session token');
  }

  const res = await fetch(`${env.APP_URL_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${session.accessToken}`,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  const body = await res.text();
  if (!res.ok) throw new ApiError(res.status, path, body);
  return body.length === 0 ? (undefined as T) : (JSON.parse(body) as T);
}
