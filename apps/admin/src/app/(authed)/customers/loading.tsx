import { PageSkeleton } from '@/components/skeletons';

export default function Loading(): React.ReactElement {
  return <PageSkeleton rows={12} cols={5} />;
}
