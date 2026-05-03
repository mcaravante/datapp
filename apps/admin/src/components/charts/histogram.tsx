interface Bucket {
  min: number;
  max: number;
  count: number;
}

interface Props {
  buckets: Bucket[];
  /** Optional median to highlight as a vertical line. */
  median?: number;
  formatX?: (v: number) => string;
  formatCount?: (n: number) => string;
  height?: number;
}

const PADDING = { top: 12, right: 12, bottom: 28, left: 56 };

/** Equal-width histogram with an optional median marker. Pure SVG. */
export function Histogram({
  buckets,
  median,
  formatX = (v) => formatCompact(v),
  formatCount = (n) => formatCompact(n),
  height = 220,
}: Props): React.ReactElement | null {
  if (buckets.length === 0) return null;

  const width = 720;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const barW = innerW / buckets.length;
  const maxCount = Math.max(...buckets.map((b) => b.count), 0);
  const niceMax = niceCeil(maxCount);

  const yFor = (v: number): number => PADDING.top + innerH - (v / (niceMax || 1)) * innerH;
  const xFor = (i: number): number => PADDING.left + i * barW;

  const minX = buckets[0]?.min ?? 0;
  const maxX = buckets[buckets.length - 1]?.max ?? minX + 1;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  return (
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
              {formatCount(t)}
            </text>
          </g>
        );
      })}
      {/* X labels: 5 ticks evenly across the range. */}
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const x = PADDING.left + f * innerW;
        const value = minX + (maxX - minX) * f;
        return (
          <text
            key={`x-${i}`}
            x={x}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {formatX(value)}
          </text>
        );
      })}
      {/* Bars */}
      {buckets.map((b, i) => {
        const y = yFor(b.count);
        const baseY = yFor(0);
        return (
          <rect
            key={`b-${i}`}
            x={xFor(i)}
            y={y}
            width={Math.max(1, barW - 1)}
            height={Math.max(0, baseY - y)}
            className="fill-primary/70"
          >
            <title>{`${formatX(b.min)} – ${formatX(b.max)} · ${b.count}`}</title>
          </rect>
        );
      })}
      {/* Median marker */}
      {median !== undefined && median > minX && median < maxX && (
        <g>
          <line
            x1={PADDING.left + ((median - minX) / (maxX - minX)) * innerW}
            x2={PADDING.left + ((median - minX) / (maxX - minX)) * innerW}
            y1={PADDING.top}
            y2={PADDING.top + innerH}
            stroke="hsl(var(--accent))"
            strokeDasharray="3 3"
            strokeWidth="2"
          />
          <text
            x={PADDING.left + ((median - minX) / (maxX - minX)) * innerW + 6}
            y={PADDING.top + 12}
            className="fill-accent text-[10px] font-medium"
          >
            {formatX(median)}
          </text>
        </g>
      )}
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
