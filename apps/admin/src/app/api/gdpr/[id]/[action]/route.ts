import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';

type Action = 'export' | 'erase';

const ACTIONS: Record<Action, { method: 'GET' | 'POST'; apiSubpath: string }> = {
  export: { method: 'GET', apiSubpath: 'gdpr/export' },
  erase: { method: 'POST', apiSubpath: 'gdpr/erase' },
};

interface RouteParams {
  id: string;
  action: string;
}

async function proxy(
  request: Request,
  { params }: { params: Promise<RouteParams> },
  expected: 'GET' | 'POST',
): Promise<Response> {
  const { id, action } = await params;
  const def = ACTIONS[action as Action];
  if (!def || def.method !== expected) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getServerEnv();
  const url = `${env.APP_URL_API}/v1/admin/customers/${id}/${def.apiSubpath}`;

  const upstream = await fetch(url, {
    method: def.method,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'application/json',
  );
  const dispo = upstream.headers.get('content-disposition');
  if (dispo) headers.set('Content-Disposition', dispo);

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<RouteParams> },
): Promise<Response> {
  return proxy(request, ctx, 'GET');
}

export async function POST(
  request: Request,
  ctx: { params: Promise<RouteParams> },
): Promise<Response> {
  return proxy(request, ctx, 'POST');
}
