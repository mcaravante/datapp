interface Item {
  label: string;
  value: number;
}

interface Props {
  items: Item[];
  /** Formatter for the y-axis labels of the value axis. */
  formatY?: (v: number) => string;
  /** Items beyond this index get truncated for readability. */
  topN?: number;
  height?: number;
}

const PADDING = { top: 16, right: 56, bottom: 60, left: 56 };

/**
 * Pareto chart: bars (descending value) + cumulative-percentage line.
 * The 80% reference line is drawn dashed so the operator can see
 * exactly which SKUs make up the heavy tail.
 */
export function ParetoChart({
  items,
  formatY = (v) => formatCompact(v),
  topN = 30,
  height = 280,
}: Props): React.ReactElement | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, topN);
  const total = sorted.reduce((s, it) => s + it.value, 0);
  if (total <= 0) return null;

  const width = 720;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const barW = Math.max(2, innerW / sorted.length - 2);
  const maxValue = sorted[0]?.value ?? 0;
  const niceMax = niceCeil(maxValue);

  const yValueFor = (v: number): number =>
    PADDING.top + innerH - (v / (niceMax || 1)) * innerH;
  const yPctFor = (pct: number): number => PADDING.top + innerH - pct * innerH;

  let acc = 0;
  const cumulative = sorted.map((it) => {
    acc += it.value;
    return acc / total;
  });

  const linePath = cumulative
    .map((pct, i) => {
      const x = PADDING.left + i * (innerW / sorted.length) + barW / 2;
      const y = yPctFor(pct);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const ticksLeft = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  // Locate the bar where cumulative first crosses 80% — that's the
  // "vital few" cutoff.
  const eightyIdx = cumulative.findIndex((p) => p >= 0.8);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      {ticksLeft.map((t, i) => {
        const y = yValueFor(t);
        return (
          <g key={`yL-${i}`}>
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
      {/* Right axis (cumulative %) */}
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const y = yPctFor(f);
        return (
          <text
            key={`yR-${i}`}
            x={width - PADDING.right + 8}
            y={y + 3}
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            {Math.round(f * 100)}%
          </text>
        );
      })}
      {/* 80% reference line */}
      <line
        x1={PADDING.left}
        x2={width - PADDING.right}
        y1={yPctFor(0.8)}
        y2={yPctFor(0.8)}
        stroke="hsl(var(--accent))"
        strokeDasharray="3 3"
        strokeWidth="1"
      />
      <text
        x={width - PADDING.right - 6}
        y={yPctFor(0.8) - 4}
        textAnchor="end"
        className="fill-accent text-[10px]"
      >
        80%
      </text>
      {/* Bars */}
      {sorted.map((it, i) => {
        const x = PADDING.left + i * (innerW / sorted.length);
        const y = yValueFor(it.value);
        const baseY = yValueFor(0);
        return (
          <rect
            key={`b-${i}`}
            x={x}
            y={y}
            width={barW}
            height={Math.max(0, baseY - y)}
            className={i <= eightyIdx ? 'fill-primary' : 'fill-muted-foreground/30'}
            rx="1.5"
          >
            <title>
              {it.label} · {formatY(it.value)} · {(cumulative[i]! * 100).toFixed(1)}%
            </title>
          </rect>
        );
      })}
      {/* Cumulative line */}
      <path
        d={linePath}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth="2"
        strokeLinecap="round"
      />
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
