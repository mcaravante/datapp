import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatBuenosAires, formatNumber } from '@/lib/format';
import type { SegmentMembersPage, SegmentSummary } from '@/lib/types';
import { FilterChips } from '../page';
import { SegmentActions } from '@/components/segment-actions';

export const metadata = { title: 'CDP Admin · Segment' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SegmentDetailPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { id } = await params;

  let segment: SegmentSummary;
  try {
    segment = await apiFetch<SegmentSummary>(`/v1/admin/segments/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const members = await apiFetch<SegmentMembersPage>(
    `/v1/admin/segments/${id}/members?limit=50`,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/segments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Segments
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {segment.name}
            </h1>
            {segment.description && (
              <p className="mt-1 text-sm text-muted-foreground">{segment.description}</p>
            )}
          </div>
          <SegmentActions segmentId={segment.id} segmentName={segment.name} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          label="Members"
          value={formatNumber(segment.member_count)}
          accent="primary"
        />
        <Tile label="Type" value={segment.type} />
        <Tile label="Last refreshed" value={formatBuenosAires(segment.updated_at)} sub={`created ${formatBuenosAires(segment.created_at)}`} />
      </div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filter definition
        </h2>
        <FilterChips definition={segment.definition} />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Members ({formatNumber(segment.member_count)})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Showing the first {members.data.length}. Member list is a snapshot — use{' '}
            <span className="font-medium text-foreground">Refresh</span> to recompute against
            current data.
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Group</th>
              <th className="px-4 py-2 font-semibold">Added</th>
            </tr>
          </thead>
          <tbody>
            {members.data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No members in this segment.
                </td>
              </tr>
            )}
            {members.data.map((m) => (
              <tr
                key={m.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/30"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/customers/${m.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {m.email}
                  </Link>
                </td>
                <td className="px-4 py-2 text-foreground/80">
                  {[m.first_name, m.last_name].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{m.customer_group ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {formatBuenosAires(m.added_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  accent = 'muted',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'primary' | 'muted';
}): React.ReactElement {
  const tone = accent === 'primary' ? 'border-l-4 border-l-primary' : '';
  return (
    <div
      className={`rounded-lg border border-border bg-card p-5 shadow-card transition hover:shadow-elevated ${tone}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
