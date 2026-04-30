import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSegment } from '../actions';
import type { RfmSegmentLabel, SegmentDefinition } from '@/lib/types';

export const metadata = { title: 'Datapp · New segment' };

interface PageProps {
  searchParams: Promise<{
    q?: string;
    customer_group?: string;
    rfm_segment?: string | string[];
    error?: string;
  }>;
}

const RFM_LABELS: RfmSegmentLabel[] = [
  'champions',
  'loyal',
  'potential_loyalists',
  'new_customers',
  'promising',
  'needing_attention',
  'about_to_sleep',
  'at_risk',
  'cannot_lose_them',
  'hibernating',
  'lost',
];

export default async function NewSegmentPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams;
  const initialRfm = Array.isArray(sp.rfm_segment)
    ? sp.rfm_segment
    : sp.rfm_segment
      ? [sp.rfm_segment]
      : [];

  async function submit(formData: FormData): Promise<void> {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    if (!name) {
      redirect('/segments/new?error=missing-name');
    }
    const description = String(formData.get('description') ?? '').trim() || undefined;
    const q = String(formData.get('q') ?? '').trim() || undefined;
    const customerGroup =
      String(formData.get('customer_group') ?? '').trim() || undefined;
    const rfmSegment = formData.getAll('rfm_segment').map(String) as RfmSegmentLabel[];

    const definition: SegmentDefinition = {};
    if (q) definition.q = q;
    if (customerGroup) definition.customer_group = customerGroup;
    if (rfmSegment.length > 0) definition.rfm_segment = rfmSegment;

    try {
      const created = await createSegment({
        name,
        ...(description ? { description } : {}),
        definition,
      });
      redirect(`/segments/${created.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg.includes('NEXT_REDIRECT')) throw err;
      redirect(`/segments/new?error=${encodeURIComponent(msg).slice(0, 200)}`);
    }
  }

  const t = await getTranslations('segments.form');
  const tCommon = await getTranslations('common');
  const tSegments = await getTranslations('segments');
  const tRfm = await getTranslations('segments.rfmLabels');

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <Link
          href="/segments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← {tSegments('title')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {sp.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sp.error === 'missing-name'
            ? t('missingName')
            : t('errorPrefix', { message: decodeURIComponent(sp.error) })}
        </p>
      )}

      <form
        action={submit}
        className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card"
      >
        <Field id="name" label={t('name')} required>
          <input
            id="name"
            name="name"
            required
            maxLength={100}
            placeholder={t('namePlaceholder')}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <Field id="description" label={t('description')}>
          <input
            id="description"
            name="description"
            maxLength={500}
            placeholder={t('descriptionPlaceholder')}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </Field>

        <fieldset className="space-y-3 border-t border-border pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('filters')}
          </legend>

          <Field id="q" label={t('search')}>
            <input
              id="q"
              name="q"
              defaultValue={sp.q ?? ''}
              maxLength={200}
              placeholder={t('searchPlaceholder')}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </Field>

          <Field id="customer_group" label={t('group')}>
            <input
              id="customer_group"
              name="customer_group"
              defaultValue={sp.customer_group ?? ''}
              maxLength={100}
              placeholder={t('groupPlaceholder')}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </Field>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-foreground">{t('rfm')}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {RFM_LABELS.map((label) => (
                <label
                  key={label}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground transition hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    name="rfm_segment"
                    value={label}
                    defaultChecked={initialRfm.includes(label)}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  <span>{tRfm(label)}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('rfmHint')}</p>
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-border pt-5">
          <Link
            href="/segments"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            {tCommon('cancel')}
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            {t('submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
