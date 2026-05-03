interface MonthBucket {
  /** Short month label, e.g. "Ene", "Feb". */
  label: string;
  current: number;
  previous: number;
}

interface Props {
  months: MonthBucket[];
  formatY?: (v: number) => string;
  height?: number;
}

const PADDING = { top: 16, right: 12, bottom: 28, left: 56 };

/**
 * Side-by-side bars per month, current year in primary tone next to
 * the previous year in muted. The classic YoY view — easy to spot
 * which months are over- or underperforming the prior year at a glance.
 */
export function YoYBars({
  months,
  formatY = (v) => formatCompact(v),
  height = 240,
}: Props): React.ReactElement | null {
  if (months.length === 0) return null;
  const width = 720;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const groupW = innerW / months.length;
  const barW = Math.max(4, (groupW - 4) / 2);
  const max = Math.max(...months.flatMap((m) => [m.current, m.previous]), 0);
  const niceMax = niceCeil(max);

  const yFor = (v: number): number => PADDING.top + innerH - (v / (niceMax || 1)) * innerH;
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
              {formatY(t)}
            </text>
          </g>
        );
      })}
      {months.map((m, i) => {
        const groupX = PADDING.left + i * groupW + (groupW - barW * 2 - 2) / 2;
        const cx = groupX;
        const px = groupX + barW + 2;
        const cy = yFor(m.current);
        const py = yFor(m.previous);
        const baseY = yFor(0);
        return (
          <g key={`g-${i}`}>
            <rect
              x={px}
              y={py}
              width={barW}
              height={Math.max(0, baseY - py)}
              className="fill-muted-foreground/40"
              rx="1.5"
            >
              <title>{`${m.label} · prev: ${formatY(m.previous)}`}</title>
            </rect>
            <rect
              x={cx}
              y={cy}
              width={barW}
              height={Math.max(0, baseY - cy)}
              className="fill-primary"
              rx="1.5"
            >
              <title>{`${m.label} · curr: ${formatY(m.current)}`}</title>
            </rect>
            <text
              x={groupX + barW + 1}
              y={height - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {m.label}
            </text>
          </g>
        );
      })}
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
