import { SkeletonHeader } from '@/components/skeletons';

export default function Loading(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <SkeletonHeader />
      <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    </div>
  );
}
