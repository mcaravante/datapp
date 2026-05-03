/**
 * Shared helpers for table pages with URL-driven state (sort, pagination,
 * filters). Use across `/orders`, `/customers`, `/products`, etc. so
 * search-param wiring is consistent and not duplicated per page.
 */

export type SortDir = 'asc' | 'desc';

export interface SortState<F extends string> {
  field: F;
  dir: SortDir;
}

/**
 * Pick a typed sort tuple from raw search params, falling back to the
 * default when the field isn't in the allowlist or the direction is
 * malformed. Always returns a value — pages can use it without guards.
 */
export function parseSort<F extends string>(
  raw: { sort?: string; dir?: string },
  allowed: readonly F[],
  fallback: SortState<F>,
): SortState<F> {
  const field = allowed.find((f) => f === raw.sort) as F | undefined;
  const dir: SortDir = raw.dir === 'asc' ? 'asc' : raw.dir === 'desc' ? 'desc' : fallback.dir;
  return field ? { field, dir } : fallback;
}

/**
 * Build a list-page href that preserves the current search params and
 * overrides only the keys passed. Pass `undefined` to drop a key (e.g.
 * resetting `page` when filters change).
 *
 * Values are stringified once. Arrays produce repeated keys — useful
 * for `?status=a&status=b`. Empty strings are dropped to avoid
 * `?q=` polluting the URL.
 */
export function buildListHref(
  basePath: string,
  current: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | string[] | undefined> = {},
): string {
  const merged: Record<string, string | string[] | undefined> = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v.length > 0) params.append(key, v);
      }
    } else if (value.length > 0) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Compute the href for clicking a sortable header. Same field as the
 * current sort: invert direction. Different field: switch and use the
 * column's natural default (desc for numbers/dates, asc for text).
 * Resets `page` to 1 — sort change with a stale page makes no sense.
 */
export function nextSortHref<F extends string>(
  field: F,
  current: SortState<F>,
  defaultDir: SortDir,
  basePath: string,
  currentParams: Record<string, string | string[] | undefined>,
): string {
  const isCurrent = current.field === field;
  const dir: SortDir = isCurrent ? (current.dir === 'asc' ? 'desc' : 'asc') : defaultDir;
  return buildListHref(basePath, currentParams, {
    sort: field,
    dir,
    page: undefined,
  });
}
