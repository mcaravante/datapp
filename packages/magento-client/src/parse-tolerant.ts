import type { z } from 'zod';

/**
 * Pull `items[]` out of a Magento search response (`/rest/V1/customers/search`,
 * `/rest/V1/orders`, etc.) and parse them one-by-one with the given schema.
 * Items that fail validation are skipped; their index + error message land
 * on `console.warn` and the skipped count is returned.
 *
 * Used by every resource's `iterate()` so a single bad row in an 86k
 * customer catalogue doesn't kill the whole sync. Strict callers who
 * actually want to fail on bad data can keep using `search()` directly.
 */
export interface TolerantPage<T> {
  items: T[];
  totalCount: number;
  rawCount: number;
  skipped: number;
}

export function parseSearchPageTolerant<T>(
  raw: unknown,
  itemSchema: z.ZodType<T>,
  context: string,
): TolerantPage<T> {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Magento search response is not an object (${context})`);
  }
  const obj = raw as { items?: unknown; total_count?: unknown };
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const totalCount = typeof obj.total_count === 'number' ? obj.total_count : rawItems.length;

  const items: T[] = [];
  let skipped = 0;
  for (let i = 0; i < rawItems.length; i += 1) {
    const parsed = itemSchema.safeParse(rawItems[i]);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      skipped += 1;
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue ? firstIssue.path.join('.') : '?';
      const msg = firstIssue ? firstIssue.message : 'unknown';
      // eslint-disable-next-line no-console
      console.warn(
        `[magento-client] ${context}: skipped item index=${i.toString()} path=${path} reason="${msg}"`,
      );
    }
  }
  return { items, totalCount, rawCount: rawItems.length, skipped };
}
