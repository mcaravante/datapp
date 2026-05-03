interface Series {
  id: string;
  label: string;
  /** 12 monthly values, January → December. Missing months should be 0. */
  values: number[];
  /**
   * Direct CSS color (hsl/hex/var). Used both for the SVG stroke and
   * the legend swatch. Direct color (rather than Tailwind class) lets
   * the caller hand-pick a palette where every year is visibly
   * distinct from its neighbours, which the theme tones can't always
   * guarantee.
   */
  stroke: string;
}

interface Props {
  series: Series[];
  monthLabels: string[];
  formatY?: (v: number) => string;
  height?: number;
}

const PADDING = { top: 16, right: 16, bottom: 30, left: 72 };

/**
 * Multi-line chart over a fixed 12-month x-axis. One line per year for
 * the YoY view; the series array is rendered in the order received, so
 * the caller can put older years behind newer ones with a darker tone.
 */
export function MultiLineChart({
  series,
  monthLabels,
  formatY = formatCompact,
  height = 280,
}: Props): React.ReactElement | null {
  if (series.length === 0 || monthLabels.length === 0) return null;
  const points = monthLabels.length;
  const width = 760;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const stepX = points > 1 ? innerW / (points - 1) : 0;

  const maxValue = Math.max(...series.flatMap((s) => s.values), 0);
  const niceMax = niceCeil(maxValue);

  const xFor = (i: number): number => PADDING.left + i * stepX;
  const yFor = (v: number): number => PADDING.top + innerH - (v / (niceMax || 1)) * innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
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
        {monthLabels.map((label, i) => (
          <text
            key={`x-${i}`}
            x={xFor(i)}
            y={height - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {label}
          </text>
        ))}
        {series.map((s) => {
          const path = s.values
            .map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
            .join(' ');
          return (
            <path
              key={s.id}
              d={path}
              fill="none"
              stroke={s.stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>{s.label}</title>
            </path>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-3 rounded"
              style={{ backgroundColor: s.stroke }}
              aria-hidden="true"
            />
            <span className="text-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
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
