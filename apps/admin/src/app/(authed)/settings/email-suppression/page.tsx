import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import { SuppressionAdmin } from './suppression-admin';
import type { SuppressionsListResponse } from '@/lib/types';

export const metadata = { title: 'Datapp · Lista de bloqueos de email' };

interface PageProps {
  searchParams: Promise<{ q?: string; reason?: string }>;
}

export default async function EmailSuppressionPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.q) params.set('q', sp.q);
  if (sp.reason) params.set('reason', sp.reason);
  params.set('limit', '500');

  let response: SuppressionsListResponse;
  try {
    response = await apiFetch<SuppressionsListResponse>(
      `/v1/admin/email-suppressions?${params.toString()}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Lista de bloqueos
          </h1>
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-5 text-sm">
            <p className="font-semibold text-warning">El motor de email está apagado.</p>
            <p className="mt-2 text-foreground">
              Activá <code>EMAIL_ENGINE_ENABLED=true</code> en Dokploy para gestionar la lista.
            </p>
          </div>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Lista de bloqueos de email
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Direcciones que el sistema NO va a contactar. Las altas son automáticas (bounces,
            spam complaints, clicks de "Desuscribirme") o manuales desde acá.
          </p>
        </div>
        <Link href="/settings/email-branding" className="text-sm text-muted-foreground hover:text-foreground">
          ← Branding
        </Link>
      </div>

      <SuppressionAdmin
        rows={response.data}
        total={response.total}
        currentReason={sp.reason ?? ''}
        currentQuery={sp.q ?? ''}
      />
    </div>
  );
}
