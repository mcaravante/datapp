interface Props {
  /** Values in chronological order. Empty array → renders nothing. */
  values: number[];
  /**
   * Height of the sparkline in pixels. Width is fluid via the parent's
   * `viewBox` aspect ratio.
   */
  height?: number;
  /** Aspect ratio: width = height * aspect. */
  aspect?: number;
  /** Tailwind tone class (`text-success`, `text-destructive`, …). */
  tone?: string;
}

/**
 * Pure-SVG sparkline. Server-rendered, no client JS, no hydration cost.
 * The path is derived analytically so it works for windows of 7 to 365
 * points without sampling.
 */
export function Sparkline({
  values,
  height = 32,
  aspect = 4,
  tone = 'text-primary',
}: Props): React.ReactElement | null {
  if (values.length === 0) return null;
  const width = height * aspect;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  // Leave 2px headroom top/bottom so strokes don't touch the box edge.
  const yScale = (v: number): number => {
    const norm = (v - min) / range;
    return height - 2 - norm * (height - 4);
  };

  const linePath = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)} ${yScale(v).toFixed(2)}`)
    .join(' ');

  // Closed area under the curve, anchored to the bottom.
  const areaPath = `${linePath} L${(width).toFixed(2)} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`block h-${Math.round(height / 4)} w-full ${tone}`}
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <path d={areaPath} fill="currentColor" opacity="0.12" />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
