interface Series {
  /** Stable key for React. */
  id: string;
  /** Human label for the legend. */
  label: string;
  values: number[];
  /** Optional dates (same length as `values`) for x-axis labels. */
  dates?: string[];
  tone: 'primary' | 'muted';
  /** Style: solid (current) or dashed (previous period overlay). */
  variant?: 'solid' | 'dashed';
}

interface Props {
  series: Series[];
  height?: number;
  /** Number of horizontal grid lines. */
  yTicks?: number;
  /** Shown above the y-axis (e.g. "ARS"). */
  yUnit?: string;
  /** Formatter for the y-axis tick labels. Defaults to compact numbers. */
  formatY?: (v: number) => string;
  /** Formatter for x-axis tick labels (receives ISO date string). */
  formatX?: (date: string) => string;
}

const PADDING = { top: 10, right: 12, bottom: 24, left: 56 };

/**
 * Pure-SVG line chart with an optional second series overlay (typically
 * the previous period). Server-rendered, no client JS. Designed to be
 * legible on the dashboard at ~300px tall.
 *
 * Y-axis is shared across series — the chart picks `max(all values)`
 * so a small previous period reads at the same scale as a big current
 * one. X-axis labels render on the longest series.
 */
export function LineChart({
  series,
  height = 240,
  yTicks = 4,
  yUnit,
  formatY = formatCompact,
  formatX = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
}: Props): React.ReactElement | null {
  const filtered = series.filter((s) => s.values.length > 0);
  if (filtered.length === 0) return null;

  const longest = filtered.reduce((a, b) => (a.values.length >= b.values.length ? a : b));
  const width = 720;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const maxValue = Math.max(...filtered.flatMap((s) => s.values), 0);
  const niceMax = niceCeil(maxValue);

  const xFor = (i: number, n: number): number =>
    PADDING.left + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2);
  const yFor = (v: number): number => PADDING.top + innerH - (v / (niceMax || 1)) * innerH;

  const pathFor = (s: Series): string =>
    s.values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i, s.values.length).toFixed(2)} ${yFor(v).toFixed(2)}`)
      .join(' ');

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (niceMax * i) / yTicks);

  // Sample x labels: at most 8 to avoid overlapping
  const labelStep = Math.max(1, Math.ceil(longest.values.length / 8));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      {yUnit && (
        <text
          x={PADDING.left - 8}
          y={PADDING.top - 2}
          textAnchor="end"
          className="fill-muted-foreground text-[10px]"
        >
          {yUnit}
        </text>
      )}
      {/* Y grid + labels */}
      {ticks.map((t, i) => {
        const y = yFor(t);
        return (
          <g key={`y-${i}`}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y}
              y2={y}
              stroke="hsl(var(--border))"
              strokeDasharray={i === 0 ? '0' : '2 4'}
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {formatY(t)}
            </text>
          </g>
        );
      })}
      {/* X labels */}
      {longest.dates?.map((iso, i) => {
        if (i % labelStep !== 0) return null;
        return (
          <text
            key={`x-${i}`}
            x={xFor(i, longest.values.length)}
            y={height - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {formatX(iso)}
          </text>
        );
      })}
      {/* Series — previous first so current draws on top. */}
      {filtered
        .slice()
        .sort((a, b) => (a.tone === 'muted' ? -1 : 1))
        .map((s) => (
          <path
            key={s.id}
            d={pathFor(s)}
            fill="none"
            stroke={s.tone === 'primary' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
            strokeWidth={s.tone === 'primary' ? '2' : '1.5'}
            strokeDasharray={s.variant === 'dashed' ? '4 3' : '0'}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.tone === 'muted' ? 0.5 : 1}
          />
        ))}
    </svg>
  );
}

function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const ratio = n / base;
  const nice = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10;
  return nice * base;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toString();
}
