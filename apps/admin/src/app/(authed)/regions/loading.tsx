import { SkeletonHeader, SkeletonTable } from '@/components/skeletons';

export default function Loading(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <SkeletonHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="h-[480px] animate-pulse rounded-lg border border-border bg-card" />
        <SkeletonTable rows={12} cols={3} />
      </div>
    </div>
  );
}
