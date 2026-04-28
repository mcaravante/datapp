import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatBuenosAires, formatNumber } from '@/lib/format';
import type { SegmentsListResponse } from '@/lib/types';

export const metadata = { title: 'CDP Admin · Segments' };

export default async function SegmentsListPage(): Promise<React.ReactElement> {
  const { data: segments } = await apiFetch<SegmentsListResponse>('/v1/admin/segments');

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Segments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Static customer segments. Membership snapshots at create time and refreshes on demand.
          </p>
        </div>
        <Link
          href="/segments/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New segment
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Description</th>
              <th className="px-4 py-3 font-semibold">Filters</th>
              <th className="px-4 py-3 text-right font-semibold">Members</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {segments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No segments yet. <Link href="/segments/new" className="text-primary hover:underline">Create one</Link>.
                </td>
              </tr>
            )}
            {segments.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border last:border-0 transition hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/segments/${s.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <FilterChips definition={s.definition} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatNumber(s.member_count)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatBuenosAires(s.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FilterChips({
  definition,
}: {
  definition: { q?: string; region_id?: number[]; customer_group?: string; rfm_segment?: string[] };
}): React.ReactElement {
  const chips: React.ReactElement[] = [];
  if (definition.q) {
    chips.push(<Chip key="q" label="search" value={definition.q} />);
  }
  if (definition.customer_group) {
    chips.push(<Chip key="cg" label="group" value={definition.customer_group} />);
  }
  if (definition.region_id && definition.region_id.length > 0) {
    chips.push(
      <Chip key="region" label="regions" value={`${definition.region_id.length} selected`} />,
    );
  }
  if (definition.rfm_segment && definition.rfm_segment.length > 0) {
    chips.push(
      <Chip
        key="rfm"
        label="RFM"
        value={definition.rfm_segment.map(prettySegment).join(', ')}
      />,
    );
  }
  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground">all customers</span>;
  }
  return <div className="flex flex-wrap gap-1.5">{chips}</div>;
}

function Chip({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function prettySegment(segment: string): string {
  return segment
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function PlusIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
