import { SkeletonHeader } from '@/components/skeletons';

export default function Loading(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <SkeletonHeader />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
      <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
