import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Proxy for media uploads. The browser POSTs a multipart form here; we
 * forward it (with the bearer token) to the API's
 * `POST /v1/admin/media`. Going through Next.js means the API token
 * never leaves the server, matching the rest of the admin's data path.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getServerEnv();

  // Stream the multipart body straight through. We don't need to parse
  // it on this hop — Express + multer on the API side does that.
  const upstream = await fetch(`${env.APP_URL_API}/v1/admin/media`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      // Preserve the original Content-Type (with the multipart boundary).
      'content-type': request.headers.get('content-type') ?? 'application/octet-stream',
    },
    body: request.body,
    // Required when forwarding a streaming body to fetch in Node.
    // @ts-expect-error - duplex is a runtime-only Node fetch option, not yet in TS lib.
    duplex: 'half',
  });

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
