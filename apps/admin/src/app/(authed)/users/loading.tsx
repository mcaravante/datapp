import { PageSkeleton } from '@/components/skeletons';

export default function Loading(): React.ReactElement {
  return <PageSkeleton rows={6} cols={5} />;
}
