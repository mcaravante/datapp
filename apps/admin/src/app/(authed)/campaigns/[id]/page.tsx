import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { CampaignEditor } from './campaign-editor';
import type { EmailCampaignDetail, EmailTemplateSummary } from '@/lib/types';

export const metadata = { title: 'Datapp · Editar campaña' };

export default async function CampaignEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const [campaign, templatesResp] = await Promise.all([
    apiFetch<EmailCampaignDetail>(`/v1/admin/email-campaigns/${id}`),
    apiFetch<{ data: EmailTemplateSummary[] }>('/v1/admin/email-templates'),
  ]);
  const templates = templatesResp.data.filter((t) => t.is_active);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{campaign.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Slug: <span className="font-mono">{campaign.slug}</span> · trigger{' '}
            <span className="font-mono">{campaign.trigger}</span>
          </p>
        </div>
        <Link href="/campaigns" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver al listado
        </Link>
      </div>

      <CampaignEditor campaign={campaign} templates={templates} />
    </div>
  );
}
