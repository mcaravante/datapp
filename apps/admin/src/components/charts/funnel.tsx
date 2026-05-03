interface Stage {
  id: string;
  label: string;
  value: number;
  /** Tailwind tone classes for the stage bar fill. */
  tone: 'primary' | 'success' | 'destructive' | 'warning';
}

interface Props {
  stages: Stage[];
  formatValue?: (v: number) => string;
  formatRate?: (rate: number) => string;
}

const TONE: Record<Stage['tone'], string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  destructive: 'bg-destructive',
  warning: 'bg-warning',
};

/**
 * Stacked-rate funnel: each stage's bar width is its value divided by
 * the first stage. Stage-to-stage conversion rate appears between
 * stages, so the operator can quickly spot the leaky stage.
 */
export function Funnel({
  stages,
  formatValue = (v) => v.toLocaleString(),
  formatRate = (r) => `${(r * 100).toFixed(1)}%`,
}: Props): React.ReactElement | null {
  if (stages.length === 0) return null;
  const top = stages[0]?.value ?? 0;
  if (top <= 0) return null;

  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const widthPct = (s.value / top) * 100;
        const prev = i > 0 ? stages[i - 1] : null;
        const stepRate = prev && prev.value > 0 ? s.value / prev.value : null;
        return (
          <div key={s.id}>
            {prev && stepRate !== null && (
              <div className="ml-4 mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-3 w-px bg-border" aria-hidden="true" />
                <span className="tabular-nums">
                  {formatRate(stepRate)} {prev.label.toLowerCase()} → {s.label.toLowerCase()}
                </span>
              </div>
            )}
            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{s.label}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatValue(s.value)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${TONE[s.tone]} transition-all`}
                  style={{ width: `${widthPct.toFixed(1)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
