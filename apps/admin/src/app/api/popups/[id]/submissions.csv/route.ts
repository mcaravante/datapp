import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';

/**
 * Proxies the popup-submissions CSV from the API. Browser auths with
 * its NextAuth cookie; we attach the API Bearer token server-side.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getServerEnv();
  const url = `${env.APP_URL_API}/v1/admin/popups/${id}/submissions.csv`;

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

  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'text/csv; charset=utf-8',
  );
  const dispo = upstream.headers.get('content-disposition');
  if (dispo) headers.set('Content-Disposition', dispo);
  return new Response(upstream.body, { status: 200, headers });
}
