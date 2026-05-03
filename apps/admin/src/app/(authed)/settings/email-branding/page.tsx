import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import { BrandingForm } from './branding-form';
import type { BrandingDto } from '@/lib/types';

export const metadata = { title: 'Datapp · Branding de email' };

export default async function EmailBrandingPage(): Promise<React.ReactElement> {
  let branding: BrandingDto;
  try {
    branding = await apiFetch<BrandingDto>('/v1/admin/email-branding');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Branding de email</h1>
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-5 text-sm">
            <p className="font-semibold text-warning">El motor de email está apagado.</p>
            <p className="mt-2 text-foreground">
              Activá <code>EMAIL_ENGINE_ENABLED=true</code> en Dokploy para usar el branding.
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
            Branding de email
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El logo, footer e info del sender se aplican a TODOS los emails que manda el CDP. El
            link de desuscripción se agrega automáticamente al final de cada email.
          </p>
        </div>
        <Link
          href="/templates"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a templates
        </Link>
      </div>

      <BrandingForm branding={branding} />
    </div>
  );
}
