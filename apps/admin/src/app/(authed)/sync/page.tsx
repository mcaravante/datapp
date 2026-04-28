import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-client';
import { formatBuenosAires } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { SyncStatusResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Sync' };

const STATUS_BADGE: Record<string, string> = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-info/15 text-info',
  error: 'bg-destructive/15 text-destructive',
  paused: 'bg-warning/15 text-warning',
};

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-muted-foreground',
  running: 'bg-info',
  error: 'bg-destructive',
  paused: 'bg-warning',
};

const STATUS_KEYS = ['idle', 'running', 'error', 'paused'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

function isStatusKey(value: string): value is StatusKey {
  return (STATUS_KEYS as readonly string[]).includes(value);
}

export default async function SyncStatusPage(): Promise<React.ReactElement> {
  const { data } = await apiFetch<SyncStatusResponse>('/v1/admin/sync/status');
  const t = await getTranslations('sync');
  const tStatuses = await getTranslations('sync.statuses');
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('table.store')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.entity')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.status')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.lastProcessed')}</th>
              <th className="px-4 py-3 font-semibold">{t('table.cursor')}</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {t('table.emptyPrefix')}{' '}
                  <code className="rounded bg-muted px-1 font-mono text-xs">
                    cli sync:customers:initial
                  </code>
                  .
                </td>
              </tr>
            )}
            {data.map((row) => {
              const badgeClass = STATUS_BADGE[row.status] ?? STATUS_BADGE.idle;
              const dotClass = STATUS_DOT[row.status] ?? STATUS_DOT.idle;
              const statusLabel = isStatusKey(row.status) ? tStatuses(row.status) : row.status;
              return (
                <tr
                  key={`${row.store}-${row.entity}`}
                  className="border-b border-border last:border-0 transition hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-foreground/80">{row.store}</td>
                  <td className="px-4 py-3 text-foreground">{row.entity}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`}
                        aria-hidden="true"
                      />
                      {statusLabel}
                    </span>
                    {row.last_error && (
                      <div
                        className="mt-1 max-w-md truncate text-xs text-destructive"
                        title={row.last_error}
                      >
                        {row.last_error}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.last_processed_at
                      ? formatBuenosAires(row.last_processed_at, locale)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.cursor ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
