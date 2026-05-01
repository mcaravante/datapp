import { PageSkeleton, SkeletonTiles } from '@/components/skeletons';

export default function Loading(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-baseline justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <SkeletonTiles count={3} />
      <PageSkeleton rows={10} cols={5} />
    </div>
  );
}
