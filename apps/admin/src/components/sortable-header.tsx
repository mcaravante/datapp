import Link from 'next/link';
import { nextSortHref, type SortDir, type SortState } from '@/lib/list-state';

interface Props<F extends string> {
  /** Sort field for this column. Must be in the page's allowed sort list. */
  field: F;
  /** Current sort state for this list (read from `parseSort()`). */
  current: SortState<F>;
  /** Direction applied when the column becomes active for the first time. */
  defaultDir?: SortDir;
  /** Path of the current page, e.g. `/orders`. */
  basePath: string;
  /** All current search params verbatim — preserved on click. */
  currentParams: Record<string, string | string[] | undefined>;
  /** Right-align numeric columns; left-align text. Mirrors `<th className>`. */
  align?: 'left' | 'right';
  /** Header label. */
  children: React.ReactNode;
}

/**
 * Clickable table header that reflects the active sort with a chevron
 * (▲ asc / ▼ desc) and toggles direction on click. Inactive columns
 * show a faded ↕ glyph. Uses Next.js `<Link>` so navigation stays
 * server-rendered and the URL is shareable.
 */
export function SortableHeader<F extends string>({
  field,
  current,
  defaultDir = 'desc',
  basePath,
  currentParams,
  align = 'left',
  children,
}: Props<F>): React.ReactElement {
  const isActive = current.field === field;
  const href = nextSortHref(field, current, defaultDir, basePath, currentParams);
  const justify = align === 'right' ? 'justify-end' : 'justify-start';
  const indicator = isActive ? (current.dir === 'asc' ? '▲' : '▼') : '↕';
  const indicatorClass = isActive ? 'text-foreground' : 'text-muted-foreground/40';

  return (
    <Link
      href={href}
      scroll={false}
      className={`flex items-center gap-1 ${justify} text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground`}
      aria-sort={isActive ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{children}</span>
      <span className={`text-[10px] leading-none ${indicatorClass}`}>{indicator}</span>
    </Link>
  );
}
