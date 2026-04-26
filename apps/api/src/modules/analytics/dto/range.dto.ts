import { z } from 'zod';

/**
 * Common date range query for analytics endpoints. `to` is exclusive
 * (`< to`). Default: last 30 days ending now.
 */
export const AnalyticsRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;

export interface ResolvedRange {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** Equivalent previous period: same length, immediately before `from`. */
  previousFrom: Date;
  previousTo: Date;
}

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function resolveRange(input: AnalyticsRange): ResolvedRange {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
  if (from.getTime() >= to.getTime()) {
    throw new Error("'from' must be earlier than 'to'");
  }
  const length = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime());
  const previousFrom = new Date(from.getTime() - length);
  return { from, to, previousFrom, previousTo };
}
