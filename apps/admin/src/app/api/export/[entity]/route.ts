import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';

const ENTITY_PATHS: Record<string, string> = {
  customers: '/v1/admin/customers/export.csv',
  orders: '/v1/admin/orders/export.csv',
  products: '/v1/admin/analytics/top-products/export.csv',
  regions: '/v1/admin/analytics/geo/export.csv',
};

/**
 * Streams a CSV export from the API back to the browser. The browser
 * authenticates with its Next.js session cookie; we add the API
 * Bearer token server-side. Reachable as
 * `/api/export/<entity>?<filters>`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
): Promise<Response> {
  const { entity } = await params;
  const apiPath = ENTITY_PATHS[entity];
  if (!apiPath) {
    return NextResponse.json({ error: `Unknown export entity: ${entity}` }, { status: 404 });
  }

  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getServerEnv();
  const incomingQs = new URL(request.url).searchParams.toString();
  const url = `${env.APP_URL_API}${apiPath}${incomingQs ? `?${incomingQs}` : ''}`;

  const upstream = await fetch(url, {
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      accept: 'text/csv',
    },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return NextResponse.json(
      { error: `Upstream ${upstream.status}`, body: body.slice(0, 500) },
      { status: upstream.status },
    );
  }

  // Pass through Content-Type and Content-Disposition so the browser
  // saves the file with the API-provided filename.
  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'text/csv; charset=utf-8',
  );
  const dispo = upstream.headers.get('content-disposition');
  if (dispo) headers.set('Content-Disposition', dispo);

  return new Response(upstream.body, { status: 200, headers });
}
