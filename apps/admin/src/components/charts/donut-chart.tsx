interface Slice {
  /** Stable React key. */
  id: string;
  label: string;
  value: number;
  /** Tailwind tone class for the slice fill (`fill-primary`, …). */
  tone: string;
}

interface Props {
  slices: Slice[];
  /** Percentage value formatter for the legend; defaults to `12.3%`. */
  formatPct?: (pct: number) => string;
  /** Diameter in px. */
  size?: number;
  /** Stroke width as fraction of size; controls the donut hole. */
  strokeRatio?: number;
}

/**
 * Pure-SVG donut. Slice arcs are computed in the SVG `path` itself, no
 * client JS. Designed for the customer detail page (≤ 6 slices) — past
 * 6 slices the labels start overlapping, so the caller is expected to
 * cap the input to "top 5 + other".
 */
export function DonutChart({
  slices,
  formatPct = (pct) => `${pct.toFixed(1)}%`,
  size = 160,
  strokeRatio = 0.18,
}: Props): React.ReactElement | null {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0 || slices.length === 0) return null;

  const radius = size / 2;
  const inner = radius * (1 - strokeRatio * 2);
  const cx = radius;
  const cy = radius;

  let acc = 0;
  const arcs = slices.map((s) => {
    const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.value;
    const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(startAngle) * radius;
    const y1 = cy + Math.sin(startAngle) * radius;
    const x2 = cx + Math.cos(endAngle) * radius;
    const y2 = cy + Math.sin(endAngle) * radius;
    const xi1 = cx + Math.cos(endAngle) * inner;
    const yi1 = cy + Math.sin(endAngle) * inner;
    const xi2 = cx + Math.cos(startAngle) * inner;
    const yi2 = cy + Math.sin(startAngle) * inner;
    const path = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${xi1.toFixed(2)} ${yi1.toFixed(2)}`,
      `A ${inner} ${inner} 0 ${largeArc} 0 ${xi2.toFixed(2)} ${yi2.toFixed(2)}`,
      'Z',
    ].join(' ');
    return { ...s, path, pct: (s.value / total) * 100 };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label="Donut chart"
      >
        {arcs.map((a) => (
          <path key={a.id} d={a.path} className={a.tone}>
            <title>{`${a.label} — ${formatPct(a.pct)}`}</title>
          </path>
        ))}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {arcs.map((a) => (
          <li key={a.id} className="flex items-baseline gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${a.tone.replace('fill-', 'bg-')}`}
              aria-hidden="true"
            />
            <span className="truncate text-foreground">{a.label}</span>
            <span className="ml-auto tabular-nums text-xs text-muted-foreground">
              {formatPct(a.pct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
