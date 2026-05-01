/**
 * Reusable skeleton building blocks for `loading.tsx` files. Server
 * Components — no client JS — they render plain HTML with Tailwind's
 * `animate-pulse` so the user sees instant feedback while a page is
 * fetching from the API.
 */

export function PageSkeleton({
  rows = 10,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <SkeletonHeader />
      <SkeletonTable rows={rows} cols={cols} />
      <SkeletonFooter />
    </div>
  );
}

export function SkeletonHeader(): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted/40" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted/40" />
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 10,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-muted-foreground/30" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3.5">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {Array.from({ length: cols }).map((_, c) => (
                <div
                  key={c}
                  className="h-3.5 animate-pulse rounded bg-muted/50"
                  style={{ animationDelay: `${(r * cols + c) * 30}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonFooter(): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
      <div className="flex gap-2">
        <div className="h-8 w-20 animate-pulse rounded-md bg-muted/40" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted/40" />
        <div className="h-8 w-20 animate-pulse rounded-md bg-muted/40" />
      </div>
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-card p-5 shadow-card"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="h-3 w-20 animate-pulse rounded bg-muted/40" />
          <div className="mt-3 h-7 w-32 animate-pulse rounded bg-muted/60" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <SkeletonHeader />
      <SkeletonTiles count={4} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    </div>
  );
}
