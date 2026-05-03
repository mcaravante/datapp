import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { TemplateEditor } from './template-editor';
import type { EmailTemplateDetail } from '@/lib/types';

export const metadata = { title: 'Datapp · Editar template' };

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const template = await apiFetch<EmailTemplateDetail>(`/v1/admin/email-templates/${id}`);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {template.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Slug: <span className="font-mono">{template.slug}</span> · canal{' '}
            <span className="font-mono">{template.channel}</span> · formato{' '}
            <span className="font-mono">{template.format.toUpperCase()}</span>
          </p>
        </div>
        <Link href="/templates" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver al listado
        </Link>
      </div>

      <TemplateEditor template={template} />
    </div>
  );
}
