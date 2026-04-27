import { apiFetch } from '@/lib/api-client';
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

export default async function SyncStatusPage(): Promise<React.ReactElement> {
  const { data } = await apiFetch<SyncStatusResponse>('/v1/admin/sync/status');

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sync status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per Magento store × entity. Manual triggers and queue depth land in Iteration 4.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Store</th>
              <th className="px-4 py-3 font-semibold">Entity</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Last processed</th>
              <th className="px-4 py-3 font-semibold">Cursor</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No sync activity yet. Run{' '}
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
                      {row.status}
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
                    {row.last_processed_at ? formatBuenosAires(row.last_processed_at) : '—'}
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

const FORMATTER = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatBuenosAires(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return FORMATTER.format(d);
}
