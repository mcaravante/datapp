import { PageSkeleton } from '@/components/skeletons';

export default function Loading(): React.ReactElement {
  return <PageSkeleton rows={15} cols={6} />;
}
