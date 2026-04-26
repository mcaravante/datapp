import { apiFetch } from '@/lib/api-client';
import type { SyncStatusResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Sync' };

const STATUS_BADGE: Record<string, string> = {
  idle: 'bg-neutral-100 text-neutral-700',
  running: 'bg-blue-100 text-blue-700',
  error: 'bg-red-100 text-red-700',
  paused: 'bg-amber-100 text-amber-700',
};

export default async function SyncStatusPage(): Promise<React.ReactElement> {
  const { data } = await apiFetch<SyncStatusResponse>('/v1/admin/sync/status');

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Sync status</h1>
        <p className="mt-1 text-sm text-neutral-500">
          One row per Magento store × entity. Manual triggers and queue depth land in Iteration 4.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last processed</th>
              <th className="px-4 py-3 font-medium">Cursor</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                  No sync activity yet. Run{' '}
                  <code className="rounded bg-neutral-100 px-1">cli sync:customers:initial</code>.
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr
                key={`${row.store}-${row.entity}`}
                className="border-b border-neutral-100 last:border-0"
              >
                <td className="px-4 py-3 text-neutral-700">{row.store}</td>
                <td className="px-4 py-3 text-neutral-900">{row.entity}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? STATUS_BADGE.idle}`}
                  >
                    {row.status}
                  </span>
                  {row.last_error && (
                    <div
                      className="mt-1 max-w-md truncate text-xs text-red-600"
                      title={row.last_error}
                    >
                      {row.last_error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {row.last_processed_at ? formatBuenosAires(row.last_processed_at) : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                  {row.cursor ?? '—'}
                </td>
              </tr>
            ))}
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
