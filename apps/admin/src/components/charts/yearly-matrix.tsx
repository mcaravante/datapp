import type { Locale } from '@/i18n/config';

interface YearRow {
  /** Display label of the year (e.g. `"2025"`). */
  label: string;
  /** Color matching the chart line so chart + table read as one unit. */
  stroke: string;
  /** 12 values January → December. */
  values: number[];
  /** Annual total — formatted by the caller. */
  total: string;
}

interface Props {
  rows: YearRow[];
  monthLabels: string[];
  /** Per-cell formatter (revenue uses compact, orders use plain numbers). */
  formatCell: (value: number) => string;
  totalLabel: string;
  yearLabel: string;
}

/**
 * Tabular companion to the YoY line chart. Same data, indexed by year
 * × month, with totals on the right edge. The colored dot in front of
 * each year matches the chart legend so the operator can switch
 * between visual and numeric reading without re-mapping the palette.
 */
export function YearlyMatrix({
  rows,
  monthLabels,
  formatCell,
  totalLabel,
  yearLabel,
}: Props): React.ReactElement | null {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 font-semibold">
              {yearLabel}
            </th>
            {monthLabels.map((m) => (
              <th key={m} className="px-2 py-2 text-right font-semibold">
                {m}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold">{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: row.stroke }}
                    aria-hidden="true"
                  />
                  {row.label}
                </span>
              </td>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className={`px-2 py-2 text-right tabular-nums ${
                    v === 0 ? 'text-muted-foreground/50' : 'text-foreground/80'
                  }`}
                >
                  {v === 0 ? '—' : formatCell(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
